"use server";

// =============================================================
// Proofly · 经历库写操作
// 统一约定：
//   1. 入参过 zod，校验失败返回 { ok: false, error }，不抛异常
//   2. 成功后 revalidatePath('/library')（首页共用同一份证明度，一并刷新）
//   3. 数据库原始报错不外泄，一律翻成中文
// evidence_level / evidence_strength 是派生字段，由 SQL 触发器维护，
// 本文件任何地方都不写它们。
// =============================================================

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  fail,
  ok,
  parsePendingMetrics,
  type ActionResult,
  type PendingMetric,
} from "@/lib/domain";
import type { EvidenceLevel } from "@/types/database";

// ---- 通用 ----

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "填写有误，检查一下";
}

// 数据库错误翻译。没命中的一律给一句能看懂的兜底，不把 PostgREST 报文丢给用户。
function dbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "已经有同名的了，换一个名字";
  if (error.code === "23503") return "关联的数据不存在，刷新页面再试";
  if (error.message.includes("只允许两层嵌套")) return "能力点下面不能再挂能力点";
  return fallback;
}

function refresh() {
  revalidatePath("/library");
  revalidatePath("/");
}

const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}最多 ${max} 字`)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

// 周期允许填到月（2025-01）或到日（2025-01-15），入库统一补成日期。
const nullableDate = (label: string) =>
  z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}(-\d{2})?$/.test(v), `${label}格式应为 2025-01`)
    .transform((v) => (v && v.length === 7 ? `${v}-01` : v));

const EVIDENCE = z.enum(["measured", "estimated", "designed_only", "absent"]);

// 证明度是否变了——变了 UI 要提示「仅设计 → 实测」并闪一下标记。
export type EvidenceChange = { before: EvidenceLevel; after: EvidenceLevel; changed: boolean };

async function readEvidence(atomId: string): Promise<EvidenceLevel | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("atoms")
    .select("evidence_level")
    .eq("id", atomId)
    .maybeSingle();
  return data?.evidence_level ?? null;
}

function change(before: EvidenceLevel | null, after: EvidenceLevel | null): EvidenceChange {
  const b = before ?? "absent";
  const a = after ?? "absent";
  return { before: b, after: a, changed: b !== a };
}

// =============================================================
// 经历
// =============================================================

const AtomFields = z.object({
  title: z.string().trim().min(1, "标题不能空着").max(120, "标题最多 120 字"),
  level: z.enum(["project", "capability_slice"]).default("project"),
  parent_id: z.uuid("父级经历不存在").nullable().default(null),
  context: z.enum(["employment", "side_project", "volunteer", "community"]).default("employment"),
  org: nullableText(120, "组织"),
  role: nullableText(120, "角色"),
  period_start: nullableDate("开始时间"),
  period_end: nullableDate("结束时间"),
  status: z.enum(["concept", "design_done", "in_dev", "shipped", "sunset"]).default("concept"),
  situation: nullableText(4000, "背景"),
  task: nullableText(4000, "我要做什么"),
  actions: z
    .array(z.string().trim().max(1000, "每条最多 1000 字"))
    .max(50, "最多 50 条")
    .default([])
    .transform((list) => list.filter((s) => s.length > 0)),
  sort_order: z.number().int().default(0),
});

const CreateAtom = AtomFields.refine(
  (d) => !(d.period_start && d.period_end) || d.period_start <= d.period_end,
  { message: "开始时间不能晚于结束时间", path: ["period_end"] },
).refine((d) => d.level === "project" || d.parent_id !== null, {
  message: "能力点必须挂在一条经历下面",
  path: ["parent_id"],
});

export type CreateAtomInput = z.input<typeof AtomFields>;

export async function createAtom(input: CreateAtomInput): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateAtom.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atoms")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return fail(dbError(error, "没能新建这条经历，再试一次"));
  refresh();
  return ok({ id: data.id });
}

const UpdateAtom = AtomFields.partial()
  .refine((d) => !(d.period_start && d.period_end) || d.period_start <= d.period_end, {
    message: "开始时间不能晚于结束时间",
    path: ["period_end"],
  })
  .refine((d) => Object.keys(d).length > 0, { message: "没有要改的内容" });

export type UpdateAtomInput = Partial<z.input<typeof AtomFields>>;

export async function updateAtom(
  id: string,
  patch: UpdateAtomInput,
): Promise<ActionResult<{ evidence: EvidenceChange }>> {
  if (!z.uuid().safeParse(id).success) return fail("这条经历不存在");
  const parsed = UpdateAtom.safeParse(patch);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  // 自己不能当自己的父级
  if (parsed.data.parent_id === id) return fail("不能把一条经历挂到它自己下面");

  // 补一次跨字段校验：只改了其中一个日期时，要拿库里的另一个来比。
  if (parsed.data.period_start !== undefined || parsed.data.period_end !== undefined) {
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("atoms")
      .select("period_start,period_end")
      .eq("id", id)
      .maybeSingle();
    const start = parsed.data.period_start ?? current?.period_start ?? null;
    const end = parsed.data.period_end ?? current?.period_end ?? null;
    if (start && end && start > end) return fail("开始时间不能晚于结束时间");
  }

  const before = await readEvidence(id);
  const supabase = await createClient();
  const { error } = await supabase.from("atoms").update(parsed.data).eq("id", id);
  if (error) return fail(dbError(error, "没能保存这条经历，再试一次"));

  refresh();
  return ok({ evidence: change(before, await readEvidence(id)) });
}

export type DeleteImpact = {
  title: string;
  childCount: number;
  metricCount: number;
  guardCount: number;
  skillLinkCount: number;
};

/** 删除确认弹窗要显示的真实影响范围（子项 / 指标 / 护栏 / 技能关联都会跟着删）。 */
export async function getDeleteImpact(id: string): Promise<ActionResult<DeleteImpact>> {
  if (!z.uuid().safeParse(id).success) return fail("这条经历不存在");
  const supabase = await createClient();

  const { data: atom } = await supabase.from("atoms").select("title").eq("id", id).maybeSingle();
  if (!atom) return fail("这条经历已经不在了");

  const { data: children } = await supabase.from("atoms").select("id").eq("parent_id", id);
  const ids = [id, ...(children ?? []).map((c) => c.id)];

  const [metrics, guards, links] = await Promise.all([
    supabase.from("metrics").select("id").in("atom_id", ids),
    supabase.from("guards").select("id").in("atom_id", ids),
    supabase.from("atom_skills").select("id").in("atom_id", ids),
  ]);

  return ok({
    title: atom.title,
    childCount: children?.length ?? 0,
    metricCount: metrics.data?.length ?? 0,
    guardCount: guards.data?.length ?? 0,
    skillLinkCount: links.data?.length ?? 0,
  });
}

export async function deleteAtom(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("这条经历不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("atoms").delete().eq("id", id);
  if (error) return fail(dbError(error, "没能删掉这条经历，再试一次"));
  refresh();
  return ok(null);
}

/** 同级拖拽排序：按传入顺序重写 sort_order。 */
export async function reorderAtoms(ids: string[]): Promise<ActionResult> {
  const parsed = z.array(z.uuid()).min(1, "没有要排序的经历").safeParse(ids);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  for (const [index, id] of parsed.data.entries()) {
    const { error } = await supabase.from("atoms").update({ sort_order: index }).eq("id", id);
    if (error) return fail(dbError(error, "没能保存新的顺序，再试一次"));
  }
  refresh();
  return ok(null);
}

// =============================================================
// 结果指标
// =============================================================

const MetricFields = z.object({
  name: z.string().trim().min(1, "指标名不能空着").max(80, "指标名最多 80 字"),
  kind: z.enum(["outcome", "output"]).default("outcome"),
  from_value: nullableText(80, "变化前"),
  to_value: nullableText(80, "变化后"),
  delta: nullableText(80, "变化量"),
  evidence_level: EVIDENCE.default("measured"),
  method: nullableText(2000, "口径说明"),
});

const CreateMetric = MetricFields.extend({ atom_id: z.uuid("这条经历不存在") }).refine(
  (d) => Boolean(d.delta || d.to_value || d.from_value),
  { message: "至少填一个数值：变化量，或者变化前后", path: ["delta"] },
);

export type CreateMetricInput = z.input<typeof MetricFields> & { atom_id: string };

export async function createMetric(
  input: CreateMetricInput,
): Promise<ActionResult<{ id: string; evidence: EvidenceChange }>> {
  const parsed = CreateMetric.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const before = await readEvidence(parsed.data.atom_id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("metrics").insert(parsed.data).select("id").single();
  if (error) return fail(dbError(error, "没能保存这条指标，再试一次"));

  refresh();
  return ok({ id: data.id, evidence: change(before, await readEvidence(parsed.data.atom_id)) });
}

export type UpdateMetricInput = Partial<z.input<typeof MetricFields>>;

export async function updateMetric(
  id: string,
  patch: UpdateMetricInput,
): Promise<ActionResult<{ evidence: EvidenceChange }>> {
  if (!z.uuid().safeParse(id).success) return fail("这条指标不存在");
  const parsed = MetricFields.partial().safeParse(patch);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data: row } = await supabase.from("metrics").select("atom_id").eq("id", id).maybeSingle();
  if (!row) return fail("这条指标已经不在了");

  const before = await readEvidence(row.atom_id);
  const { error } = await supabase.from("metrics").update(parsed.data).eq("id", id);
  if (error) return fail(dbError(error, "没能保存这条指标，再试一次"));

  refresh();
  return ok({ evidence: change(before, await readEvidence(row.atom_id)) });
}

export async function deleteMetric(
  id: string,
): Promise<ActionResult<{ evidence: EvidenceChange }>> {
  if (!z.uuid().safeParse(id).success) return fail("这条指标不存在");
  const supabase = await createClient();

  const { data: row } = await supabase.from("metrics").select("atom_id").eq("id", id).maybeSingle();
  if (!row) return fail("这条指标已经不在了");

  const before = await readEvidence(row.atom_id);
  const { error } = await supabase.from("metrics").delete().eq("id", id);
  if (error) return fail(dbError(error, "没能删掉这条指标，再试一次"));

  refresh();
  return ok({ evidence: change(before, await readEvidence(row.atom_id)) });
}

// =============================================================
// 待补数据（存在 atoms.pending_metrics 这个 jsonb 里）
// =============================================================

async function loadPending(atomId: string): Promise<PendingMetric[] | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("atoms")
    .select("pending_metrics")
    .eq("id", atomId)
    .maybeSingle();
  return data ? parsePendingMetrics(data.pending_metrics) : null;
}

async function savePending(atomId: string, list: PendingMetric[]) {
  const supabase = await createClient();
  return supabase.from("atoms").update({ pending_metrics: list }).eq("id", atomId);
}

const norm = (s: string) => s.trim().toLowerCase();

export async function addPendingMetric(
  atomId: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({
      atomId: z.uuid("这条经历不存在"),
      name: z.string().trim().min(1, "写一下要补什么数据").max(80, "最多 80 字"),
    })
    .safeParse({ atomId, name });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const list = await loadPending(parsed.data.atomId);
  if (list === null) return fail("这条经历已经不在了");
  if (list.some((p) => norm(p.name) === norm(parsed.data.name))) {
    return fail("这项已经在待补数据里了");
  }

  // 与已有指标同名也要拦一下，别让同一个数出现两次（验收 14）
  const supabase = await createClient();
  const { data: metrics } = await supabase.from("metrics").select("name").eq("atom_id", parsed.data.atomId);
  if ((metrics ?? []).some((m) => norm(m.name) === norm(parsed.data.name))) {
    return fail("结果指标里已经有同名的了，不用再补");
  }

  const item: PendingMetric = { id: randomUUID(), name: parsed.data.name, note: null };
  const { error } = await savePending(parsed.data.atomId, [...list, item]);
  if (error) return fail(dbError(error, "没能加上这项，再试一次"));

  refresh();
  return ok({ id: item.id });
}

export async function removePendingMetric(
  atomId: string,
  pendingId: string,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(atomId).success) return fail("这条经历不存在");

  const list = await loadPending(atomId);
  if (list === null) return fail("这条经历已经不在了");
  const next = list.filter((p) => p.id !== pendingId);
  if (next.length === list.length) return fail("这项已经不在待补数据里了");

  const { error } = await savePending(atomId, next);
  if (error) return fail(dbError(error, "没能删掉这项，再试一次"));

  refresh();
  return ok(null);
}

const PromotePending = MetricFields.extend({
  atom_id: z.uuid("这条经历不存在"),
  pending_id: z.string().min(1, "这项已经不在待补数据里了"),
}).refine((d) => Boolean(d.delta || d.to_value || d.from_value), {
  message: "至少填一个数值：变化量，或者变化前后",
  path: ["delta"],
});

export type PromotePendingInput = z.input<typeof MetricFields> & {
  atom_id: string;
  pending_id: string;
};

/**
 * 待补数据填完 → 写进结果指标，并从待补列表移除。
 * 这是用户提升证明度最短的一条路径，失败必须留下原样，不产生半截数据。
 */
export async function promotePendingMetric(
  input: PromotePendingInput,
): Promise<ActionResult<{ id: string; evidence: EvidenceChange }>> {
  const parsed = PromotePending.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { atom_id, pending_id, ...metric } = parsed.data;

  const list = await loadPending(atom_id);
  if (list === null) return fail("这条经历已经不在了");
  if (!list.some((p) => p.id === pending_id)) return fail("这项已经不在待补数据里了");

  const before = await readEvidence(atom_id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metrics")
    .insert({ ...metric, atom_id })
    .select("id")
    .single();
  if (error) return fail(dbError(error, "没能保存这条指标，再试一次"));

  // 指标已经落库；这一步失败也不回滚，待补项留着比丢掉指标好。
  await savePending(
    atom_id,
    list.filter((p) => p.id !== pending_id),
  );

  refresh();
  return ok({ id: data.id, evidence: change(before, await readEvidence(atom_id)) });
}

// =============================================================
// 叙事护栏（一条经历一组，atom_id 上有 unique）
// =============================================================

const GuardsFields = z.object({
  atom_id: z.uuid("这条经历不存在"),
  must_say: z
    .array(z.string().trim().max(200, "每条最多 200 字"))
    .max(20, "最多 20 条")
    .default([])
    .transform((l) => l.filter((s) => s.length > 0)),
  never_say: z
    .array(z.string().trim().max(200, "每条最多 200 字"))
    .max(20, "最多 20 条")
    .default([])
    .transform((l) => l.filter((s) => s.length > 0)),
  role_framing: nullableText(200, "角色定位"),
  probes: z
    .array(
      z.object({
        q: z.string().trim().min(1, "问题不能空着").max(200, "问题最多 200 字"),
        a_outline: z.string().trim().max(1000, "应答要点最多 1000 字").default(""),
      }),
    )
    .max(20, "最多 20 条")
    .default([]),
});

export type UpsertGuardsInput = z.input<typeof GuardsFields>;

export async function upsertGuards(input: UpsertGuardsInput): Promise<ActionResult> {
  const parsed = GuardsFields.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from("guards")
    .upsert(parsed.data, { onConflict: "atom_id" });
  if (error) return fail(dbError(error, "没能保存叙事护栏，再试一次"));

  refresh();
  return ok(null);
}

export async function deleteGuards(atomId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(atomId).success) return fail("这条经历不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("guards").delete().eq("atom_id", atomId);
  if (error) return fail(dbError(error, "没能删掉叙事护栏，再试一次"));
  refresh();
  return ok(null);
}

// =============================================================
// 技能
// skills 上有 unique(user_id, label)，所以输入必须走「先查再建」，
// 否则用户敲一个已存在的技能名就会撞唯一约束（验收 15）。
// =============================================================

export type SkillOption = {
  id: string;
  label: string;
  evidence_strength: "strong" | "weak" | "none";
};

/** combobox 的实时匹配。q 为空时给最近的一批，方便直接挑。 */
export async function searchSkills(q: string): Promise<ActionResult<SkillOption[]>> {
  const supabase = await createClient();
  let query = supabase.from("skills").select("id,label,evidence_strength").limit(20);
  const keyword = q.trim();
  if (keyword) query = query.ilike("label", `%${keyword}%`);

  const { data, error } = await query;
  if (error) return fail("没能读到技能列表，再试一次");

  return ok(
    (data ?? []).sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN")),
  );
}

const LinkSkill = z.object({
  atom_id: z.uuid("这条经历不存在"),
  skill_id: z.uuid().nullable().default(null),
  label: z.string().trim().max(80, "技能名最多 80 字").default(""),
});

export type LinkSkillInput = z.input<typeof LinkSkill>;

/** 命中已有技能就复用，没命中才新建，然后与这条经历建立关联。 */
export async function linkSkill(
  input: LinkSkillInput,
): Promise<ActionResult<{ skillId: string; linkId: string }>> {
  const parsed = LinkSkill.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { atom_id, label } = parsed.data;
  let skillId = parsed.data.skill_id;

  const supabase = await createClient();

  if (!skillId) {
    if (!label) return fail("填一个技能名");

    const { data: existing } = await supabase
      .from("skills")
      .select("id")
      .eq("label", label)
      .maybeSingle();

    if (existing) {
      skillId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("skills")
        .insert({ label })
        .select("id")
        .single();
      if (error) {
        // 并发下仍可能撞 unique(user_id,label)，重查一次拿到那条复用。
        if (error.code === "23505") {
          const { data: raced } = await supabase
            .from("skills")
            .select("id")
            .eq("label", label)
            .maybeSingle();
          if (!raced) return fail("没能新建这个技能，再试一次");
          skillId = raced.id;
        } else {
          return fail(dbError(error, "没能新建这个技能，再试一次"));
        }
      } else {
        skillId = created.id;
      }
    }
  }

  const { data: link, error: linkError } = await supabase
    .from("atom_skills")
    .upsert({ atom_id, skill_id: skillId }, { onConflict: "atom_id,skill_id" })
    .select("id")
    .single();
  if (linkError) return fail(dbError(linkError, "没能关联这个技能，再试一次"));

  refresh();
  return ok({ skillId, linkId: link.id });
}

export type UnlinkImpact = { label: string; becomesOrphan: boolean };

/** 解除前先看看：解完这个技能会不会一条经历都不剩（那样它就不会出现在简历里了）。 */
export async function getUnlinkImpact(linkId: string): Promise<ActionResult<UnlinkImpact>> {
  if (!z.uuid().safeParse(linkId).success) return fail("这个关联不存在");
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("atom_skills")
    .select("skill_id,skill:skills(label)")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return fail("这个关联已经不在了");

  const skill = Array.isArray(link.skill) ? link.skill[0] : link.skill;
  const { data: siblings } = await supabase
    .from("atom_skills")
    .select("id")
    .eq("skill_id", link.skill_id);

  return ok({
    label: skill?.label ?? "这个技能",
    becomesOrphan: (siblings?.length ?? 0) <= 1,
  });
}

export async function unlinkSkill(linkId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(linkId).success) return fail("这个关联不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("atom_skills").delete().eq("id", linkId);
  if (error) return fail(dbError(error, "没能解除关联，再试一次"));
  refresh();
  return ok(null);
}
