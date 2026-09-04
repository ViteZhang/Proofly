// =============================================================
// Proofly · 把计费接进 Server Action
//
// withCredits 是引擎，这里是接头。业务动作只需要说清「我是哪个动作、
// 这次的输入指纹是什么」，剩下的九步顺序、退分、留痕都不用管。
//
// 一条约定：**run 里失败就抛 ActionFailed**。抛出去才会走 RELEASE ——
// 返回一个 { ok:false } 在计费层看来是「成功执行完毕」，钱就扣掉了。
// 这是接入时最容易踩的一脚，所以 billedAction 直接把 ActionResult
// 收进来替业务代码翻译。
//
// 上游：《商业化 C2》切片 C2.1
// =============================================================

import { ACTION_LABELS, ACTION_PRICES } from "@/config/plan";
import { PROMPT_VERSION } from "@/config/prompts";
import { fail, type ActionResult } from "@/lib/domain";
import type { FreeReason } from "@/types/database";

import { computeFingerprint, type FingerprintCtx } from "./fingerprint";
import { CancelledError, withCredits, type RunContext } from "./withCredits";

/** run 里业务判定失败时抛它。计费层会 RELEASE，然后把这条消息原样带回。 */
// 动态 import：这个模块要能在 Next 之外被单测加载，而
// supabase/server 一进来就拉 next/headers。
async function db() {
  return (await import("@/lib/supabase/server")).createClient();
}

export class ActionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionFailed";
  }
}

export type BilledFailure = {
  ok: false;
  error: string;
  code: "INSUFFICIENT" | "BLOCKED" | "FAILED" | "CANCELLED";
  /** INSUFFICIENT 时带上，界面按交互方案 3.2 渲染 */
  required?: number;
  available?: number;
};

export type BilledOk<T> = {
  ok: true;
  data: T;
  /** 这次实际消耗，0 表示免费 */
  charged: number;
  freeReason?: FreeReason;
  balanceAfter: number;
};

/**
 * 形状上是 ActionResult 的超集：失败分支仍然是 { ok:false, error }，
 * 已有的调用方只看这两个字段，接入后不用改。
 */
export type BilledResult<T> = BilledOk<T> | BilledFailure;

export async function currentUserId(): Promise<string | null> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type BilledActionOpts<T> = {
  actionCode: string;
  /** 动态定价用（文档解析按段数算）。不传取标价。 */
  credits?: number;
  fingerprint?: string;
  /** 同一个动作 + 同一份输入应当得到同一个 key，重复点击才不会双扣。 */
  idempotencyKey: string;
  isAsync?: boolean;
  jobRef?: string | null;
  /** 成本并进了别的动作的标价 —— 记一笔 bundled，不收费。 */
  bundled?: boolean;
  validate?: (result: T) => boolean;
  run: (ctx: RunContext) => Promise<ActionResult<T>>;
};

/**
 * 余额不足的话术。
 *
 * 交互方案 3.2：不要只说「余额不足」，要说清差多少。
 * 「去充值 / 有兑换码」两个入口和「免费功能不受影响」那句在界面上给，
 * 这里只负责把数字说准。
 */
export function insufficientMessage(actionCode: string, required: number, available: number): string {
  const label = ACTION_LABELS[actionCode] ?? "这个动作";
  return `${label}需要 ${required} 分，你还有 ${available} 分。差 ${required - available} 分。`;
}

export async function billedAction<T>(
  opts: BilledActionOpts<T>,
): Promise<BilledResult<T>> {
  const userId = await currentUserId();
  if (!userId) {
    return { ok: false, error: "登录状态过期了，刷新一下页面", code: "FAILED" };
  }

  const res = await withCredits<T>({
    actionCode: opts.actionCode,
    userId,
    credits: opts.bundled ? 0 : opts.credits,
    bundled: opts.bundled,
    fingerprint: opts.fingerprint,
    idempotencyKey: opts.idempotencyKey,
    isAsync: opts.isAsync,
    jobRef: opts.jobRef,
    validate: opts.validate,
    run: async (ctx) => {
      const r = await opts.run(ctx);
      // 必须抛。返回失败在计费层看来是「跑完了」，钱就扣掉了。
      if (!r.ok) throw new ActionFailed(r.error);
      return r.data;
    },
  });

  if (res.ok) {
    return {
      ok: true,
      data: res.data,
      charged: res.charged,
      freeReason: res.freeReason,
      balanceAfter: res.balanceAfter,
    };
  }

  if (res.code === "INSUFFICIENT") {
    const required = res.required ?? ACTION_PRICES[opts.actionCode as never] ?? 0;
    const available = res.available ?? 0;
    return {
      ok: false,
      code: "INSUFFICIENT",
      required,
      available,
      error: insufficientMessage(opts.actionCode, required, available),
    };
  }

  return { ok: false, code: res.code, error: res.message };
}

/** 免费动作的留痕。不 HOLD、不扣分，但成本要看得见。 */
export async function logFree(
  actionCode: string,
  reason: FreeReason = "free_forever",
  succeeded = true,
): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const supabase = await db();
  await supabase.rpc("log_free_usage", {
    p_user: userId,
    p_action: actionCode,
    p_reason: reason,
    p_succeeded: succeeded,
  });
}

/** 把计费结果降级成普通 ActionResult，给还没改造界面的调用方用。 */
export function toActionResult<T>(r: BilledResult<T>): ActionResult<T> {
  return r.ok ? { ok: true, data: r.data } : fail(r.error);
}

export { CancelledError };

// =============================================================
// 指纹与幂等键
// =============================================================

/**
 * 补齐指纹上下文里那些要查库的部分，然后算指纹。
 *
 * 事实层与策略层的版本号在 quota_counters 上（由触发器维护）；
 * JD 的版本用 jds.updated_at —— 改了 JD 文本或要求项都会推进它。
 */
export async function fingerprintFor(
  actionCode: string,
  ctx: Omit<FingerprintCtx, "factRevision" | "strategyRevision" | "jdRevision" | "promptVersion">,
): Promise<string> {
  const supabase = await db();
  const { data: counter } = await supabase
    .from("quota_counters")
    .select("fact_revision,strategy_revision")
    .maybeSingle();

  let jdRevision: number | null = null;
  if (ctx.jdId) {
    const { data: jd } = await supabase
      .from("jds")
      .select("updated_at")
      .eq("id", ctx.jdId)
      .maybeSingle();
    jdRevision = jd?.updated_at ? Date.parse(jd.updated_at) : null;
  }

  return computeFingerprint(actionCode, {
    ...ctx,
    factRevision: counter?.fact_revision ?? 0,
    strategyRevision: counter?.strategy_revision ?? 0,
    jdRevision,
    promptVersion: PROMPT_VERSION[actionCode] ?? "v0",
  });
}

/** 双击保护的时间窗。界面接上 clientReqId 之前（C2.7），用它兜住。 */
const DOUBLE_CLICK_WINDOW_MS = 10_000;

/**
 * 幂等键。
 *
 * 有 clientReqId 就用它 —— 那是最准的：同一次点击重放多少遍都是一笔。
 * 没有就退回时间桶：10 秒内的重复请求算同一笔，之后允许再跑一次。
 *
 * **不能用「动作 + 输入」做永久键**：那样第二次合法的重新生成会命中
 * 上一笔已结算的 hold，然后结算失败报错，用户莫名其妙。
 */
export function idempotencyKey(
  actionCode: string,
  parts: (string | null | undefined)[],
  clientReqId?: string,
): string {
  const tail =
    clientReqId ?? String(Math.floor(Date.now() / DOUBLE_CLICK_WINDOW_MS));
  return [actionCode, ...parts.filter(Boolean), tail].join(":");
}
