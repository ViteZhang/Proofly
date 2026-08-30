"use server";

// =============================================================
// Proofly · JD 录入、解析与要求项编辑
// 解析走第四节 4.1 提示词，strong 档，一次调用。
// 模型会漏、会误判，所以要求列表必须能改、能删、能手动加 —— 这是兜底的口子。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { PARSE_SYSTEM, parseUser } from "@/lib/llm/jd-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { KINDS, parseSchema } from "@/lib/jd/schema";
import { getRequirements, type RequirementRow } from "@/lib/queries/jds";

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "填写有误，检查一下";
}

function refresh() {
  revalidatePath("/targets");
}

const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}最多 ${max} 字`)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const jdInput = z.object({
  company: nullableText(60, "公司名"),
  roleTitle: nullableText(60, "岗位名称"),
  rawText: z
    .string()
    .trim()
    .min(30, "JD 正文太短了，至少 30 字")
    .max(20000, "JD 正文最多 20000 字"),
  sourceUrl: nullableText(500, "来源链接"),
});

export type JdInput = z.input<typeof jdInput>;

export async function createJd(
  targetId: string,
  input: JdInput,
): Promise<ActionResult<{ id: string }>> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");
  const parsed = jdInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jds")
    .insert({
      target_id: targetId,
      company: parsed.data.company,
      role_title: parsed.data.roleTitle,
      raw_text: parsed.data.rawText,
      source_url: parsed.data.sourceUrl,
    })
    .select("id")
    .single();

  if (error || !data) return fail("没能保存这份 JD，再试一次");
  refresh();
  return ok({ id: data.id });
}

export async function deleteJd(jdId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(jdId).success) return fail("这份 JD 不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("jds").delete().eq("id", jdId);
  if (error) return fail("没能删掉这份 JD，再试一次");
  refresh();
  return ok(null);
}

/**
 * 解析 JD。重新解析会先清掉旧的要求项 —— 要求项是解析结果的投影，
 * 留着旧的会和新的混在一起，分母就错了。
 */
export async function parseJd(jdId: string): Promise<ActionResult<RequirementRow[]>> {
  if (!z.uuid().safeParse(jdId).success) return fail("这份 JD 不存在");
  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("id,company,role_title,raw_text")
    .eq("id", jdId)
    .maybeSingle();
  if (!jd) return fail("这份 JD 已经不在了");

  const res = await callLLM({
    tier: "strong",
    purpose: "jd_parse",
    system: PARSE_SYSTEM,
    user: parseUser({
      company: jd.company ?? "（未填）",
      roleTitle: jd.role_title ?? "（未填）",
      rawText: jd.raw_text,
    }),
    jsonSchema: parseSchema,
  });
  if (!res.ok) return fail(res.error);

  await supabase.from("requirements").delete().eq("jd_id", jdId);

  // index 由模型给，但不能信 —— 重复或跳号都会让后面的对照错位。
  // 按模型给的顺序重新编号，只保留相对次序。
  const rows = res.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((r, i) => ({
      jd_id: jdId,
      idx: i + 1,
      text: r.text,
      raw_phrase: r.raw_phrase || null,
      kind: r.kind,
      is_structural: r.is_structural,
      derived_from: r.kind === "implicit" ? r.derived_from : null,
    }));

  const { error } = await supabase.from("requirements").insert(rows);
  if (error) return fail("解析出来了，但没存进去，再试一次");

  refresh();
  return ok(await getRequirements(jdId));
}

// ---- 要求项的人工兜底 ----

const requirementEdit = z.object({
  text: z.string().trim().min(1, "要求内容不能为空").max(200, "一条要求最多 200 字"),
  kind: z.enum(KINDS),
  isStructural: z.boolean(),
});

export type RequirementEdit = z.input<typeof requirementEdit>;

export async function updateRequirement(
  id: string,
  input: RequirementEdit,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("这条要求不存在");
  const parsed = requirementEdit.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from("requirements")
    .update({
      text: parsed.data.text,
      kind: parsed.data.kind,
      is_structural: parsed.data.isStructural,
    })
    .eq("id", id);

  if (error) return fail("没能保存改动，再试一次");
  refresh();
  return ok(null);
}

export async function deleteRequirement(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("这条要求不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("requirements").delete().eq("id", id);
  if (error) return fail("没能删掉这条要求，再试一次");
  refresh();
  return ok(null);
}

export async function addRequirement(
  jdId: string,
  input: RequirementEdit,
): Promise<ActionResult<RequirementRow[]>> {
  if (!z.uuid().safeParse(jdId).success) return fail("这份 JD 不存在");
  const parsed = requirementEdit.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const existing = await getRequirements(jdId);

  const { error } = await supabase.from("requirements").insert({
    jd_id: jdId,
    idx: existing.length + 1,
    text: parsed.data.text,
    kind: parsed.data.kind,
    is_structural: parsed.data.isStructural,
    // 手动加的没有 JD 原文措辞，留空。Step 6 做关键词对齐时会跳过它。
    raw_phrase: null,
  });

  if (error) return fail("没能加上这条要求，再试一次");
  refresh();
  return ok(await getRequirements(jdId));
}
