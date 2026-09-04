// =============================================================
// Proofly · 计费的读
//
// 只读快照，不做任何写入 —— 余额的每一次变动都必须走 SECURITY DEFINER
// 函数（见 supabase/25）。这里的查询走客户端会话，读到的自然只有自己的行。
//
// 上游：《商业化交互方案 v1.0》第 2 节
// =============================================================

import { FREE_QUOTA, LOW_BALANCE } from "@/config/plan";
import { createClient } from "@/lib/supabase/server";

export type BalanceView = {
  available: number;
  held: number;
  /** 低于阈值：顶栏变橙，展开面板顶部提示一次 */
  low: boolean;
  zero: boolean;
  /** 本月还剩几次免费记录。用「还剩」不用「已用」—— 剩余感比消耗感友好 */
  freeChatLeft: number;
  freeChatLimit: number;
};

export async function getBalance(): Promise<BalanceView> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quota_counters")
    .select("credits_available,credits_held,free_chat_month,free_chat_used")
    .maybeSingle();

  const available = data?.credits_available ?? 0;
  const limit = FREE_QUOTA.chat_record_per_month;

  // 月度是惰性重置的：库里还留着上个月的计数很正常，读的时候按当月算。
  const thisMonth = new Date().toISOString().slice(0, 7);
  const used = data?.free_chat_month === thisMonth ? (data?.free_chat_used ?? 0) : 0;

  return {
    available,
    held: data?.credits_held ?? 0,
    low: available > 0 && available < LOW_BALANCE,
    zero: available === 0,
    freeChatLeft: Math.max(limit - used, 0),
    freeChatLimit: limit,
  };
}

/**
 * 余额面板里的构成：购买的永不过期，赠送的有到期时间。
 *
 * 到期时间必须显示，并说明「用的时候会先扣快过期的」——
 * 扣减顺序是先扣即将过期的（技术方案 2.2），用户看得见才不会觉得乱扣。
 */
export type EntitlementView = {
  purchased: number;
  granted: number;
  grantExpiresAt: string | null;
};

export async function getEntitlements(): Promise<EntitlementView> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entitlements")
    .select("source,credits_total,credits_used,expires_at")
    .order("expires_at", { ascending: true, nullsFirst: false });

  let purchased = 0;
  let granted = 0;
  let grantExpiresAt: string | null = null;
  const now = Date.now();

  for (const e of data ?? []) {
    const left = e.credits_total - e.credits_used;
    if (left <= 0) continue;
    if (e.expires_at && Date.parse(e.expires_at) < now) continue;
    if (e.source === "purchase" || e.source === "redeem") {
      purchased += left;
    } else {
      granted += left;
      if (e.expires_at && (grantExpiresAt === null || e.expires_at < grantExpiresAt)) {
        grantExpiresAt = e.expires_at;
      }
    }
  }
  return { purchased, granted, grantExpiresAt };
}
