// =============================================================
// Proofly · 经历读取层
// 一律 Server Component 直接查库，不经 API Route。
// RLS 已按 user_id 隔离，这里不再手工拼 user_id 条件。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import {
  EVIDENCE_ORDER,
  EVIDENCE_WEIGHT,
  parsePendingMetrics,
  parseProbes,
  parseStringList,
  type PendingMetric,
  type Probe,
} from "@/lib/domain";
import type {
  AtomContext,
  AtomLevel,
  AtomStatus,
  Database,
  EvidenceLevel,
  EvidenceStrength,
  MetricKind,
  SkillDepth,
} from "@/types/database";

type AtomRow = Database["public"]["Tables"]["atoms"]["Row"];

// 树里每个节点只带展示需要的列，正文（situation/task/actions）留给详情查询。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TREE_COLUMNS =
  "id,parent_id,level,context,org,role,title,period_start,period_end,status,evidence_level,sort_order";

export type AtomNode = {
  id: string;
  parent_id: string | null;
  level: AtomLevel;
  context: AtomContext;
  org: string | null;
  role: string | null;
  title: string;
  period_start: string | null;
  period_end: string | null;
  status: AtomStatus;
  evidence_level: EvidenceLevel;
  sort_order: number;
  childCount: number;
  children: AtomNode[];
};

// 分组管归属（哪家公司 / 个人 / 志愿），分节管时态（还在做 / 已结束）。
// 把两者混成一个维度的话，一家公司结束的那一刻 org 这层信息就没了，
// 只能把公司名塞进每条经历的标题里当前缀。
export type AtomGroupTense = "current" | "past" | "timeless";

export type AtomGroup = {
  key: string;
  title: string;
  tense: AtomGroupTense;
  period: string | null; // 组标题右侧：「2023.05 – 至今」/「2019.04 – 2021.08」
  atoms: AtomNode[];
};

export type AtomTree = {
  groups: AtomGroup[];
  total: number; // 含能力点，与筛选胶囊「全部 N」一致
};

// 归属：任职按 org 分，其余按 context 各成一组。
// 注意这里不看 period —— 时态是整个 org 的属性，在下面按组算。
function belongsTo(atom: AtomNode): { key: string; title: string } {
  if (atom.context === "employment") {
    const org = atom.org?.trim();
    return { key: `org:${org || "__none__"}`, title: org || "未填组织" };
  }
  return { key: `context:${atom.context}`, title: CONTEXT_GROUP[atom.context] };
}

// 非任职的三种归属。个人项目做完了也还留在这里——它是类别，不是时态。
const CONTEXT_GROUP: Record<AtomContext, string> = {
  employment: "任职",
  side_project: "个人项目",
  volunteer: "志愿",
  community: "社区",
};

// timeless 组固定排在在职之后、过往之前，组间按这个顺序
const CONTEXT_RANK: Record<string, number> = {
  "context:side_project": 0,
  "context:volunteer": 1,
  "context:community": 2,
};

const month = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}`;

/**
 * 一个 org 组的时态与周期。
 * 只看顶层经历：能力点通常不填周期，把它们算进来会让每家公司都显示成在职。
 * 组里还有任何一条没填结束时间，这家公司就还在职——同司的其他项目结束了
 * 也不该被拆到「过往经历」里去。
 */
function tenseOf(atoms: AtomNode[]): { tense: "current" | "past"; period: string | null } {
  const running = atoms.some((a) => a.period_end === null);
  const starts = atoms.map((a) => a.period_start).filter((d): d is string => !!d);
  const ends = atoms.map((a) => a.period_end).filter((d): d is string => !!d);
  const from = starts.length > 0 ? month(starts.reduce((a, b) => (a < b ? a : b))) : null;

  if (running) {
    return { tense: "current", period: from ? `${from} – 至今` : null };
  }
  const to = ends.length > 0 ? month(ends.reduce((a, b) => (a > b ? a : b))) : null;
  if (!from && !to) return { tense: "past", period: null };
  return { tense: "past", period: from ? `${from} – ${to}` : `至 ${to}` };
}

function toNode(row: Pick<AtomRow, keyof AtomRow & string>): AtomNode {
  return {
    id: row.id,
    parent_id: row.parent_id,
    level: row.level,
    context: row.context,
    org: row.org,
    role: row.role,
    title: row.title,
    period_start: row.period_start,
    period_end: row.period_end,
    status: row.status,
    evidence_level: row.evidence_level,
    sort_order: row.sort_order ?? 0,
    childCount: 0,
    children: [],
  };
}

const bySort = (a: AtomNode, b: AtomNode) =>
  a.sort_order - b.sort_order || a.title.localeCompare(b.title, "zh-Hans-CN");

/**
 * 按 context 分组、父子嵌套的经历树。
 * 组内按 sort_order 排；能力点挂在各自 project 下，不单独成组。
 */
export async function getAtomTree(): Promise<AtomTree> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atoms")
    .select(TREE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`读取经历树失败：${error.message}`);

  const rows = (data ?? []) as unknown as AtomRow[];
  const nodes = new Map<string, AtomNode>();
  for (const row of rows) nodes.set(row.id, toNode(row));

  // 挂子级。父级不存在（理论上被外键挡住）时按顶层处理，不丢数据。
  const roots: AtomNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of nodes.values()) {
    node.children.sort(bySort);
    node.childCount = node.children.length;
  }
  roots.sort(bySort);

  const index = new Map<string, AtomGroup>();
  const groups: AtomGroup[] = [];
  for (const root of roots) {
    const g = belongsTo(root);
    let group = index.get(g.key);
    if (!group) {
      group = { key: g.key, title: g.title, tense: "timeless", period: null, atoms: [] };
      index.set(g.key, group);
      groups.push(group);
    }
    group.atoms.push(root);
  }

  // 任职组的时态按整组算完，才能决定它排在分节线的哪一边
  for (const group of groups) {
    if (!group.key.startsWith("org:")) continue;
    const { tense, period } = tenseOf(group.atoms);
    group.tense = tense;
    group.period = period;
  }

  // 在职任职（近的在前）→ 个人项目 / 志愿 / 社区 →「过往经历」分节线 → 过往任职（近的在前）
  const tenseRank = { current: 0, timeless: 1, past: 2 } as const;
  const latest = (g: AtomGroup, field: "period_start" | "period_end") =>
    g.atoms.map((a) => a[field]).filter(Boolean).sort().at(-1) ?? "";
  groups.sort((a, b) => {
    if (tenseRank[a.tense] !== tenseRank[b.tense]) return tenseRank[a.tense] - tenseRank[b.tense];
    if (a.tense === "timeless") {
      return (CONTEXT_RANK[a.key] ?? 9) - (CONTEXT_RANK[b.key] ?? 9);
    }
    const field = a.tense === "past" ? "period_end" : "period_start";
    return latest(b, field).localeCompare(latest(a, field));
  });

  return { groups, total: nodes.size };
}

// ---- 详情 ----

export type AtomMetric = {
  id: string;
  name: string;
  kind: MetricKind;
  from_value: string | null;
  to_value: string | null;
  delta: string | null;
  evidence_level: EvidenceLevel;
  method: string | null;
};

export type AtomGuards = {
  id: string;
  must_say: string[];
  never_say: string[];
  role_framing: string | null;
  probes: Probe[];
};

export type AtomSkill = {
  linkId: string;
  id: string;
  label: string;
  category: string | null;
  depth: SkillDepth | null;
  evidence_strength: EvidenceStrength;
  // 这个技能一共被几条经历关联着。解除时要立刻说清楚会不会解成孤儿，
  // 所以顺手带出来，别让界面为了一句提示再跑一趟服务端。
  linkCount: number;
};

export type AtomDetail = {
  id: string;
  parent_id: string | null;
  parent: { id: string; title: string } | null;
  level: AtomLevel;
  context: AtomContext;
  org: string | null;
  role: string | null;
  title: string;
  period_start: string | null;
  period_end: string | null;
  situation: string | null;
  task: string | null;
  actions: string[];
  status: AtomStatus;
  evidence_level: EvidenceLevel;
  pending_metrics: PendingMetric[];
  sort_order: number;
  children: { id: string; title: string; evidence_level: EvidenceLevel }[];
  metrics: AtomMetric[];
  guards: AtomGuards | null;
  skills: AtomSkill[];
};

/**
 * 单条经历及其指标、护栏、技能。
 * id 不存在或不属于当前用户时返回 null，交由页面走优雅降级（验收 27）。
 */
export async function getAtomDetail(id: string): Promise<AtomDetail | null> {
  // ?atom= 是用户可以随手改的。不是 uuid 就当没这条，别让 Postgres 抛 22P02。
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();

  const { data: atom, error } = await supabase
    .from("atoms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`读取经历失败：${error.message}`);
  if (!atom) return null;

  const [parentRes, childrenRes, metricsRes, guardsRes, skillsRes] = await Promise.all([
    atom.parent_id
      ? supabase.from("atoms").select("id,title").eq("id", atom.parent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("atoms")
      .select("id,title,evidence_level,sort_order")
      .eq("parent_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("metrics")
      .select("id,name,kind,from_value,to_value,delta,evidence_level,method")
      .eq("atom_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("guards")
      .select("id,must_say,never_say,role_framing,probes")
      .eq("atom_id", id)
      .maybeSingle(),
    supabase
      .from("atom_skills")
      .select("id,skill:skills(id,label,category,depth,evidence_strength)")
      .eq("atom_id", id),
  ]);

  const guards = guardsRes.data
    ? {
        id: guardsRes.data.id,
        must_say: parseStringList(guardsRes.data.must_say),
        never_say: parseStringList(guardsRes.data.never_say),
        role_framing: guardsRes.data.role_framing,
        probes: parseProbes(guardsRes.data.probes),
      }
    : null;

  const linked = (skillsRes.data ?? []).flatMap((row) => {
    // PostgREST 的嵌套关系在类型上可能是对象或数组，统一摊平。
    const s = Array.isArray(row.skill) ? row.skill[0] : row.skill;
    return s ? [{ linkId: row.id, ...s }] : [];
  });

  const counts = new Map<string, number>();
  if (linked.length > 0) {
    const { data: allLinks } = await supabase
      .from("atom_skills")
      .select("skill_id")
      .in(
        "skill_id",
        linked.map((s) => s.id),
      );
    for (const l of allLinks ?? []) counts.set(l.skill_id, (counts.get(l.skill_id) ?? 0) + 1);
  }

  const skills: AtomSkill[] = linked
    .map((s) => ({ ...s, linkCount: counts.get(s.id) ?? 1 }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));

  return {
    id: atom.id,
    parent_id: atom.parent_id,
    parent: parentRes.data ?? null,
    level: atom.level,
    context: atom.context,
    org: atom.org,
    role: atom.role,
    title: atom.title,
    period_start: atom.period_start,
    period_end: atom.period_end,
    situation: atom.situation,
    task: atom.task,
    actions: parseStringList(atom.actions),
    status: atom.status,
    evidence_level: atom.evidence_level,
    pending_metrics: parsePendingMetrics(atom.pending_metrics),
    sort_order: atom.sort_order ?? 0,
    children: (childrenRes.data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      evidence_level: c.evidence_level,
    })),
    metrics: metricsRes.data ?? [],
    guards,
    skills,
  };
}

// ---- 证明度总览 ----

export type ProofSummary = {
  total: number;
  counts: Record<EvidenceLevel, number>;
  ratios: Record<EvidenceLevel, number>; // 0–1，total 为 0 时全为 0
  score: number; // 证明环百分比，0–100 整数
};

/**
 * 四档证明度的计数与占比。首页证明环与树顶部筛选共用一份。
 */
export async function getProofSummary(): Promise<ProofSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("atoms").select("evidence_level");
  if (error) throw new Error(`读取证明度失败：${error.message}`);

  const counts: Record<EvidenceLevel, number> = {
    measured: 0,
    estimated: 0,
    designed_only: 0,
    absent: 0,
  };
  for (const row of data ?? []) counts[row.evidence_level] += 1;

  const total = data?.length ?? 0;
  const ratios = { ...counts };
  let weighted = 0;
  for (const level of EVIDENCE_ORDER) {
    ratios[level] = total === 0 ? 0 : counts[level] / total;
    weighted += counts[level] * EVIDENCE_WEIGHT[level];
  }

  return {
    total,
    counts,
    ratios,
    score: total === 0 ? 0 : Math.round((weighted / total) * 100),
  };
}

// ---- 首页数据概览 ----

export type OverviewStats = {
  atoms: number;
  projects: number;
  slices: number;
  skills: number;
  skillsWithoutEvidence: number; // 没有任何经历能证明的技能，不会进简历技能栏
  pendingMetrics: number;
};

export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = await createClient();

  const [atomsRes, skillsRes] = await Promise.all([
    supabase.from("atoms").select("level,pending_metrics"),
    supabase.from("skills").select("evidence_strength"),
  ]);

  if (atomsRes.error) throw new Error(`读取概览失败：${atomsRes.error.message}`);
  if (skillsRes.error) throw new Error(`读取概览失败：${skillsRes.error.message}`);

  const atoms = atomsRes.data ?? [];
  const skills = skillsRes.data ?? [];

  return {
    atoms: atoms.length,
    projects: atoms.filter((a) => a.level === "project").length,
    slices: atoms.filter((a) => a.level === "capability_slice").length,
    skills: skills.length,
    skillsWithoutEvidence: skills.filter((s) => s.evidence_strength === "none").length,
    pendingMetrics: atoms.reduce((n, a) => n + parsePendingMetrics(a.pending_metrics).length, 0),
  };
}
