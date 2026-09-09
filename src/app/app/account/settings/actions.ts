"use server";

// =============================================================
// Proofly · 账户设置的写操作
//
// 只碰 user_profiles 的两列。列级 GRANT 也只放开了 nickname /
// avatar_kind / avatar_color 三列，即便这里写错，客户端也拿不到别的权限。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { isAvatarColor } from "@/lib/profile/avatars";

const input = z.object({
  displayName: z.string().trim().max(40, "显示名最多 40 字"),
  avatarColor: z.string().refine(isAvatarColor, "没有这个颜色"),
});

/**
 * 保存账户展示名与头像底色。
 *
 * 展示名与档案姓名（profile_facts.key='name'）是两个字段，这里改的这个
 * 永远不会出现在简历上。共用一个字段的下场是一份印着网名的简历，对一个
 * 主张「不编造」的产品，那是最难看的一种失败模式。
 */
export async function saveAccountSettings(
  displayName: string,
  avatarColor: string,
): Promise<ActionResult> {
  const parsed = input.safeParse({ displayName, avatarColor });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  // 走 SECURITY DEFINER 函数而不是直接 upsert：客户端没有 user_profiles
  // 的 insert 权限（有的话就能删了再建，把注册赠送的记号清零），而历史
  // 账号可能压根没有那一行 —— 只 update 会让这些人存不下名字。
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_profile", {
    p_display_name: parsed.data.displayName || null,
    p_avatar_color: parsed.data.avatarColor,
  });

  if (error) return fail("没能保存，再试一次");
  revalidatePath("/", "layout");
  return ok(null);
}
