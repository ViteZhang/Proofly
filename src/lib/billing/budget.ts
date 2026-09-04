// =============================================================
// Proofly · 预算护栏
//
// 免费动作不是没有成本，只是成本落在我们头上。没有闸门的话，
// 一个脚本一晚上就能把一个月的预算烧完。
//
// 但闸门的位置要选对：**只掐获客支出，不掐留存支出。**
//
//   新注册赠送        → 触顶暂停发放
//   已有用户免费对话  → 照常
//   永久免费纯代码    → 不受影响（本来零成本）
//   付费动作          → 不受影响
//
// 切断已有用户的免费对话，省下的是几毛钱，毁掉的是档案沉淀 ——
// 而档案沉淀正是这个产品全部价值的来源。
//
// 上游：《商业化技术方案 v1.0》0.4、4.3 ·《商业化 C1》切片 C1.6
// =============================================================

import { BUDGET, FREE_QUOTA } from "@/config/plan";
import type { BillingClient } from "./withCredits";

async function db(client?: BillingClient): Promise<BillingClient> {
  if (client) return client;
  return (await (await import("@/lib/supabase/server")).createClient()) as unknown as BillingClient;
}

export type BudgetVerdict = {
  ok: boolean;
  reason?: string;
  spentCents: number;
  capCents: number;
};

/**
 * 今天还发得起吗。
 *
 * 只读，不改计数。**返回 false 只影响新注册赠送** —— 别拿它去挡
 * 已有用户的动作，那不是这个函数的用途。
 */
export async function checkGlobalBudget(
  estimatedCostCents: number,
  client?: BillingClient,
): Promise<BudgetVerdict> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("check_global_budget", {
    p_est_cents: estimatedCostCents,
    p_cap_cents: BUDGET.free_daily_cap_cents,
  });
  if (error) {
    // 护栏读不出来时放行：把它做成「读失败就停发」等于给自己装了个
    // 单点故障，而超支的代价远小于新用户一进来就领不到额度。
    return { ok: true, reason: "BUDGET_UNAVAILABLE", spentCents: 0, capCents: BUDGET.free_daily_cap_cents };
  }
  const v = data as { ok: boolean; spent_cents: number; cap_cents: number };
  return {
    ok: v.ok,
    reason: v.ok ? undefined : "BUDGET_CAPPED",
    spentCents: Number(v.spent_cents),
    capCents: Number(v.cap_cents),
  };
}

/**
 * 记一笔免费支出。
 *
 * 平时不用手动调 —— 免费动作的成本由 log_free_usage 在同一个事务里
 * 顺手记掉了（见 27_billing_budget.sql）。这里留着给服务端脚本用。
 *
 * 它**没有授权给 authenticated**：客户端要是能往全站计数器里灌数，
 * 一个人就能把所有新用户的赠送额度掐掉。
 */
export async function recordFreeSpend(
  actualCostCents: number,
  client?: BillingClient,
): Promise<void> {
  const supabase = await db(client);
  await supabase.rpc("record_free_spend", { p_cost_cents: actualCostCents });
}

export type SignupGrantResult = {
  ok: boolean;
  granted: number;
  reason?: string;
};

/**
 * 首次登录时领注册赠送。
 *
 * 幂等：领过了再调只会拿到 granted=0。触顶时不置「已发放」标记 ——
 * 这笔只是没发成，不是发过了，护栏恢复后下次进来还能领。
 */
export async function claimSignupGrant(
  userId: string,
  client?: BillingClient,
): Promise<SignupGrantResult> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("claim_signup_grant", {
    p_user: userId,
    p_credits: FREE_QUOTA.signup_grant_credits,
    p_cap_cents: BUDGET.free_daily_cap_cents,
    p_est_cents: BUDGET.signup_grant_est_cost_cents,
  });
  if (error) return { ok: false, granted: 0, reason: error.message };
  const v = data as { ok: boolean; granted: number; reason?: string };
  return { ok: v.ok, granted: v.granted ?? 0, reason: v.reason };
}
