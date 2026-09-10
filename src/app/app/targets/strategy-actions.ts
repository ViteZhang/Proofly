"use server";

// =============================================================
// Proofly · 经历 × 方向策略写操作
// 唯一的写入口。约束：只在用户真的改了东西时才 upsert，
// 绝不为了「把网格填满」而批量插入 —— 那会让新建方向变成 24 次写入，
// 也会让「有没有配过」这件事再也分不出来。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { normalizeGroup } from "@/lib/targets/strategy";
import { plannedLines, rankAtoms } from "@/lib/targets/rank";
import { parseResults } from "@/lib/scoring/parse";

const renderWeight = z.enum(["lead", "expand", "brief", "one_line", "omit"]);

const groupText = z
  .string()
  .trim()
  .max(40, "互斥组名最多 40 字")
  .nullable()
  .transform((v) => normalizeGroup(v));

const entry = z.object({
  atomId: z.uuid("这条经历不存在"),
  renderWeight,
  exclusiveGroup: groupText,
});

export type StrategyEntry = z.input<typeof entry>;

function refresh() {
  revalidatePath("/app/library");
  revalidatePath("/app/targets");
  revalidatePath("/app/targets/strategy");
}

/** 详情页改一行：一次 upsert，只碰这一条记录。 */
export async function saveStrategy(
  targetId: string,
  input: StrategyEntry,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");
  const parsed = entry.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误，检查一下");

  const supabase = await createClient();
  const { error } = await supabase.from("atom_target_strategy").upsert(
    {
      atom_id: parsed.data.atomId,
      target_id: targetId,
      render_weight: parsed.data.renderWeight,
      exclusive_group: parsed.data.exclusiveGroup,
      // 人点出来的一律记 manual，自动分配从此绕开这一行。
      strategy_source: "manual" as const,
    },
    { onConflict: "atom_id,target_id" },
  );

  if (error) return fail("没能保存这条策略，再试一次");
  refresh();
  return ok(null);
}

/**
 * 批量配置页保存：只收前端标记为改动过的行。
 * 没改过的行不进这个数组，也就不会在库里留下记录。
 */
export async function saveStrategies(
  targetId: string,
  entries: StrategyEntry[],
): Promise<ActionResult<{ saved: number }>> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");
  const parsed = z.array(entry).max(200, "一次改太多了，分两批").safeParse(entries);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误，检查一下");
  if (parsed.data.length === 0) return ok({ saved: 0 });

  const supabase = await createClient();
  const { error } = await supabase.from("atom_target_strategy").upsert(
    parsed.data.map((e) => ({
      atom_id: e.atomId,
      target_id: targetId,
      render_weight: e.renderWeight,
      exclusive_group: e.exclusiveGroup,
      strategy_source: "manual" as const,
    })),
    { onConflict: "atom_id,target_id" },
  );

  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok({ saved: parsed.data.length });
}

// =============================================================
// 自动分配展开程度
// =============================================================

export type InitOutcome = {
  /** 这次写进去了几行。 */
  written: number;
  /** 因为是人改过的而跳过了几行。 */
  keptManual: number;
  /** 分配完之后预计多少行正文。 */
  plannedLines: number;
  /** 这次分配有没有用上评估结果。false 表示只按证明度与新近度排。 */
  usedAssessment: boolean;
};

/**
 * 按最新评估结果给这个方向的每条经历分配展开程度。
 *
 * 为什么要有这一步：atom_target_strategy 是一张空表，不是因为用户忘了配，
 * 而是因为产品从来没替他配过。十条经历全走默认 brief，每条硬截 2 行，
 * 生成出来的必然是一份最压缩形态的简历 —— 而他根本不知道有这个开关。
 *
 * 三条纪律：
 *   · 只写 strategy_source = 'auto' 的行。人改过的永不覆盖，除非显式 force。
 *   · 幂等。同样的评估结果跑十次，库里是同一份内容。
 *   · 不写 omit。自动分配可以把一条经历压到一行，但不能替人决定不提它。
 */
export async function initStrategyForTarget(
  targetId: string,
  opts: { force?: boolean } = {},
): Promise<ActionResult<InitOutcome>> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");

  const supabase = await createClient();

  // 越权的第一道：这个方向必须是当前用户的。RLS 也拦得住，但拦在这里能
  // 给出「不存在」而不是一次静默的空写入。
  const { data: target } = await supabase
    .from("targets")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return fail("这个方向已经不在了");

  const [{ data: atoms }, { data: existing }, { data: jds }] = await Promise.all([
    supabase
      .from("atoms")
      .select("id,title,evidence_level,period_end,sort_order,parent_id")
      .is("parent_id", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("atom_target_strategy")
      .select("atom_id,render_weight,exclusive_group,strategy_source")
      .eq("target_id", targetId),
    supabase.from("jds").select("id").eq("target_id", targetId),
  ]);

  const projects = atoms ?? [];
  if (projects.length === 0) {
    return ok({ written: 0, keptManual: 0, plannedLines: 0, usedAssessment: false });
  }

  const { hits, hasAssessment } = await collectHits(
    targetId,
    (jds ?? []).map((j) => j.id),
  );

  const ranked = rankAtoms(
    projects.map((a) => ({
      id: a.id,
      title: a.title,
      evidenceLevel: a.evidence_level,
      periodEnd: a.period_end,
      sortOrder: a.sort_order ?? 0,
    })),
    hits,
    { hasAssessment },
  );

  const manual = new Set(
    (existing ?? [])
      .filter((r) => r.strategy_source === "manual")
      .map((r) => r.atom_id),
  );
  const groupOf = new Map((existing ?? []).map((r) => [r.atom_id, r.exclusive_group]));
  const weightOf = new Map((existing ?? []).map((r) => [r.atom_id, r.render_weight]));

  const rows = ranked
    .filter((r) => opts.force || !manual.has(r.atomId))
    .map((r) => ({
      atom_id: r.atomId,
      target_id: targetId,
      render_weight: r.weight,
      // 互斥组是人配的，重算权重不该把它抹掉。
      exclusive_group: groupOf.get(r.atomId) ?? null,
      strategy_source: "auto" as const,
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("atom_target_strategy")
      .upsert(rows, { onConflict: "atom_id,target_id" });
    if (error) return fail("没能写入自动分配的结果，再试一次");
  }

  refresh();
  revalidatePath("/app/resume");
  return ok({
    written: rows.length,
    keptManual: opts.force ? 0 : ranked.length - rows.length,
    // 预计行数按最终会生效的那一份算：人改过的行用他自己的值。
    plannedLines: plannedLines(
      ranked.map((r) =>
        !opts.force && manual.has(r.atomId) ? weightOf.get(r.atomId) ?? r.weight : r.weight,
      ),
    ),
    usedAssessment: hasAssessment,
  });
}

/**
 * 每条经历命中的要求权重之和。
 *
 * 权重与命中程度都取自 assessments.results —— 那份 jsonb 里每条要求已经带着
 * weight 和 coverageValue，不用再回 requirements 表join 一次。
 *
 * 乘上 coverageValue 是有意的：一条重要要求只被「勉强沾边」地命中，和被
 * 完整命中，不该给同一条经历同样的分。
 *
 * 只看每份 JD 最新那一次评估 —— 历史评估是快照，拿旧快照排权重，排的是
 * 一份早就改过的 JD。
 */
async function collectHits(
  targetId: string,
  jdIds: string[],
): Promise<{ hits: Map<string, number>; hasAssessment: boolean }> {
  const hits = new Map<string, number>();
  if (jdIds.length === 0) return { hits, hasAssessment: false };

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("assessments")
    .select("id,jd_id,results,created_at")
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (!rows || rows.length === 0) return { hits, hasAssessment: false };

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.jd_id)) latest.set(r.jd_id, r);

  for (const a of latest.values()) {
    for (const r of parseResults(a.results)) {
      const w = r.weight * r.coverageValue;
      if (w <= 0) continue;
      for (const atomId of r.matchedAtomIds) {
        hits.set(atomId, (hits.get(atomId) ?? 0) + w);
      }
    }
  }
  return { hits, hasAssessment: true };
}
