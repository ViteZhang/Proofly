"use server";

// =============================================================
// Proofly · 界面要用的计费查询
//
// 「点之前就知道要花多少」（交互方案 1.1）落到实现上就是这个动作：
// 界面在渲染按钮之前问一句，这次点下去要不要钱。
// =============================================================

import { ACTION_PRICES, LIMITS } from "@/config/plan";
import { fingerprintFor } from "@/lib/billing/action";
import { getBalance } from "@/lib/queries/billing";
import { createClient } from "@/lib/supabase/server";

export type ChargeQuote = {
  /** 标价 */
  credits: number;
  /** 这次点下去免费吗 */
  free: boolean;
  balance: number;
};

/**
 * 这次执行要不要钱。
 *
 * free = true 的唯一来源是重生成窗口：同一份输入、24 小时内、没超过
 * 三次。界面据此在两种形态间切换（交互方案 3.4）：
 * 免费态直接标「这次不扣分」，收费态弹窗说清为什么并给省钱建议。
 */
export async function quoteAction(
  actionCode: string,
  ctx: { targetId?: string; jdId?: string; resumeVersionId?: string } = {},
): Promise<ChargeQuote> {
  const credits = (ACTION_PRICES as Record<string, number>)[actionCode] ?? 0;
  const balance = await getBalance();

  const supabase = await createClient();
  const fingerprint = await fingerprintFor(actionCode, ctx);
  const { data: free } = await supabase.rpc("check_regen_free", {
    p_user: (await supabase.auth.getUser()).data.user?.id ?? "",
    p_action: actionCode,
    p_fingerprint: fingerprint,
    p_window_hours: LIMITS.regen_free_window_hours,
    p_max: LIMITS.regen_free_max_times,
  });

  return { credits, free: free === true, balance: balance.available };
}
