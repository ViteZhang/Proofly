// =============================================================
// Proofly · 面试题包的读取
//
// 出题的依据是「本次投递版本实际用到的经历」，不是经历库全量 ——
// 面试官只会问简历上写了的东西。所以入口是 resume_versions，
// 用到哪几条经历由 resume_blocks 决定。
//
// 喂给模型的经历必须带 metrics.method 与 guards.probes：
// 前者是「有数字但说不清口径」这类题的判据，后者是用户自己写好的
// 追问预案 —— 人工写的比重新造一个准，直接转成题目。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parseProbes, parseStringList, type Probe } from "@/lib/domain";
import { getVersion, type BaselineBlockView } from "@/lib/queries/resume";
import type { RiskAtom, RiskMetric } from "@/lib/interview/risk";
import type {
  AtomStatus,
  EvidenceLevel,
  InterviewKind,
  PracticeStatus,
  ProbeType,
  QuestionDifficulty,
  RiskLevel,
  Json,
} from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type KitMetric = RiskMetric & {
  fromValue: string | null;
  toValue: string | null;
  delta: string | null;
};

export type KitAtom = {
  id: string;
  title: string;
  org: string | null;
  role: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: AtomStatus;
  evidenceLevel: EvidenceLevel;
  situation: string | null;
  task: string | null;
  actions: string[];
  metrics: KitMetric[];
  mustSay: string[];
  neverSay: string[];
  probes: Probe[];
  skills: string[];
  /** 这条经历在本次简历里的块。null 不会出现 —— 入口就是按块取的。 */
  block: BaselineBlockView | null;
};

export type KitRequirement = {
  index: number;
  text: string;
  kind: string;
  rawPhrase: string;
};

export type KitInput = {
  versionId: string;
  jdId: string;
  targetId: string;
  company: string;
  roleTitle: string;
  requirements: KitRequirement[];
  atoms: KitAtom[];
  blocks: BaselineBlockView[];
  skills: { label: string; category: string | null; depth: string }[];
};

/** 把 KitAtom 削成风险判定要的那几项。 */
export function toRiskAtom(a: KitAtom): RiskAtom {
  return {
    id: a.id,
    title: a.title,
    evidenceLevel: a.evidenceLevel,
    status: a.status,
    metrics: a.metrics,
    block: a.block ? { summary: a.block.summary, bullets: a.block.bullets } : null,
  };
}

export async function loadKitInput(versionId: string): Promise<KitInput | null> {
  if (!UUID_RE.test(versionId)) return null;
  const supabase = await createClient();

  const version = await getVersion(versionId);
  if (!version) return null;

  // 本次简历实际用到的经历。block.atomId 为 null 的块（教育背景之类）
  // 不出题 —— 没有经历可挖。
  const atomIds = [...new Set(version.blocks.map((b) => b.atomId).filter((x): x is string => !!x))];
  if (atomIds.length === 0) {
    return {
      versionId,
      jdId: version.jdId,
      targetId: version.targetId,
      company: version.company,
      roleTitle: version.roleTitle,
      requirements: [],
      atoms: [],
      blocks: version.blocks,
      skills: [],
    };
  }

  // 能力点的指标与护栏要并进父经历：简历上没有能力点自己的块，
  // 但「那条没口径的数字」照样会被问，只是问的时候挂在父项目名下。
  const { data: children } = await supabase
    .from("atoms")
    .select("id,parent_id")
    .in("parent_id", atomIds);
  const parentOf = new Map<string, string>();
  for (const c of children ?? []) if (c.parent_id) parentOf.set(c.id, c.parent_id);
  const allIds = [...new Set([...atomIds, ...parentOf.keys()])];

  const [atomRes, metricRes, guardRes, linkRes, reqRes] = await Promise.all([
    supabase
      .from("atoms")
      .select(
        "id,title,org,role,period_start,period_end,status,evidence_level,situation,task,actions",
      )
      .in("id", allIds),
    supabase
      .from("metrics")
      .select("id,atom_id,name,kind,from_value,to_value,delta,method,evidence_level")
      .in("atom_id", allIds),
    supabase.from("guards").select("atom_id,must_say,never_say,probes").in("atom_id", allIds),
    supabase.from("atom_skills").select("atom_id,skills(label,category,depth)").in("atom_id", allIds),
    supabase
      .from("requirements")
      .select("idx,text,kind,raw_phrase")
      .eq("jd_id", version.jdId)
      .order("idx", { ascending: true }),
  ]);

  const metricsByAtom = new Map<string, KitMetric[]>();
  for (const m of metricRes.data ?? []) {
    const list = metricsByAtom.get(m.atom_id) ?? [];
    list.push({
      id: m.id,
      name: m.name,
      kind: m.kind,
      evidenceLevel: m.evidence_level,
      method: m.method,
      fromValue: m.from_value,
      toValue: m.to_value,
      delta: m.delta,
    });
    metricsByAtom.set(m.atom_id, list);
  }

  const guardByAtom = new Map((guardRes.data ?? []).map((g) => [g.atom_id, g]));

  const skillsByAtom = new Map<string, { label: string; category: string | null; depth: string }[]>();
  for (const l of linkRes.data ?? []) {
    const s = l.skills as { label: string; category: string | null; depth: string } | null;
    if (!s) continue;
    const list = skillsByAtom.get(l.atom_id) ?? [];
    list.push(s);
    skillsByAtom.set(l.atom_id, list);
  }

  const blockByAtom = new Map<string, BaselineBlockView>();
  for (const b of version.blocks) if (b.atomId && !blockByAtom.has(b.atomId)) blockByAtom.set(b.atomId, b);

  const rowById = new Map((atomRes.data ?? []).map((a) => [a.id, a]));

  const atoms: KitAtom[] = atomIds
    .map((id) => rowById.get(id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => {
      const g = guardByAtom.get(a.id);
      const own = skillsByAtom.get(a.id) ?? [];
      return {
        id: a.id,
        title: a.title,
        org: a.org,
        role: a.role,
        periodStart: a.period_start,
        periodEnd: a.period_end,
        status: a.status,
        evidenceLevel: a.evidence_level,
        situation: a.situation,
        task: a.task,
        actions: parseStringList(a.actions),
        metrics: metricsByAtom.get(a.id) ?? [],
        mustSay: parseStringList(g?.must_say),
        neverSay: parseStringList(g?.never_say),
        probes: parseProbes(g?.probes),
        skills: own.map((s) => s.label),
        block: blockByAtom.get(a.id) ?? null,
      };
    });

  const byId = new Map(atoms.map((a) => [a.id, a]));
  for (const [childId, parentId] of parentOf) {
    const parent = byId.get(parentId);
    const child = rowById.get(childId);
    if (!parent || !child) continue;
    parent.actions.push(...parseStringList(child.actions).map((x) => `［${child.title}］${x}`));
    parent.metrics.push(...(metricsByAtom.get(childId) ?? []));
    const g = guardByAtom.get(childId);
    parent.mustSay.push(...parseStringList(g?.must_say));
    parent.neverSay.push(...parseStringList(g?.never_say));
    parent.probes.push(...parseProbes(g?.probes));
    parent.skills.push(...(skillsByAtom.get(childId) ?? []).map((s) => s.label));
  }
  for (const a of atoms) a.skills = [...new Set(a.skills)];

  const skillSeen = new Map<string, { label: string; category: string | null; depth: string }>();
  for (const list of skillsByAtom.values()) for (const s of list) skillSeen.set(s.label, s);

  return {
    versionId,
    jdId: version.jdId,
    targetId: version.targetId,
    company: version.company,
    roleTitle: version.roleTitle,
    requirements: (reqRes.data ?? []).map((r, i) => ({
      index: r.idx ?? i,
      text: r.text,
      kind: r.kind,
      rawPhrase: r.raw_phrase ?? "",
    })),
    atoms,
    blocks: version.blocks,
    skills: [...skillSeen.values()],
  };
}

// ---- 题包读取 ----

export type QuestionView = {
  id: string;
  kind: InterviewKind;
  question: string;
  probeType: ProbeType | null;
  difficulty: QuestionDifficulty | null;
  fromAtomId: string | null;
  fromAtomTitle: string | null;
  /** 来源经历的证明度。题目卡上的 ProofDot 继承它。 */
  fromAtomEvidence: EvidenceLevel | null;
  fromExistingProbe: boolean;
  riskLevel: RiskLevel;
  riskReason: string | null;
  answerOutline: { label: string; content: string }[];
  dontDo: string | null;
  dataGapHint: string | null;
  gapMetricId: string | null;
  relatedAtomIds: string[];
  relatedAtomTitles: string[];
  whyThisQuestion: string | null;
  practiceStatus: PracticeStatus;
  practiceNote: string | null;
  carriedOver: boolean;
  sortOrder: number;
};

export type KitView = {
  id: string;
  versionId: string;
  jdId: string;
  targetId: string;
  company: string;
  roleTitle: string;
  generatedAt: string | null;
  questions: QuestionView[];
  /** 本次简历中出现的全部实测指标及其口径。小抄第 4 块用，界面上也能用。 */
  numbers: {
    atomTitle: string;
    name: string;
    value: string;
    method: string | null;
  }[];
};

export function parseOutline(v: Json | null | undefined): { label: string; content: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { label: string; content: string }[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json | undefined>;
    out.push({
      label: typeof o.label === "string" ? o.label : "",
      content: typeof o.content === "string" ? o.content : "",
    });
  }
  return out;
}

/** 指标的展示值：有起止就写「A → B」，否则退回 delta。 */
export function metricValue(m: {
  fromValue: string | null;
  toValue: string | null;
  delta: string | null;
}): string {
  if (m.fromValue && m.toValue) return `${m.fromValue} → ${m.toValue}`;
  return m.toValue ?? m.delta ?? m.fromValue ?? "";
}

/** 高风险固定置顶，其次 struggling > untouched > practiced，最后按生成顺序。 */
const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
const PRACTICE_RANK: Record<PracticeStatus, number> = {
  struggling: 0,
  untouched: 1,
  practiced: 2,
};

export function sortQuestions(list: QuestionView[]): QuestionView[] {
  return [...list].sort(
    (a, b) =>
      RISK_RANK[a.riskLevel] - RISK_RANK[b.riskLevel] ||
      PRACTICE_RANK[a.practiceStatus] - PRACTICE_RANK[b.practiceStatus] ||
      a.sortOrder - b.sortOrder,
  );
}

/** 某个投递版本的题包。没生成过返回 null。 */
export async function getKit(versionId: string): Promise<KitView | null> {
  if (!UUID_RE.test(versionId)) return null;
  const supabase = await createClient();

  const { data: kit } = await supabase
    .from("interview_kits")
    .select("id,resume_version_id,target_id,jd_id,generated_at")
    .eq("resume_version_id", versionId)
    .order("generated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!kit) return null;
  return loadKit(kit);
}

/** 按题包 id 读。导出与打印路由用的是这一个。 */
export async function getKitById(kitId: string): Promise<KitView | null> {
  if (!UUID_RE.test(kitId)) return null;
  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("interview_kits")
    .select("id,resume_version_id,target_id,jd_id,generated_at")
    .eq("id", kitId)
    .maybeSingle();
  if (!kit || !kit.resume_version_id) return null;
  return loadKit(kit);
}

type KitRow = {
  id: string;
  resume_version_id: string | null;
  target_id: string;
  jd_id: string | null;
  generated_at: string | null;
};

async function loadKit(kit: KitRow): Promise<KitView | null> {
  const supabase = await createClient();
  const versionId = kit.resume_version_id ?? "";

  const [{ data: rows }, { data: jd }] = await Promise.all([
    supabase
      .from("interview_questions")
      .select("*,atoms(title,evidence_level)")
      .eq("kit_id", kit.id)
      .order("sort_order", { ascending: true }),
    supabase.from("jds").select("company,role_title").eq("id", kit.jd_id ?? "").maybeSingle(),
  ]);

  const questions: QuestionView[] = (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    question: r.question,
    probeType: r.probe_type,
    difficulty: r.difficulty,
    fromAtomId: r.from_atom_id,
    fromAtomTitle: (r.atoms as { title: string } | null)?.title ?? null,
    fromAtomEvidence:
      (r.atoms as { evidence_level: EvidenceLevel } | null)?.evidence_level ?? null,
    fromExistingProbe: r.from_existing_probe ?? false,
    riskLevel: r.risk_level,
    riskReason: r.risk_reason,
    answerOutline: parseOutline(r.answer_outline),
    dontDo: r.dont_do,
    dataGapHint: r.data_gap_hint,
    gapMetricId: r.gap_metric_id,
    relatedAtomIds: parseStringList(r.related_atom_ids),
    relatedAtomTitles: [],
    whyThisQuestion: r.why_this_question,
    practiceStatus: r.practice_status,
    practiceNote: r.practice_note,
    carriedOver: r.carried_over,
    sortOrder: r.sort_order,
  }));

  // 案例题引用的经历标题：一次查完，不在渲染里逐条打点。
  const relatedIds = [...new Set(questions.flatMap((q) => q.relatedAtomIds))];
  if (relatedIds.length > 0) {
    const { data: titles } = await supabase.from("atoms").select("id,title").in("id", relatedIds);
    const titleById = new Map((titles ?? []).map((t) => [t.id, t.title]));
    for (const q of questions) {
      q.relatedAtomTitles = q.relatedAtomIds
        .map((id) => titleById.get(id))
        .filter((t): t is string => !!t);
    }
  }

  const input = await loadKitInput(versionId);
  const numbers = (input?.atoms ?? []).flatMap((a) =>
    a.metrics
      .filter((m) => m.evidenceLevel === "measured")
      .map((m) => ({
        atomTitle: a.title,
        name: m.name,
        value: metricValue(m),
        method: m.method,
      })),
  );

  return {
    id: kit.id,
    versionId,
    jdId: kit.jd_id ?? "",
    targetId: kit.target_id,
    company: jd?.company ?? "",
    roleTitle: jd?.role_title ?? "",
    generatedAt: kit.generated_at,
    questions: sortQuestions(questions),
    numbers,
  };
}

// ---- 版本选择器 ----

export type VersionOption = {
  id: string;
  company: string;
  roleTitle: string;
  targetName: string;
  submittedAt: string | null;
  updatedAt: string | null;
  /** 已经出过题的版本显示题数；没出过显示「去出题」。 */
  questionCount: number;
  highRiskCount: number;
};

/** 可以出题的投递版本。已投递的排前面 —— 面试是投出去之后的事。 */
export async function listVersionOptions(): Promise<VersionOption[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("resume_versions")
    .select("id,jd_id,baseline_id,submitted_at,updated_at")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (!rows || rows.length === 0) return [];

  const [{ data: jds }, { data: baselines }, { data: targets }, { data: kits }] =
    await Promise.all([
      supabase.from("jds").select("id,company,role_title").in("id", rows.map((r) => r.jd_id)),
      supabase
        .from("resume_baselines")
        .select("id,target_id")
        .in("id", rows.map((r) => r.baseline_id)),
      supabase.from("targets").select("id,name"),
      supabase
        .from("interview_kits")
        .select("id,resume_version_id")
        .in("resume_version_id", rows.map((r) => r.id)),
    ]);

  const kitIds = (kits ?? []).map((k) => k.id);
  const countByVersion = new Map<string, { total: number; high: number }>();
  if (kitIds.length > 0) {
    const { data: qs } = await supabase
      .from("interview_questions")
      .select("kit_id,risk_level")
      .in("kit_id", kitIds);
    const versionOfKit = new Map(
      (kits ?? []).map((k) => [k.id, k.resume_version_id ?? ""]),
    );
    for (const q of qs ?? []) {
      const vid = versionOfKit.get(q.kit_id);
      if (!vid) continue;
      const cur = countByVersion.get(vid) ?? { total: 0, high: 0 };
      cur.total += 1;
      if (q.risk_level === "high") cur.high += 1;
      countByVersion.set(vid, cur);
    }
  }

  const jdById = new Map((jds ?? []).map((j) => [j.id, j]));
  const targetOfBaseline = new Map((baselines ?? []).map((b) => [b.id, b.target_id]));
  const nameOfTarget = new Map((targets ?? []).map((t) => [t.id, t.name]));

  return rows.map((r) => {
    const jd = jdById.get(r.jd_id);
    const counts = countByVersion.get(r.id) ?? { total: 0, high: 0 };
    return {
      id: r.id,
      company: jd?.company ?? "未填公司",
      roleTitle: jd?.role_title ?? "未填岗位",
      targetName: nameOfTarget.get(targetOfBaseline.get(r.baseline_id) ?? "") ?? "未知方向",
      submittedAt: r.submitted_at,
      updatedAt: r.updated_at,
      questionCount: counts.total,
      highRiskCount: counts.high,
    };
  });
}

// 概览计算搬到 lib/interview/view.ts —— 客户端组件要用，
// 从这里 import 会把服务端 Supabase 客户端一起拖进 bundle。
export { overviewOf, type KitOverview } from "@/lib/interview/view";
