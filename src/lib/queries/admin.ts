// =============================================================
// Proofly · 兑换码后台的读
//
// 四张表对客户端零权限，所以这里没有一句 .from(...)：每一行数据都从
// security definer 的 admin_* 函数出来，函数自己第一句就验管理员。
//
// 上游：《兑换码管理后台施工方案 v1.0》第 7、8 章
// =============================================================

import { notFound } from "next/navigation";

import { CREDIT_COST_CNY } from "@/config/plan";
import { createClient } from "@/lib/supabase/server";
import type { BatchPurpose, CodeStatus } from "@/types/database";

/** 五种展示态 = 三个存储态 + 两个派生态（方案 3.4） */
export type CodeDisplay = "available" | "used_up" | "expired" | "disabled" | "revoked";

export const DISPLAY_LABEL: Record<CodeDisplay, string> = {
  available: "可用",
  used_up: "已用完",
  expired: "已过期",
  disabled: "已停用",
  revoked: "已作废",
};

export const PURPOSE_LABEL: Record<BatchPurpose, string> = {
  internal_beta: "内测",
  compensation: "补偿",
  invite: "邀请",
  self: "自用",
  purchase: "付款",
};

export type OverviewRecent = {
  id: string;
  redeemed_at: string;
  credits: number;
  email: string;
  code: string;
  batch_id: string;
  batch_name: string;
};

export type Overview = {
  codes_outstanding: number;
  redeemed_count: number;
  redeemed_users: number;
  credits_issued: number;
  recent: OverviewRecent[];
};

export type BatchRow = {
  id: string;
  name: string;
  purpose: BatchPurpose;
  reason: string;
  credits_each: number;
  max_uses_each: number | null;
  code_expires_at: string | null;
  credit_valid_days: number | null;
  bound_email: string | null;
  code_count: number;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  codes: number;
  redeemed: number;
  available: number;
};

export type CodeRow = {
  id: string;
  code: string;
  credits: number;
  max_uses: number | null;
  used_count: number;
  status: CodeStatus;
  status_reason: string | null;
  code_expires_at: string | null;
  bound_email: string | null;
  created_at: string;
  display: CodeDisplay;
  redemptions: { email: string; at: string }[] | null;
};

export type BatchDetail = {
  batch: BatchRow & { creator: string };
  codes: CodeRow[];
};

export type RedemptionRow = {
  id: string;
  redeemed_at: string;
  credits: number;
  credit_expires_at: string | null;
  balance_after: number | null;
  email: string;
  code: string;
  code_id: string;
  batch_id: string;
  batch_name: string;
  purpose: BatchPurpose;
};

/**
 * 非管理员看到的是 404，不是 403。
 *
 * 403 等于确认「这个路径存在，只是你没权限」—— 那是白送的情报。
 * 404 让整个后台在非管理员眼里根本不存在。
 */
export async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) notFound();
}

export async function getOverview(): Promise<Overview> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_overview");
  return (data ?? {
    codes_outstanding: 0,
    redeemed_count: 0,
    redeemed_users: 0,
    credits_issued: 0,
    recent: [],
  }) as unknown as Overview;
}

export async function listBatches(opts: {
  purpose?: string | null;
  q?: string | null;
} = {}): Promise<BatchRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_batches", {
    p_purpose: opts.purpose ?? null,
    p_q: opts.q ?? null,
  });
  return (data ?? []) as unknown as BatchRow[];
}

export async function getBatch(id: string): Promise<BatchDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_batch", { p_id: id });
  return (data ?? null) as unknown as BatchDetail | null;
}

export async function listRedemptions(opts: {
  purpose?: string | null;
  q?: string | null;
  limit?: number;
} = {}): Promise<RedemptionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_redemptions", {
    p_purpose: opts.purpose ?? null,
    p_q: opts.q ?? null,
    p_limit: opts.limit ?? 100,
  });
  return (data ?? []) as unknown as RedemptionRow[];
}

// -------------------------------------------------------------
// 异常看板（方案 8.4）
//
// 四项判定，全部只报不动作。自动封禁在内测阶段的误伤成本远高于收益
// —— 内测用户可能同办公室、同 VPN 出口。
// -------------------------------------------------------------

export type FailBurst = {
  scope: "user" | "ip";
  who: string;
  n: number;
  since: string;
  last_at: string;
  /** 其中「码根本不存在」的有几次 —— 分辨手误和枚举就靠这个 */
  unusable: number;
};

export type ExpiringBatch = {
  id: string;
  name: string;
  code_expires_at: string;
  available: number;
  code_count: number;
};

export type OrphanCredit = {
  id: string;
  source: string;
  credits_total: number;
  note: string | null;
  created_at: string;
  who: string;
};

export type HeavyRedeemer = { who: string; n: number; credits: number };

export type Anomalies = {
  fail_burst: FailBurst[];
  expiring: ExpiringBatch[];
  orphan: OrphanCredit[];
  heavy: HeavyRedeemer[];
  total: number;
};

export async function getAnomalies(): Promise<Anomalies> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_anomalies");
  return (data ?? {
    fail_burst: [],
    expiring: [],
    orphan: [],
    heavy: [],
    total: 0,
  }) as unknown as Anomalies;
}

/**
 * 积分 → 人民币的粗估。
 *
 * 标注为估算，不是精确成本 —— 它的作用是让「发码就是发钱」有痛感，
 * 不是用来记账。
 */
export function toCny(credits: number): string {
  return `¥${Math.round(credits * CREDIT_COST_CNY).toLocaleString("en-US")}`;
}
