"use server";

import { fail, ok, type ActionResult } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * 注销账号。
 *
 * 顺序要紧：**先删存储桶里的文件，再删账号。** 反过来的话账号一没，
 * 那些文件就再也没人有权限去删了 —— 用户以为清干净了，实际上他上传的
 * 简历还躺在桶里。
 */
export async function deleteAccount(confirmEmail: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("登录状态过期了，刷新一下页面");

  // 1. 存储桶
  const { data: docs } = await supabase.from("source_docs").select("storage_path");
  const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    const { error } = await supabase.storage.from("source-docs").remove(paths);
    if (error) {
      return fail("上传的文件没能删干净，账号先没动。稍后再试一次，或者联系我们。");
    }
  }

  // 2. 账号本身。其余数据靠外键级联走掉。
  const { data, error } = await supabase.rpc("delete_my_account", {
    p_confirm_email: confirmEmail,
  });
  if (error) return fail("删除没成功，再试一次");

  const v = data as { ok: boolean; reason?: string };
  if (!v.ok) {
    if (v.reason === "EMAIL_MISMATCH") return fail("邮箱对不上，再核对一下");
    return fail("删除没成功，再试一次");
  }

  await supabase.auth.signOut();
  return ok(null);
}
