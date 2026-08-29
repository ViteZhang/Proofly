"use server";

// =============================================================
// Proofly · 求职方向写操作
// 约定同经历库：入参过 zod，失败返回可读中文，不抛异常。
// 这里没有「设为主方向」这类接口，是刻意的——多方向平权，
// 一旦有了主次字段，界面迟早会长出星标。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "填写有误，检查一下";
}

function refresh() {
  revalidatePath("/targets");
  revalidatePath("/", "layout"); // 顶栏选择器在 layout 里，得连着刷
}

const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}最多 ${max} 字`)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const targetInput = z.object({
  name: z.string().trim().min(1, "给这个方向起个名字").max(40, "方向名最多 40 字"),
  direction: nullableText(30, "方向类型"),
  narrative: nullableText(500, "主线故事"),
});

export type TargetInput = z.input<typeof targetInput>;

export async function createTarget(input: TargetInput): Promise<ActionResult<{ id: string }>> {
  const parsed = targetInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();

  // 新方向排在最后。平权指的是不分主次，不是不排序。
  const { count } = await supabase.from("targets").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("targets")
    .insert({ ...parsed.data, sort_order: count ?? 0 })
    .select("id")
    .single();

  if (error || !data) return fail("没能新建方向，再试一次");
  refresh();
  return ok({ id: data.id });
}

export async function updateTarget(
  id: string,
  input: TargetInput,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("这个方向不存在");
  const parsed = targetInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.from("targets").update(parsed.data).eq("id", id);
  if (error) return fail("没能保存改动，再试一次");
  refresh();
  return ok(null);
}

export type TargetDeleteImpact = {
  name: string;
  jdCount: number;
  assessmentCount: number;
  resumeCount: number;
};

/** 删除确认要显示的真实牵连数量，全部查库，不写死。 */
export async function getTargetDeleteImpact(
  id: string,
): Promise<ActionResult<TargetDeleteImpact>> {
  if (!z.uuid().safeParse(id).success) return fail("这个方向不存在");
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("targets")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!target) return fail("这个方向已经不在了");

  const [jdRes, assessRes] = await Promise.all([
    supabase.from("jds").select("id").eq("target_id", id),
    supabase.from("assessments").select("id", { count: "exact", head: true }).eq("target_id", id),
  ]);

  // 简历版本挂在 JD 上，得先拿到这个方向的 JD 才数得出来。
  const jdIds = (jdRes.data ?? []).map((j) => j.id);
  let resumeCount = 0;
  if (jdIds.length > 0) {
    const { count } = await supabase
      .from("resume_versions")
      .select("id", { count: "exact", head: true })
      .in("jd_id", jdIds);
    resumeCount = count ?? 0;
  }

  return ok({
    name: target.name,
    jdCount: jdIds.length,
    assessmentCount: assessRes.count ?? 0,
    resumeCount,
  });
}

export async function deleteTarget(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("这个方向不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("targets").delete().eq("id", id);
  if (error) return fail("没能删掉这个方向，再试一次");
  refresh();
  return ok(null);
}
