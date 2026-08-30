// =============================================================
// Proofly · 行动生成的输入组装
//
// 5.2 的四项输入：未解决缺口 · 可挂靠项目 · 技能全景 · 每条缺口的算分现状。
//
// 缺口必须一次性把全部方向的取齐再送进模型。只送一个方向的，
// 「跨方向复用度」这个排序依据就无从谈起 —— 它恰恰来自
// 「一条任务同时补多个方向的缺口」。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { WEIGHT } from "@/lib/scoring/config";
import { parseResults } from "@/lib/scoring/parse";
import { MAX_GAPS_IN } from "@/lib/planning/config";
import type { GapState } from "@/lib/planning/impact";
import type { AtomStatus, GapSeverity, GapType, Json } from "@/types/database";

/** 一条待处理缺口的全貌：给模型看的部分 + 给 impact 公式用的部分。 */
export type OpenGap = {
  id: string;
  targetId: string;
  targetName: string;
  assessmentId: string;
  requirementIndex: number;
  text: string;
  gapType: GapType;
  severity: GapSeverity;
  scoreLoss: number;
  matchedTitles: string[];
  emptySkillLabels: string[];
  /** 算 impact 要用的现状，全部来自那次评估冻结下来的 results。 */
  state: GapState;
};

export type AnchorAtom = {
  id: string;
  title: string;
  status: AtomStatus;
  evidenceLevel: string;
  situation: string;
  /** 当前待补数据项：有名字但没数值的指标。 */
  pendingMetrics: string[];
};

type DetailShape = {
  text?: unknown;
  matchedTitles?: unknown;
  emptySkillLabels?: unknown;
};

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * 全部方向下 resolved_at 与 dismissed_at 均为空的缺口，按失分降序取前 25。
 *
 * 只认「每份 JD 的最新一次评估」产生的缺口。历史评估的缺口早就不代表现状了，
 * 拿它们生成任务等于让人去补一个已经补上的洞。
 */
export async function listOpenGaps(): Promise<OpenGap[]> {
  const supabase = await createClient();

  const { data: targets } = await supabase.from("targets").select("id,name");
  if (!targets || targets.length === 0) return [];
  const targetName = new Map(targets.map((t) => [t.id, t.name]));

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id,jd_id,target_id,results,created_at")
    // created_at 默认 now() 是事务时间，同一事务插的多条会撞，补 id 兜底。
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  type AssessmentRow = NonNullable<typeof assessments>[number];
  const latestByJd = new Map<string, AssessmentRow>();
  for (const a of assessments ?? []) {
    if (!latestByJd.has(a.jd_id)) latestByJd.set(a.jd_id, a);
  }
  if (latestByJd.size === 0) return [];
  const latestById = new Map([...latestByJd.values()].map((a) => [a.id, a]));

  const { data: gaps } = await supabase
    .from("gaps")
    .select("id,assessment_id,requirement_index,gap_type,severity,score_impact,detail")
    .is("resolved_at", null)
    .is("dismissed_at", null)
    .in("assessment_id", [...latestById.keys()]);

  const out: OpenGap[] = [];
  for (const g of gaps ?? []) {
    const a = latestById.get(g.assessment_id);
    if (!a) continue;

    const results = parseResults(a.results as Json);
    const sumWeight = results.reduce((s, r) => s + WEIGHT[r.kind], 0);
    const r = results.find((x) => x.requirementIndex === g.requirement_index);
    // 那次评估的 results 里找不到对应要求，说明数据被改坏了。
    // 这条缺口没法算 impact，跳过好过算出一个假数字。
    if (!r || sumWeight <= 0) continue;

    const d = (g.detail ?? {}) as DetailShape;
    out.push({
      id: g.id,
      targetId: a.target_id,
      targetName: targetName.get(a.target_id) ?? "未知方向",
      assessmentId: a.id,
      requirementIndex: g.requirement_index ?? r.requirementIndex,
      text: typeof d.text === "string" && d.text ? d.text : r.text,
      gapType: g.gap_type,
      severity: g.severity,
      scoreLoss: g.score_impact ?? r.scoreLoss,
      matchedTitles: strList(d.matchedTitles),
      emptySkillLabels: strList(d.emptySkillLabels),
      state: {
        weight: r.weight,
        coverage: r.coverageValue,
        evidenceMultiplier: r.evidenceMultiplier,
        sumWeight,
        scoreLoss: g.score_impact ?? r.scoreLoss,
      },
    });
  }

  // 失分降序取前 25。超过 25 条说明该重新评估，而不是生成任务。
  return out.sort((a, b) => b.scoreLoss - a.scoreLoss).slice(0, MAX_GAPS_IN);
}

/**
 * 可挂靠项目：在做的、做完的 project 级原子。
 * 造证据类任务必须挂靠在这些上面，不许为了补一个技能去开新项目 ——
 * 凭空造的小工具没有业务上下文，一问就是「为了简历做的」。
 */
export async function listAnchorAtoms(): Promise<AnchorAtom[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("atoms")
    .select("id,title,status,evidence_level,situation,created_at")
    .eq("level", "project")
    .in("status", ["in_dev", "design_done", "shipped"])
    .in("context", ["employment", "side_project"])
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) return [];

  const { data: metrics } = await supabase
    .from("metrics")
    .select("atom_id,name,from_value,to_value,delta")
    .in(
      "atom_id",
      data.map((a) => a.id),
    );

  const pending = new Map<string, string[]>();
  for (const m of metrics ?? []) {
    const empty = !m.from_value && !m.to_value && !m.delta;
    if (!empty) continue;
    pending.set(m.atom_id, [...(pending.get(m.atom_id) ?? []), m.name]);
  }

  return data.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    evidenceLevel: a.evidence_level,
    situation: (a.situation ?? "").slice(0, 200),
    pendingMetrics: pending.get(a.id) ?? [],
  }));
}
