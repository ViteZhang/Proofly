"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/domain";
import { adminError } from "@/lib/admin/errors";
import { formatCode, randomCode } from "@/lib/redeem/code";
import { createClient } from "@/lib/supabase/server";

/**
 * 后台的写。
 *
 * 每一个都落在 admin_* 函数上，函数第一句是 admin_assert()。这里的
 * zod 校验挡的是手滑与前端漏改，不是权限 —— 权限只在数据库里判一次。
 */

const Purpose = z.enum(["internal_beta", "compensation", "invite", "self", "purchase"]);

const NewBatch = z.object({
  name: z.string().trim().min(1, "批次名不能为空").max(60),
  purpose: Purpose,
  reason: z.string().trim().min(1, "发放理由必填"),
  creditsEach: z.number().int().min(1).max(100_000),
  count: z.number().int().min(1).max(200),
  // null = 不限次
  maxUses: z.number().int().min(1).max(1000).nullable(),
  /** yyyy-mm-dd，空表示不限 */
  codeExpiresOn: z.string().trim().nullable(),
  /** null = 永久 */
  creditValidDays: z.number().int().min(1).max(3650).nullable(),
  boundEmail: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
});

export type NewBatchInput = z.input<typeof NewBatch>;
export type NewBatchOk = { batchId: string; codes: string[] };

/**
 * 码有效期填的是日期，落库要落成那一天的**结束**。
 *
 * 填 10-15 的人想的是「10 月 15 号还能领」，不是「10 月 15 号零点就
 * 不能领了」。差这一天，最后一个来领码的人会以为码是坏的。
 */
function endOfDayShanghai(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return `${ymd}T23:59:59+08:00`;
}

export async function createBatch(raw: NewBatchInput): Promise<ActionResult<NewBatchOk>> {
  const parsed = NewBatch.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "表单填得不对");
  }
  const v = parsed.data;

  const supabase = await createClient();

  // 31⁸ ≈ 8.5×10¹¹，200 张之内撞码的概率可以忽略，但「可以忽略」不等于
  // 「不会发生」—— 撞了就整批重发一次，别把一次事故留给三个月后的自己。
  for (let attempt = 0; attempt < 3; attempt++) {
    const codes = Array.from({ length: v.count }, () => formatCode(randomCode()));
    const { data, error } = await supabase.rpc("admin_create_batch", {
      p_name: v.name,
      p_purpose: v.purpose,
      p_reason: v.reason,
      p_credits_each: v.creditsEach,
      p_max_uses_each: v.maxUses,
      p_code_expires_at: v.codeExpiresOn ? endOfDayShanghai(v.codeExpiresOn) : null,
      p_credit_valid_days: v.creditValidDays,
      p_bound_email: v.boundEmail,
      p_codes: codes,
    });

    if (!error) {
      const r = data as unknown as { batch_id: string };
      revalidatePath("/admin", "layout");
      return ok({ batchId: r.batch_id, codes });
    }
    if (error.message.includes("duplicate key")) continue;
    return fail(adminError(error.message));
  }
  return fail("连着三次都撞了码，这不正常，先别重试，看一眼日志");
}

/**
 * 单码停用 / 恢复。
 *
 * 理由只在停用时必填 —— 恢复是撤销，不是决策。
 */
export async function toggleCode(
  codeId: string,
  reason: string | null,
): Promise<ActionResult<{ status: "active" | "disabled" }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_toggle_code", {
    p_id: codeId,
    p_reason: reason,
  });
  if (error) return fail(adminError(error.message));
  revalidatePath("/admin", "layout");
  return ok(data as unknown as { status: "active" | "disabled" });
}

/**
 * 整批作废。不可逆。
 *
 * confirmName 要和批次名一字不差。这一条数据库里也验一遍 —— 只在弹窗
 * 里做的硬要求，是一句自我要求。
 */
export async function revokeBatch(
  batchId: string,
  reason: string,
  confirmName: string,
): Promise<ActionResult<{ revokedCodes: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_revoke_batch", {
    p_id: batchId,
    p_reason: reason,
    p_confirm_name: confirmName,
  });
  if (error) return fail(adminError(error.message));
  revalidatePath("/admin", "layout");
  return ok({ revokedCodes: (data as unknown as { revoked_codes: number }).revoked_codes });
}
