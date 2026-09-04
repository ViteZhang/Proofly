"use server";

import { createClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/domain";

// 跟 waitlist 表上的 CHECK 同一条规则。两边都要有：
// 前端挡的是手滑，数据库挡的是绕过前端直接打 API 的。
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * 官网 CTA：把邮箱记进候补名单。
 *
 * 访客没有登录，走的是 anon 角色 —— waitlist 上只开了 insert 策略，
 * 所以这里写得进去、读不出来（见 supabase/23_site_waitlist.sql）。
 *
 * 同一个邮箱再提交一次也当成功：撞了 unique 就咽掉。
 * 「你已经报过名了」这种话没必要说，而且等于对外确认某个邮箱在不在名单里。
 */
export async function joinWaitlist(email: string): Promise<ActionResult<null>> {
  const value = email.trim().toLowerCase();

  if (!EMAIL.test(value) || value.length > 254) {
    return fail("这个邮箱格式看起来不太对");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({ email: value, source: "site" });

  // 23505 = 唯一约束冲突，也就是这个邮箱已经在名单上了。
  // 不能改用 upsert(ignoreDuplicates)：PostgREST 会把它当 upsert 准备，
  // 连 update 权限一起要，而这张表故意只开了 insert。
  if (error && error.code !== "23505") {
    return fail(`没能记下来：${error.message}`);
  }
  return ok(null);
}
