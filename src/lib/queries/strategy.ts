// =============================================================
// Proofly · 经历 × 方向策略读取层
// 关键约束：atom_target_strategy 不预生成记录。这里全部走
// 「查已有的 → mergeStrategies 补默认值」，任何地方都不为了凑齐网格而插入。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import {
  findConflicts,
  mergeStrategies,
  normalizeGroup,
  type Conflict,
  type Strategy,
  type StrategyRow,
} from "@/lib/targets/strategy";
import type { AtomLevel, EvidenceLevel, RenderWeight } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- 经历详情页的策略表格 ----

export type AtomStrategyRow = {
  targetId: string;
  targetName: string;
  renderWeight: RenderWeight;
  exclusiveGroup: string | null;
  configured: boolean;
  // 同一方向、同一互斥组里另外那些也会出现的经历（不含自己）。
  // 只在本方向内查 —— 换个方向就是另一套配置。
  clashesWith: { id: string; title: string }[];
  // 该方向下已经用过的组名，给输入框做候选。互斥组是自由文本，
  // 但每次都靠手打同一个字符串太容易打错，打错就等于没分组。
  knownGroups: string[];
};

export async function getAtomStrategies(atomId: string): Promise<AtomStrategyRow[]> {
  if (!UUID_RE.test(atomId)) return [];
  const supabase = await createClient();

  const { data: targets } = await supabase
    .from("targets")
    .select("id,name,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!targets || targets.length === 0) return [];

  const { data: mine } = await supabase
    .from("atom_target_strategy")
    .select("atom_id,target_id,render_weight,exclusive_group")
    .eq("atom_id", atomId);

  const strategies = mergeStrategies(
    [atomId],
    targets.map((t) => t.id),
    (mine ?? []) as StrategyRow[],
  );

  const clashes = await findClashes(strategies, atomId);
  const known = await groupsByTarget(targets.map((t) => t.id));

  return targets.map((t) => {
    const s = strategies.find((x) => x.targetId === t.id)!;
    return {
      targetId: t.id,
      targetName: t.name,
      renderWeight: s.renderWeight,
      exclusiveGroup: s.exclusiveGroup,
      configured: s.configured,
      clashesWith: clashes.get(t.id) ?? [],
      knownGroups: known.get(t.id) ?? [],
    };
  });
}

/** 每个方向下已经出现过的互斥组名，去重后按字母序。 */
async function groupsByTarget(targetIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, Set<string>>();
  if (targetIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("atom_target_strategy")
    .select("target_id,exclusive_group")
    .in("target_id", targetIds)
    .not("exclusive_group", "is", null);

  for (const r of data ?? []) {
    const g = normalizeGroup(r.exclusive_group);
    if (!g) continue;
    const set = out.get(r.target_id) ?? new Set<string>();
    set.add(g);
    out.set(r.target_id, set);
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort()]));
}

/**
 * 找出与这条经历撞车的兄弟经历，按方向分开返回。
 * 查询条件里 target_id 与 exclusive_group 都带上，再在内存里按
 * (方向, 组) 成对过滤 —— 只用 in() 会把 A 方向的组名匹配到 B 方向的行上。
 */
async function findClashes(
  strategies: Strategy[],
  selfAtomId: string,
): Promise<Map<string, { id: string; title: string }[]>> {
  const out = new Map<string, { id: string; title: string }[]>();

  // 自己选了「省略」就不会出现在简历里，不参与撞车。
  const active = strategies.filter((s) => s.exclusiveGroup !== null && s.renderWeight !== "omit");
  if (active.length === 0) return out;

  const supabase = await createClient();
  const { data: siblings } = await supabase
    .from("atom_target_strategy")
    .select("atom_id,target_id,exclusive_group,render_weight")
    .in("target_id", active.map((s) => s.targetId))
    .in("exclusive_group", active.map((s) => s.exclusiveGroup as string))
    .neq("atom_id", selfAtomId)
    .neq("render_weight", "omit");

  if (!siblings || siblings.length === 0) return out;

  const titles = await atomTitles([...new Set(siblings.map((s) => s.atom_id))]);

  for (const s of active) {
    const hits = siblings.filter(
      (r) => r.target_id === s.targetId && normalizeGroup(r.exclusive_group) === s.exclusiveGroup,
    );
    if (hits.length === 0) continue;
    out.set(
      s.targetId,
      hits.map((h) => ({ id: h.atom_id, title: titles.get(h.atom_id) ?? "（已删除的经历）" })),
    );
  }
  return out;
}

async function atomTitles(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("atoms").select("id,title").in("id", ids);
  return new Map((data ?? []).map((a) => [a.id, a.title]));
}

// ---- 批量配置页 ----

export type BoardRow = {
  atomId: string;
  title: string;
  level: AtomLevel;
  parentId: string | null;
  org: string | null;
  evidenceLevel: EvidenceLevel;
  renderWeight: RenderWeight;
  exclusiveGroup: string | null;
  configured: boolean;
};

export type StrategyBoard = {
  target: { id: string; name: string };
  rows: BoardRow[];
  conflicts: Conflict[];
};

export async function getStrategyBoard(targetId: string): Promise<StrategyBoard | null> {
  if (!UUID_RE.test(targetId)) return null;
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("targets")
    .select("id,name")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return null;

  const { data: atoms } = await supabase
    .from("atoms")
    .select("id,parent_id,level,title,org,sort_order,evidence_level")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const ordered = orderAtoms(atoms ?? []);

  const { data: rows } = await supabase
    .from("atom_target_strategy")
    .select("atom_id,target_id,render_weight,exclusive_group")
    .eq("target_id", targetId);

  const strategies = mergeStrategies(
    ordered.map((a) => a.id),
    [targetId],
    (rows ?? []) as StrategyRow[],
  );
  const byAtom = new Map(strategies.map((s) => [s.atomId, s]));

  return {
    target: { id: target.id, name: target.name },
    rows: ordered.map((a) => {
      const s = byAtom.get(a.id)!;
      return {
        atomId: a.id,
        title: a.title,
        level: a.level,
        parentId: a.parent_id,
        org: a.org,
        evidenceLevel: a.evidence_level,
        renderWeight: s.renderWeight,
        exclusiveGroup: s.exclusiveGroup,
        configured: s.configured,
      };
    }),
    conflicts: findConflicts(strategies),
  };
}

type RawAtom = {
  id: string;
  parent_id: string | null;
  level: AtomLevel;
  title: string;
  org: string | null;
  evidence_level: EvidenceLevel;
};

/** 经历在前，各自的能力点紧跟其后 —— 跟经历库树里看到的顺序一致。 */
function orderAtoms<T extends RawAtom>(atoms: T[]): T[] {
  const projects = atoms.filter((a) => a.level === "project");
  const slices = atoms.filter((a) => a.level !== "project");
  const out: T[] = [];
  for (const p of projects) {
    out.push(p);
    out.push(...slices.filter((s) => s.parent_id === p.id));
  }
  // 父级被删或数据异常时别把能力点弄丢
  out.push(...slices.filter((s) => !projects.some((p) => p.id === s.parent_id)));
  return out;
}
