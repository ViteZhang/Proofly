// =============================================================
// Proofly · 计费包装器
//
// 所有付费动作的唯一入口。业务代码不许自己调 hold / settle /
// release，也不许调完 LLM 再自己扣分 —— 那样每接一个新动作就要把
// 九步顺序重写一遍，迟早漏掉其中一步，而漏掉的那步一定是退款。
//
// 九步顺序（技术方案 3.1，一步都不许调换）：
//
//   1  前置检查：体检有 blocking → 返回 BLOCKED，**不 HOLD**
//   2  永久免费判定：命中白名单 → 直接执行，记 free_forever
//   3  限次免费判定：随手记本月未超额 → 免费执行，计数 +1
//   4  重生成判定：同指纹 + 24h 内 + 未超 3 次 → 免费执行
//   5  HOLD 预扣
//   6  执行
//   7  完整性校验：validate 返回 false → RELEASE
//   8  SETTLE
//   9  任何异常 → RELEASE
//
// 为什么必须是预扣而不是「先扣了失败再退」或「跑完再扣」：面试题包
// 要跑十分钟，期间用户可能发起别的动作。跑完再扣，结算时余额可能
// 已经不够；先扣再退，退款本身也会失败，而且用户会看见余额跳变。
//
// 这个文件不 import src/lib/llm 的任何东西：熔断是安全机制，计费是
// 商业机制，两边互不知道对方存在（技术方案第 5 节，有架构测试盯着）。
// token 数由调用方通过 ctx.report() 交回来。
//
// 上游：《商业化技术方案 v1.0》3.1 ·《商业化 C1》切片 C1.4
// =============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { ACTION_PRICES, FREE_FOREVER, FREE_QUOTA, LIMITS } from "@/config/plan";
import { createSink, totals, withUsageSink } from "@/lib/telemetry/usage";
import type { Database, FreeReason, Json } from "@/types/database";

export type BillingClient = SupabaseClient<Database>;

/** 一次动作烧掉的东西。由 run() 通过 ctx.report() 交回。 */
export type UsageMeta = {
  llmCallIds?: string[];
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  durationMs?: number;
};

export type RunContext = {
  /** 免费分支下为 null */
  holdId: string | null;
  /** 把这次实际烧掉的 token 交回来。失败的那次也要交 —— 见下面 RELEASE。 */
  report: (m: UsageMeta) => void;
};

export type BillingResult<T> =
  | {
      ok: true;
      data: T;
      charged: number;
      freeReason?: FreeReason;
      balanceAfter: number;
    }
  | {
      ok: false;
      code: "INSUFFICIENT" | "BLOCKED" | "FAILED" | "CANCELLED";
      required?: number;
      available?: number;
      message: string;
    };

export type WithCreditsOpts<T> = {
  actionCode: string;
  userId: string;
  /** 动态定价用（文档解析按段数与扫描页数算）。不传则取标价。 */
  credits?: number;
  /** 参与重生成窗口的动作要传，见 fingerprint.ts */
  fingerprint?: string;
  /** 用户 + 动作 + 指纹 + 客户端请求 id。防重复点击造成双份预扣。 */
  idempotencyKey: string;
  /** 异步长任务：预扣活 25 分钟而不是 5 分钟 */
  isAsync?: boolean;
  jobRef?: string | null;
  /**
   * 完整性校验。返回 false 即 RELEASE。
   *
   * 面试题包被 max_tokens 截断过（商业化方案 9.4 警告二）。
   * 付了 25 分拿到半个题包是最差的一种体验，比直接失败还差 ——
   * 失败至少钱还在。
   */
  validate?: (result: T) => boolean;
  run: (ctx: RunContext) => Promise<T>;
  /**
   * 成本并进了另一个动作的标价（例如 JD 拆解并进「解析并评估」）。
   * 不 HOLD、不扣分，但写一条 bundled 的留痕 —— 它确实烧了 token。
   */
  bundled?: boolean;
  /** 只给单测注入假客户端用。业务代码不要传。 */
  client?: BillingClient;
};

/**
 * 每日对话上限的话术。
 *
 * 要说清楚这不是积分问题 —— 否则用户第一反应是「充钱就能继续」，
 * 而事实是充了也不行。
 */
export const DAILY_CAP_MESSAGE =
  "今天聊得有点多，明天再来吧。这不是积分问题——我们对每天的对话次数有个上限，防止异常调用。";

/** run() 主动放弃时抛这个，计费侧按「用户取消」处理，不算失败。 */
export class CancelledError extends Error {
  constructor(message = "用户取消") {
    super(message);
    this.name = "CancelledError";
  }
}

const FREE_SET: ReadonlySet<string> = new Set(FREE_FOREVER);

/**
 * 受体检阻断的动作。
 *
 * 只挡「产出对外材料」的动作。文档解析、随手记这些不挡 —— 阻断项
 * 本来就要靠它们去修，连修的路都堵上，用户就被锁死在体检页了。
 */
/** 走每日对话上限的动作。记录与闲聊都算一轮。 */
const CHAT_ACTIONS: ReadonlySet<string> = new Set(["chat_record", "chat_smalltalk"]);

const BLOCKING_GATED: ReadonlySet<string> = new Set([
  "resume_baseline",
  "resume_delta",
  "resume_block",
  "interview_kit",
]);

function priceOf(actionCode: string, override?: number): number {
  if (override !== undefined) return override;
  const p = (ACTION_PRICES as Record<string, number>)[actionCode];
  return p ?? 0;
}

function metaToJson(m: UsageMeta): Json {
  return {
    llm_call_ids: m.llmCallIds ?? [],
    input_tokens: m.inputTokens ?? null,
    output_tokens: m.outputTokens ?? null,
    cost_cents: m.costCents ?? null,
    duration_ms: m.durationMs ?? null,
  } as Json;
}

export async function withCredits<T>(opts: WithCreditsOpts<T>): Promise<BillingResult<T>> {
  const { actionCode, userId, idempotencyKey, fingerprint, run, validate } = opts;
  // 动态 import：这个模块要能在 Next 之外被单测加载，而
  // supabase/server 一进来就拉 next/headers。
  const supabase =
    opts.client ??
    (((await (await import("@/lib/supabase/server")).createClient()) as unknown) as BillingClient);

  // 环境收集单：run() 里发出的每次模型调用都会自动记进来，业务代码
  // 一个字不用改。ctx.report() 仍然可用，用来补收集单看不到的东西
  // （比如日后接上单价表算出的 cost_cents），显式传的优先。
  const sink = createSink();
  let reported: UsageMeta = {};
  const ctx = (holdId: string | null): RunContext => ({
    holdId,
    report: (m) => {
      reported = { ...reported, ...m };
    },
  });

  /** 动作执行到此刻为止的用量。失败路径也要调它 —— 失败一样烧 token。 */
  const usageJson = (): Json => {
    const t = totals(sink);
    return metaToJson({
      inputTokens: reported.inputTokens ?? t.inputTokens ?? undefined,
      outputTokens: reported.outputTokens ?? t.outputTokens ?? undefined,
      durationMs: reported.durationMs ?? (t.callCount > 0 ? t.durationMs : undefined),
      costCents: reported.costCents,
      llmCallIds: reported.llmCallIds,
    });
  };

  const execute = (holdId: string | null): Promise<T> =>
    withUsageSink(sink, () => run(ctx(holdId)));

  const balance = async (): Promise<number> => {
    const { data } = await supabase
      .from("quota_counters")
      .select("credits_available")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.credits_available ?? 0;
  };

  const freePath = async (reason: FreeReason): Promise<BillingResult<T>> => {
    try {
      const data = await execute(null);
      if (validate && !validate(data)) {
        await supabase.rpc("log_free_usage", {
          p_user: userId,
          p_action: actionCode,
          p_reason: reason,
          p_fingerprint: fingerprint ?? null,
          p_succeeded: false,
          p_usage_meta: usageJson(),
        });
        return { ok: false, code: "FAILED", message: "生成结果不完整，请重试。" };
      }
      await supabase.rpc("log_free_usage", {
        p_user: userId,
        p_action: actionCode,
        p_reason: reason,
        p_fingerprint: fingerprint ?? null,
        p_succeeded: true,
        p_usage_meta: usageJson(),
      });
      return { ok: true, data, charged: 0, freeReason: reason, balanceAfter: await balance() };
    } catch (e) {
      // 免费动作也要留失败记录：免费不等于零成本，烧掉的 token 一样要能查。
      await supabase.rpc("log_free_usage", {
        p_user: userId,
        p_action: actionCode,
        p_reason: reason,
        p_fingerprint: fingerprint ?? null,
        p_succeeded: false,
        p_usage_meta: usageJson(),
      });
      if (e instanceof CancelledError) {
        return { ok: false, code: "CANCELLED", message: e.message };
      }
      return { ok: false, code: "FAILED", message: (e as Error).message };
    }
  };

  // ---- 1 前置检查 ----
  if (BLOCKING_GATED.has(actionCode)) {
    const { count } = await supabase
      .from("check_results")
      .select("id", { count: "exact", head: true })
      .eq("level", "blocking")
      .is("ignored_at", null)
      .is("resolved_at", null);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        code: "BLOCKED",
        message: "体检里还有阻断项没处理，先去解决再生成。",
      };
    }
  }

  // ---- 2 永久免费 ----
  if (FREE_SET.has(actionCode)) return freePath("free_forever");

  // 并入别的动作计费：不 HOLD，但留痕记的是 bundled 而不是 free_forever ——
  // 「永久免费 = 纯代码功能」这个语义不能被一个烧模型的动作混进来。
  if (opts.bundled) return freePath("bundled");

  // ---- 3 反滥用与限次免费 ----
  //
  // 日上限先于一切对话分支：闲聊不计费也有真实成本（约 ¥0.008 一次），
  // 得有个刹车。它不看余额、不扣分，付费用户撞上一样被拦 ——
  // 这是防刷，不是计费。
  if (CHAT_ACTIONS.has(actionCode)) {
    const { data: allowed } = await supabase.rpc("bump_chat_day", {
      p_user: userId,
      p_cap: FREE_QUOTA.chat_daily_hard_cap,
    });
    if (!allowed) return { ok: false, code: "BLOCKED", message: DAILY_CAP_MESSAGE };
  }

  // 闲聊无限免费
  if (actionCode === "chat_smalltalk") return freePath("free_forever");

  let credits = priceOf(actionCode, opts.credits);
  let billedAction = actionCode;
  if (actionCode === "chat_record") {
    const { data: gotFree } = await supabase.rpc("consume_free_chat", {
      p_user: userId,
      p_limit: FREE_QUOTA.chat_record_per_month,
    });
    if (gotFree) return freePath("free_quota");
    // 额度用完，按超额价走计费分支
    billedAction = "chat_record_overage";
    credits = priceOf("chat_record_overage", opts.credits);
  }

  // ---- 4 重生成窗口 ----
  if (credits > 0 && fingerprint) {
    const { data: regenFree } = await supabase.rpc("check_regen_free", {
      p_user: userId,
      p_action: billedAction,
      p_fingerprint: fingerprint,
      p_window_hours: LIMITS.regen_free_window_hours,
      p_max: LIMITS.regen_free_max_times,
    });
    if (regenFree) return freePath("regen_window");
  }

  // 标价为 0 又不在白名单里：多半是配置漏了，别默默免费跑掉。
  if (credits <= 0) return freePath("free_forever");

  // ---- 5 HOLD ----
  const { data: held, error: holdErr } = await supabase.rpc("hold_credits", {
    p_user: userId,
    p_action: billedAction,
    p_credits: credits,
    p_key: idempotencyKey,
    p_fingerprint: fingerprint ?? null,
    p_ttl_min: opts.isAsync ? LIMITS.hold_ttl_async_min : LIMITS.hold_ttl_sync_min,
    p_job_ref: opts.jobRef ?? null,
  });

  if (holdErr) {
    if (holdErr.message.includes("INSUFFICIENT_CREDITS")) {
      const available = await balance();
      return {
        ok: false,
        code: "INSUFFICIENT",
        required: credits,
        available,
        message: `这个动作要 ${credits} 分，你还有 ${available} 分。`,
      };
    }
    return { ok: false, code: "FAILED", message: holdErr.message };
  }

  const hold = held as { hold_id: string; release_token: string; balance_after: number };
  const release = async (reason: string) => {
    await supabase.rpc("release_hold", {
      p_hold: hold.hold_id,
      p_reason: reason,
      p_release_token: hold.release_token,
      p_usage_meta: usageJson(),
    });
  };

  try {
    // ---- 6 执行 ----
    const data = await execute(hold.hold_id);

    // ---- 7 完整性校验 ----
    if (validate && !validate(data)) {
      await release("incomplete");
      return {
        ok: false,
        code: "FAILED",
        message: "生成结果不完整，已退回积分。重试一次通常就好了。",
      };
    }

    // ---- 8 SETTLE ----
    await supabase.rpc("settle_hold", {
      p_hold: hold.hold_id,
      p_usage_meta: usageJson(),
    });
    if (fingerprint) {
      await supabase.rpc("tag_usage_fingerprint", {
        p_hold: hold.hold_id,
        p_fingerprint: fingerprint,
      });
    }
    return { ok: true, data, charged: credits, balanceAfter: hold.balance_after };
  } catch (e) {
    // ---- 9 任何异常 → RELEASE ----
    const cancelled = e instanceof CancelledError;
    await release(cancelled ? "cancelled" : "failed");
    return {
      ok: false,
      code: cancelled ? "CANCELLED" : "FAILED",
      message: (e as Error).message,
    };
  }
}
