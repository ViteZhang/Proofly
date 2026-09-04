// =============================================================
// Proofly · 长任务的计费
//
// 同步动作用 withCredits 就够了：预扣、执行、结算在一个调用里走完。
// 长任务不行 —— 文档解析跑在 after() 里，面试题包要跑十分钟。
// 预扣发生在「用户点确认」那一刻，结算发生在几分钟后的另一次执行里。
//
// 中间那段时间 release_token 存在服务端专用的 job_holds 表里，
// 客户端碰不到（见 supabase/31）。这里只按 job_ref 说话。
//
// 上游：《商业化技术方案 v1.0》3.3 ·《商业化 C2》2.1、2.2
// =============================================================

import { ACTION_LABELS, ACTION_PRICES, LIMITS } from "@/config/plan";
import type { UsageTotals } from "@/lib/telemetry/usage";
import type { Json } from "@/types/database";

import { currentUserId } from "./action";

async function db() {
  return (await import("@/lib/supabase/server")).createClient();
}

export type HoldOutcome =
  | { ok: true; holdId: string; balanceAfter: number; reused: boolean }
  | {
      ok: false;
      code: "INSUFFICIENT" | "FAILED";
      error: string;
      required?: number;
      available?: number;
    };

/**
 * 给一个作业预扣。
 *
 * 同一个 job_ref 重复调直接返回原来那笔 —— **断点续跑就靠这条**：
 * 重试时复用同一个 hold，不重复扣分（C2 七、5）。
 */
export async function holdForJob(opts: {
  jobRef: string;
  actionCode: string;
  credits?: number;
  idempotencyKey: string;
  fingerprint?: string;
  ttlMin?: number;
}): Promise<HoldOutcome> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, code: "FAILED", error: "登录状态过期了，刷新一下页面" };

  const credits =
    opts.credits ?? (ACTION_PRICES as Record<string, number>)[opts.actionCode] ?? 0;

  const supabase = await db();
  const { data, error } = await supabase.rpc("hold_for_job", {
    p_user: userId,
    p_job_ref: opts.jobRef,
    p_action: opts.actionCode,
    p_credits: credits,
    p_key: opts.idempotencyKey,
    p_fingerprint: opts.fingerprint ?? null,
    p_ttl_min: opts.ttlMin ?? LIMITS.hold_ttl_async_min,
  });

  if (error) {
    if (error.message.includes("INSUFFICIENT_CREDITS")) {
      const { data: q } = await supabase
        .from("quota_counters")
        .select("credits_available")
        .maybeSingle();
      const available = q?.credits_available ?? 0;
      const label = ACTION_LABELS[opts.actionCode] ?? "这个动作";
      return {
        ok: false,
        code: "INSUFFICIENT",
        required: credits,
        available,
        error: `${label}需要 ${credits} 分，你还有 ${available} 分。差 ${credits - available} 分。`,
      };
    }
    return { ok: false, code: "FAILED", error: error.message };
  }

  const v = data as { hold_id: string; balance_after: number; reused: boolean };
  return { ok: true, holdId: v.hold_id, balanceAfter: v.balance_after, reused: v.reused };
}

function usageJson(u?: UsageTotals): Json {
  return {
    llm_call_ids: [],
    input_tokens: u?.inputTokens ?? null,
    output_tokens: u?.outputTokens ?? null,
    cost_cents: null,
    duration_ms: u && u.callCount > 0 ? u.durationMs : null,
  } as Json;
}

/**
 * 结算。
 *
 * actualCredits 小于预扣值时差额退回；大于预扣值时按预扣值收 ——
 * 预估偏差是我们的问题，不该用户买单（C2 2.1）。
 */
export async function settleJob(
  jobRef: string,
  actualCredits?: number,
  usage?: UsageTotals,
): Promise<{ ok: boolean; charged: number; refunded: number }> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("settle_job", {
    p_job_ref: jobRef,
    p_actual_credits: actualCredits ?? null,
    p_usage_meta: usageJson(usage),
  });
  if (error) return { ok: false, charged: 0, refunded: 0 };
  const v = data as { ok: boolean; charged?: number; refunded?: number };
  return { ok: v.ok, charged: v.charged ?? 0, refunded: v.refunded ?? 0 };
}

/** 释放。失败、超时、用户取消都走这里。 */
export async function releaseJob(
  jobRef: string,
  reason: string,
  usage?: UsageTotals,
): Promise<{ ok: boolean; refunded: number }> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("release_job", {
    p_job_ref: jobRef,
    p_reason: reason,
    p_usage_meta: usageJson(usage),
  });
  if (error) return { ok: false, refunded: 0 };
  const v = data as { ok: boolean; refunded?: number };
  return { ok: v.ok, refunded: v.refunded ?? 0 };
}

export type JobHoldStatus =
  | { found: false }
  | { found: true; status: "held" | "settled" | "released"; credits: number; actionCode: string };

/** 界面靠它显示「预扣中」。 */
export async function jobHoldStatus(jobRef: string): Promise<JobHoldStatus> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("job_hold_status", { p_job_ref: jobRef });
  if (error || !data) return { found: false };
  const v = data as { found: boolean; status?: string; credits?: number; action_code?: string };
  if (!v.found) return { found: false };
  return {
    found: true,
    status: (v.status ?? "held") as "held" | "settled" | "released",
    credits: v.credits ?? 0,
    actionCode: v.action_code ?? "",
  };
}
