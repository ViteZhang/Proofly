// =============================================================
// Proofly · 简历读取层
//
// 基线生成要的东西比前面任何一步都全：整份经历库 + 这个方向的策略 +
// 护栏 + 技能 + 基本事实 + 这个方向所有 JD 的要求原文。
// 一次查完，因为选材是确定性的 —— 中途再补一次查询就有可能拿到
// 已经变了的数据，生成结果跟「本版取舍」对不上。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parsePendingMetrics, parseStringList } from "@/lib/domain";
import { mergeStrategies, type StrategyRow } from "@/lib/targets/strategy";
import { parseResults } from "@/lib/scoring/parse";
import { listResumeChecks, type CheckRow } from "@/lib/resume/check-results";
import type { GateAtom, GateFact } from "@/lib/resume/gate";
import type { SelectableAtom, SelectableSkill, Tradeoff } from "@/lib/resume/select";
import type {
  AtomContext,
  AtomLevel,
  AtomStatus,
  EvidenceLevel,
  Json,
  RenderWeight,
} from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 门禁要的字段 + 选材要的字段 + 喂模型要的字段，一条经历一份。 */
export type ResumeAtom = GateAtom & {
  level: AtomLevel;
  context: AtomContext;
  status: AtomStatus;
  parentId: string | null;
  renderWeight: RenderWeight;
  exclusiveGroup: string | null;
  sortOrder: number;
  skills: string[];
};

export type BaselineInput = {
  target: { id: string; name: string; narrative: string };
  /** 项目级经历，能力点已并进各自的父经历。未做互斥消解。 */
  atoms: ResumeAtom[];
  skills: SelectableSkill[];
  facts: GateFact[];
  /** 这个方向下所有 JD 的要求原文，用于关键词对齐与技能排序。 */
  rawPhrases: string[];
};

export function toSelectable(a: ResumeAtom): SelectableAtom {
  return {
    id: a.id,
    title: a.title,
    evidenceLevel: a.evidenceLevel,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    renderWeight: a.renderWeight,
    exclusiveGroup: a.exclusiveGroup,
    sortOrder: a.sortOrder,
  };
}

export async function loadBaselineInput(targetId: string): Promise<BaselineInput | null> {
  if (!UUID_RE.test(targetId)) return null;
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("targets")
    .select("id,name,narrative")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return null;

  const [atomRes, strategyRes, metricRes, guardRes, skillRes, linkRes, factRes, jdRes] =
    await Promise.all([
      supabase
        .from("atoms")
        .select(
          "id,parent_id,level,context,org,role,title,period_start,period_end,status,evidence_level,situation,task,actions,pending_metrics,sort_order",
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("atom_target_strategy")
        .select("atom_id,target_id,render_weight,exclusive_group")
        .eq("target_id", targetId),
      supabase
        .from("metrics")
        .select("atom_id,name,kind,from_value,to_value,delta,method,evidence_level"),
      supabase.from("guards").select("atom_id,must_say,never_say,role_framing"),
      supabase.from("skills").select("id,label,category,evidence_strength"),
      supabase.from("atom_skills").select("atom_id,skills(label)"),
      supabase.from("profile_facts").select("key,value,status"),
      supabase.from("jds").select("id").eq("target_id", targetId),
    ]);

  const rows = atomRes.data ?? [];
  const strategies = mergeStrategies(
    rows.map((a) => a.id),
    [targetId],
    (strategyRes.data ?? []) as StrategyRow[],
  );
  const strategyByAtom = new Map(strategies.map((s) => [s.atomId, s]));

  const metricsByAtom = new Map<string, ResumeAtom["metrics"]>();
  for (const m of metricRes.data ?? []) {
    const list = metricsByAtom.get(m.atom_id) ?? [];
    list.push({
      name: m.name,
      kind: m.kind,
      fromValue: m.from_value,
      toValue: m.to_value,
      delta: m.delta,
      method: m.method,
      evidenceLevel: m.evidence_level,
    });
    metricsByAtom.set(m.atom_id, list);
  }

  const guardByAtom = new Map((guardRes.data ?? []).map((g) => [g.atom_id, g]));

  const skillsByAtom = new Map<string, string[]>();
  for (const l of linkRes.data ?? []) {
    const label = (l.skills as { label: string } | null)?.label;
    if (!label) continue;
    const list = skillsByAtom.get(l.atom_id) ?? [];
    list.push(label);
    skillsByAtom.set(l.atom_id, list);
  }

  const jdIds = (jdRes.data ?? []).map((j) => j.id);
  let rawPhrases: string[] = [];
  if (jdIds.length > 0) {
    const { data: reqs } = await supabase
      .from("requirements")
      .select("raw_phrase,text")
      .in("jd_id", jdIds);
    rawPhrases = [
      ...new Set(
        (reqs ?? [])
          .map((r) => (r.raw_phrase ?? r.text ?? "").trim())
          .filter((s) => s !== ""),
      ),
    ];
  }

  const build = (a: (typeof rows)[number]): ResumeAtom => {
    const s = strategyByAtom.get(a.id);
    const g = guardByAtom.get(a.id);
    return {
      id: a.id,
      title: a.title,
      evidenceLevel: a.evidence_level,
      org: a.org,
      role: a.role,
      situation: a.situation,
      task: a.task,
      actions: parseStringList(a.actions),
      metrics: metricsByAtom.get(a.id) ?? [],
      pendingMetricNames: parsePendingMetrics(a.pending_metrics).map((m) => m.name),
      periodStart: a.period_start,
      periodEnd: a.period_end,
      mustSay: parseStringList(g?.must_say),
      neverSay: parseStringList(g?.never_say),
      roleFraming: g?.role_framing ?? null,
      level: a.level,
      context: a.context,
      status: a.status,
      parentId: a.parent_id,
      renderWeight: s?.renderWeight ?? "brief",
      exclusiveGroup: s?.exclusiveGroup ?? null,
      sortOrder: a.sort_order ?? 0,
      skills: skillsByAtom.get(a.id) ?? [],
    };
  };

  const all = rows.map(build);
  const byId = new Map(all.map((a) => [a.id, a]));

  // 一个块 = 一条项目级经历。能力点是项目的细节，并进父经历的
  // actions 与 metrics 里 —— 它们单独成块的话，简历上会出现一段
  // 没有上下文的能力描述，读的人不知道那是在哪做的。
  //
  // 能力点自己被设成「省略」的，连内容一起不并 —— 那是用户明确说过
  // 这个方向下不要提它。
  const projects = all.filter((a) => a.parentId === null);
  for (const a of all) {
    if (a.parentId === null) continue;
    if (a.renderWeight === "omit") continue;
    const parent = byId.get(a.parentId);
    if (!parent) continue;
    parent.actions.push(...a.actions.map((x) => `［${a.title}］${x}`));
    parent.metrics.push(...a.metrics);
    parent.mustSay.push(...a.mustSay);
    parent.neverSay.push(...a.neverSay);
    parent.skills.push(...a.skills);
  }

  return {
    target: { id: target.id, name: target.name, narrative: target.narrative ?? "" },
    atoms: projects,
    skills: (skillRes.data ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      strength: s.evidence_strength,
      category: s.category,
    })),
    facts: (factRes.data ?? []).map((f) => ({
      key: f.key,
      value: f.value,
      status: f.status,
    })),
    rawPhrases,
  };
}

// ---- 基线读取 ----


export type BaselineBlockView = {
  id: string;
  atomId: string | null;
  atomTitle: string;
  /** 来源经历的证明度。块上的 ProofDot 继承它。 */
  evidenceLevel: EvidenceLevel;
  section: string;
  title: string;
  meta: string;
  summary: string;
  bullets: string[];
  templateUsed: EvidenceLevel;
  mustSayCovered: string[];
  edited: boolean;
  orderIndex: number;
};

export type BaselineView = {
  id: string;
  targetId: string;
  targetName: string;
  headline: string;
  lockedAt: string | null;
  generatedAt: string | null;
  blocks: BaselineBlockView[];
  tradeoffs: Tradeoff[];
  skills: string[];
  checks: CheckRow[];
  /** 「为啥选它」：每条经历命中了这个方向下哪几条 JD 要求。 */
  why: Record<string, string[]>;
  /** 未投递的草稿版本数。解锁时要提示「它们的差异会重新计算」。 */
  draftCount: number;
  versionCount: number;
};

export type BaselineSummary = {
  targetId: string;
  targetName: string;
  baselineId: string | null;
  lockedAt: string | null;
  blockCount: number;
  versionCount: number;
  blockingCount: number;
};

function parseTradeoffs(v: Json | null): Tradeoff[] {
  if (!Array.isArray(v)) return [];
  const out: Tradeoff[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json | undefined>;
    const kind = o.kind;
    if (kind !== "omit" && kind !== "exclusive" && kind !== "skill") continue;
    out.push({
      kind,
      atomId: typeof o.atomId === "string" ? o.atomId : null,
      title: typeof o.title === "string" ? o.title : "",
      detail: typeof o.detail === "string" ? o.detail : "",
    });
  }
  return out;
}

/** 每个方向一行：有没有基线、锁没锁、几个块、几份投递版本、几处必须先解决的问题。 */
export async function listBaselines(): Promise<BaselineSummary[]> {
  const supabase = await createClient();

  const [{ data: targets }, { data: baselines }] = await Promise.all([
    supabase
      .from("targets")
      .select("id,name,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("resume_baselines").select("id,target_id,locked_at"),
  ]);
  if (!targets || targets.length === 0) return [];

  const ids = (baselines ?? []).map((b) => b.id);
  const [{ data: blocks }, { data: versions }, { data: checks }] = await Promise.all([
    ids.length
      ? supabase.from("resume_blocks").select("baseline_id").in("baseline_id", ids)
      : Promise.resolve({ data: [] as { baseline_id: string | null }[] }),
    ids.length
      ? supabase.from("resume_versions").select("baseline_id").in("baseline_id", ids)
      : Promise.resolve({ data: [] as { baseline_id: string }[] }),
    supabase
      .from("check_results")
      .select("level,ref_ids")
      .eq("scope", "resume")
      .eq("level", "blocking")
      .is("ignored_at", null)
      .is("resolved_at", null),
  ]);

  const byTarget = new Map((baselines ?? []).map((b) => [b.target_id, b]));
  const blockCount = new Map<string, number>();
  for (const b of blocks ?? []) {
    if (!b.baseline_id) continue;
    blockCount.set(b.baseline_id, (blockCount.get(b.baseline_id) ?? 0) + 1);
  }
  const versionCount = new Map<string, number>();
  for (const v of versions ?? []) {
    versionCount.set(v.baseline_id, (versionCount.get(v.baseline_id) ?? 0) + 1);
  }
  const blockingCount = new Map<string, number>();
  for (const c of checks ?? []) {
    const owner = (c.ref_ids as { owner?: string } | null)?.owner;
    if (typeof owner !== "string") continue;
    blockingCount.set(owner, (blockingCount.get(owner) ?? 0) + 1);
  }

  return targets.map((t) => {
    const b = byTarget.get(t.id);
    return {
      targetId: t.id,
      targetName: t.name,
      baselineId: b?.id ?? null,
      lockedAt: b?.locked_at ?? null,
      blockCount: b ? blockCount.get(b.id) ?? 0 : 0,
      versionCount: b ? versionCount.get(b.id) ?? 0 : 0,
      blockingCount: b ? blockingCount.get(`baseline:${b.id}`) ?? 0 : 0,
    };
  });
}

export async function getBaseline(targetId: string): Promise<BaselineView | null> {
  if (!UUID_RE.test(targetId)) return null;
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("targets")
    .select("id,name")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return null;

  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("id,headline,locked_at,generated_at,tradeoffs,skills,block_order")
    .eq("target_id", targetId)
    .maybeSingle();
  if (!baseline) return null;

  const [{ data: rows }, { data: versions }, checks, why] = await Promise.all([
    supabase
      .from("resume_blocks")
      .select(
        "id,atom_id,section,title,meta,summary,bullets,template_used,must_say_covered,edited,order_index,atoms(title,evidence_level)",
      )
      .eq("baseline_id", baseline.id)
      .order("order_index", { ascending: true }),
    supabase.from("resume_versions").select("id,submitted_at").eq("baseline_id", baseline.id),
    listResumeChecks({ kind: "baseline", id: baseline.id }),
    whySelected(targetId),
  ]);

  const blocks: BaselineBlockView[] = (rows ?? []).map((r) => {
    const atom = r.atoms as { title: string; evidence_level: EvidenceLevel } | null;
    const template = (r.template_used ?? "absent") as EvidenceLevel;
    return {
      id: r.id,
      atomId: r.atom_id,
      atomTitle: atom?.title ?? "（来源经历已删除）",
      evidenceLevel: atom?.evidence_level ?? template,
      section: r.section ?? "",
      title: r.title ?? "",
      meta: r.meta ?? "",
      summary: r.summary ?? "",
      bullets: parseStringList(r.bullets),
      templateUsed: template,
      mustSayCovered: parseStringList(r.must_say_covered),
      edited: r.edited,
      orderIndex: r.order_index ?? 0,
    };
  });

  return {
    id: baseline.id,
    targetId: target.id,
    targetName: target.name,
    headline: baseline.headline ?? "",
    lockedAt: baseline.locked_at,
    generatedAt: baseline.generated_at,
    blocks,
    tradeoffs: parseTradeoffs(baseline.tradeoffs),
    skills: parseStringList(baseline.skills),
    checks,
    why,
    draftCount: (versions ?? []).filter((v) => !v.submitted_at).length,
    versionCount: (versions ?? []).length,
  };
}

/**
 * 每条经历命中了这个方向下哪几条 JD 要求。
 *
 * 只看每份 JD 最新那次评估 —— 历史评估是快照，拿旧快照说「命中第 2 条」，
 * 而那条要求早就被编辑过了，说出来的话是错的。
 */
async function whySelected(targetId: string): Promise<Record<string, string[]>> {
  const supabase = await createClient();

  const { data: jds } = await supabase
    .from("jds")
    .select("id,company,role_title")
    .eq("target_id", targetId);
  if (!jds || jds.length === 0) return {};

  const { data: rows } = await supabase
    .from("assessments")
    .select("id,jd_id,results,created_at")
    .in("jd_id", jds.map((j) => j.id))
    // created_at 是事务时间，同一事务插的多条会撞，补 id 兜底。
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (!rows || rows.length === 0) return {};

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.jd_id)) latest.set(r.jd_id, r);

  const label = new Map(
    jds.map((j) => [j.id, [j.company, j.role_title].filter(Boolean).join(" · ") || "这份 JD"]),
  );

  const out: Record<string, string[]> = {};
  for (const a of latest.values()) {
    for (const r of parseResults(a.results as Json)) {
      const phrase = (r.rawPhrase ?? r.text ?? "").trim();
      for (const id of r.matchedAtomIds) {
        const line = `命中「${label.get(a.jd_id)}」第 ${r.requirementIndex + 1} 条「${phrase.slice(0, 28)}」`;
        (out[id] ??= []).push(line);
      }
    }
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 4);
  return out;
}
