// =============================================================
// Proofly · 首次登录的开户与赠送
//
// 用 Server Action 而不是数据库触发器：护栏触顶时要走降级分支，
// 触发器里做不了这种判断（技术方案 7、C3 切片 C3.1）。
//
// 三件事按顺序做，每一件都幂等：
//   1. 建 quota_counters 与 user_profiles
//   2. 看今天还发不发得起（预算护栏只掐获客支出）
//   3. 发 45 分，当月最后一天到期
//
// 触顶时**不写「已发放」标记** —— 那笔只是没发成。用户明天再来就能
// 领到，而不是永远少了 45 分还不知道发生过什么。
// =============================================================

import { claimSignupGrant } from "./budget";
import { currentUserId } from "./action";

export type OnboardState = {
  /** 这次调用真的发了赠送 */
  justGranted: number;
  /** 还没发上（护栏触顶）。界面要显示名额已满的引导卡。 */
  pending: boolean;
  /** 已经发过了 */
  issued: boolean;
  /** 这次是补发 —— 注册那天护栏触顶没发上，今天补上了 */
  backfilled: boolean;
};

/**
 * 确保这个账号已经开好户、赠送已经发过（或已知发不了）。
 *
 * 幂等，随便调多少次。放在登录落地与首页两处：落地那次覆盖新用户，
 * 首页那次兜住「护栏触顶那天注册、第二天回来」的补发。
 */
export async function ensureOnboarded(): Promise<OnboardState> {
  const userId = await currentUserId();
  if (!userId) return { justGranted: 0, pending: false, issued: false, backfilled: false };

  const r = await claimSignupGrant(userId);

  if (r.ok && r.granted > 0) {
    // 注册那天就发上的是首次赠送；隔了一天才发上的是补发 —— 两种情况
    // 说的话不一样，用户那天看到的是「名额满了」，今天得告诉他有了。
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const { data } = await supabase
      .from("user_profiles")
      .select("created_at")
      .eq("user_id", userId)
      .maybeSingle();
    const createdAt = data?.created_at ? new Date(data.created_at) : new Date();
    const backfilled = Date.now() - createdAt.getTime() > 12 * 3600_000;
    return { justGranted: r.granted, pending: false, issued: true, backfilled };
  }
  if (r.ok && r.reason === "ALREADY_ISSUED") {
    return { justGranted: 0, pending: false, issued: true, backfilled: false };
  }
  // BUDGET_CAPPED 或其他失败：还没发上，明天再来。
  return { justGranted: 0, pending: true, issued: false, backfilled: false };
}
