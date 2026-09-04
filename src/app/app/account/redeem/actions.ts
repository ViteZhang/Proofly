"use server";

import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/billing/action";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * 兑换码的错误话术（交互方案 4.3）。
 *
 * 「已用过」分两种：自己用过、被别人用完了。对用户来说都是「用过了」，
 * 但措辞不同 —— 前者是「你已经用过了」，后者不该暗示是他的问题。
 */
const MESSAGE: Record<string, string> = {
  NOT_FOUND: "这个码不对",
  EXPIRED: "这个码过期了",
  ALREADY_USED_BY_ME: "这个码你已经用过了",
  USED_UP: "这个码已经用过了",
};

export type RedeemOk = { credits: number; balanceAfter: number };

export async function redeem(code: string): Promise<ActionResult<RedeemOk>> {
  const userId = await currentUserId();
  if (!userId) return fail("登录状态过期了，刷新一下页面");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_code", {
    p_user: userId,
    p_code: code,
  });
  if (error) return fail("兑换没成功，再试一次");

  const v = data as { ok: boolean; reason?: string; credits?: number; balance_after?: number };
  if (!v.ok) return fail(MESSAGE[v.reason ?? ""] ?? "这个码不对");

  revalidatePath("/app/account");
  revalidatePath("/", "layout");
  return ok({ credits: v.credits ?? 0, balanceAfter: v.balance_after ?? 0 });
}
