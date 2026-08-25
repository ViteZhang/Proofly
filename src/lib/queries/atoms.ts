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

export type AtomGroupKind = "employment" | "side_project" | "past";

export type AtomGroup = {
  key: string;
  title: string;
  kind: AtomGroupKind;
  atoms: AtomNode[];
};

export type AtomTree = {
  groups: AtomGroup[];
  total: number; // 含能力点，与筛选胶囊「全部 N」一致
};

// 分组归属。
// 《Step 1》第 1.2 节写的是「employment 按 org 二级分组、side_project 归个人项目、
// 其余归过往经历」，但同节的示例树把已结束的「大连华信 · Java 研发」放在了「过往经历」。
// 按字面规则它会自成一个 org 分组，与示例对不上。这里取能同时满足两者的读法：
// 在职的 employment 按 org 分组，已结束的（period_end 非空）归「过往经历」。
function groupOf(atom: AtomNode): { key: string; title: string; kind: AtomGroupKind } {
  if (atom.context === "employment" && atom.period_end === null) {
    const org = atom.org?.trim();
    return { key: `org:${org || "__none__"}`, title: org || "未填组织", kind: "employment" };
  }
  if (atom.context === "side_project") {
    return { key: "side_project", title: "个人项目", kind: "side_project" };
  }
  return { key: "past", title: "过往经历", kind: "past" };
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

  const groups: AtomGroup[] = [];
  const index = new Map<string, AtomGroup>();
  for (const root of roots) {
    const g = groupOf(root);
    let group = index.get(g.key);
    if (!group) {
      group = { key: g.key, title: g.title, kind: g.kind, atoms: [] };
      index.set(g.key, group);
      groups.push(group);
    }
    group.atoms.push(root);
  }

  // 组序：在职任职 → 个人项目 → 过往经历
  const rank: Record<AtomGroupKind, number> = { employment: 0, side_project: 1, past: 2 };
  groups.sort((a, b) => rank[a.kind] - rank[b.kind]);

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
