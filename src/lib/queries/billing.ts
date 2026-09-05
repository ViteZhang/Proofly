// =============================================================
// Proofly · 计费的读
//
// 只读快照，不做任何写入 —— 余额的每一次变动都必须走 SECURITY DEFINER
// 函数（见 supabase/25）。这里的查询走客户端会话，读到的自然只有自己的行。
//
// 上游：《商业化交互方案 v1.0》第 2 节
// =============================================================

import { ACTION_LABELS, FREE_QUOTA, LOW_BALANCE } from "@/config/plan";
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
    // 分桶看的是「会不会过期」，不是「从哪来的」。兑换码现在可以带
    // 有效期（补偿码可能只给当季），把它按 source 一律算进「永不过期」
    // 那一栏，页面上那句「永不过期」就成了假话。
    if ((e.source === "purchase" || e.source === "redeem") && e.expires_at === null) {
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

// =============================================================
// 消费记录
// =============================================================

export type LedgerKind = "spend" | "refund" | "free" | "grant";

export type LedgerRow = {
  id: string;
  at: string;
  /** 动作或来源的中文名 */
  label: string;
  kind: LedgerKind;
  /** 变动的绝对值。kind 决定正负与措辞。 */
  amount: number;
  /** 说明列：为什么免费、为什么退回、哪张兑换码 */
  note: string | null;
};

const GRANT_LABEL: Record<string, string> = {
  purchase: "充值到账",
  redeem: "兑换码到账",
  grant_signup: "注册赠送",
  grant_monthly: "月度赠送",
  adjust: "人工调整",
};

const FREE_NOTE: Record<string, string> = {
  free_forever: "永久免费",
  free_quota: "本月免费额度",
  regen_window: "24h 内未改事实",
  budget_grace: "免费额度",
  bundled: "并入上一步的动作",
};

/**
 * 一条流水。
 *
 * 来源有两处：usage_logs（消费与退回）与 entitlements（到账）。
 * 只看其中一处都会漏 —— 用户不会分「消费记录」和「充值记录」，
 * 他要的是一条时间线。
 *
 * **失败退回必须出现在这里。** 这是「失败不扣分」这个承诺的可见证据，
 * 用户能亲眼看到它被执行，比任何声明都有效。
 */
export async function listLedger(opts: {
  limit?: number;
  /** 上一页最后一行的时间，向下加载用 */
  before?: string | null;
  /** 默认不显示永久免费的动作，否则流水会被它们淹没 */
  includeFree?: boolean;
} = {}): Promise<LedgerRow[]> {
  const limit = opts.limit ?? 30;
  const supabase = await createClient();

  let usageQ = supabase
    .from("usage_logs")
    .select("id,created_at,action_code,credits_charged,free_reason,succeeded,hold_id")
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts.before) usageQ = usageQ.lt("created_at", opts.before);
  if (!opts.includeFree) {
    // 永久免费与并入别的动作的那些默认折叠。留下的是「花过钱」
    // 和「本该花钱但没花」两类 —— 那才是用户想核对的。
    usageQ = usageQ.not("free_reason", "in", '("free_forever","bundled")');
  }

  let grantQ = supabase
    .from("entitlements")
    .select("id,created_at,source,credits_total,note")
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts.before) grantQ = grantQ.lt("created_at", opts.before);

  const [{ data: usage }, { data: grants }] = await Promise.all([usageQ, grantQ]);

  // 退回的金额不在 usage_logs 上（那一行 credits_charged 是 0），
  // 在它对应的那笔预扣上。一次取回来，别在循环里逐条查。
  const holdIds = (usage ?? []).filter((u) => !u.succeeded && u.hold_id).map((u) => u.hold_id!);
  const holdCredits = new Map<string, number>();
  if (holdIds.length > 0) {
    const { data: holds } = await supabase
      .from("credit_holds")
      .select("id,credits")
      .in("id", holdIds);
    for (const h of holds ?? []) holdCredits.set(h.id, h.credits);
  }

  const rows: LedgerRow[] = [];

  for (const u of usage ?? []) {
    const label = ACTION_LABELS[u.action_code] ?? u.action_code;
    if (!u.succeeded) {
      rows.push({
        id: u.id,
        at: u.created_at,
        label,
        kind: "refund",
        amount: u.hold_id ? (holdCredits.get(u.hold_id) ?? 0) : 0,
        note: "生成失败，已退回",
      });
      continue;
    }
    if (u.credits_charged > 0) {
      rows.push({
        id: u.id,
        at: u.created_at,
        label,
        kind: "spend",
        amount: u.credits_charged,
        note: null,
      });
      continue;
    }
    rows.push({
      id: u.id,
      at: u.created_at,
      label,
      kind: "free",
      amount: 0,
      note: u.free_reason ? (FREE_NOTE[u.free_reason] ?? null) : null,
    });
  }

  for (const g of grants ?? []) {
    rows.push({
      id: g.id,
      at: g.created_at,
      label: GRANT_LABEL[g.source] ?? "到账",
      kind: "grant",
      amount: g.credits_total,
      note: g.note,
    });
  }

  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return rows.slice(0, limit);
}
