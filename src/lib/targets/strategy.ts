// =============================================================
// Proofly · 经历 × 方向策略的纯逻辑
// 不 import Next、不连库。
//
// 这一片有两条容易写错、写错了又看不出来的规则：
//   1. atom_target_strategy 不预生成记录，没配过的按默认值处理；
//   2. 互斥组的作用域只在单一方向内 —— 同两条经历在 A 方向互斥、
//      B 方向不互斥是合法配置。
// 两条都放这里，好让探针直接喂数据验证。
// =============================================================

import type { RenderWeight } from "@/types/database";

// 默认值的唯一来源。数据库列上也有 default 'brief'，但读取时走的是
// LEFT JOIN 的缺失分支，根本碰不到那个 default，所以这里必须自己定死。
export const DEFAULT_RENDER_WEIGHT: RenderWeight = "brief";

export const RENDER_WEIGHT_ORDER: RenderWeight[] = ["expand", "brief", "one_line", "omit"];

export const RENDER_WEIGHT_LABEL: Record<RenderWeight, string> = {
  expand: "展开",
  brief: "简写",
  one_line: "一行",
  omit: "省略",
};

/** 一条经历在一个方向下的策略。configured=false 表示库里没有这行记录。 */
export type Strategy = {
  atomId: string;
  targetId: string;
  renderWeight: RenderWeight;
  exclusiveGroup: string | null;
  configured: boolean;
};

/** 库里真实存在的记录形状（读出来是什么就是什么）。 */
export type StrategyRow = {
  atom_id: string;
  target_id: string;
  render_weight: RenderWeight;
  exclusive_group: string | null;
};

function key(atomId: string, targetId: string): string {
  return `${atomId} ${targetId}`;
}

export function normalizeGroup(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * 把「经历 × 方向」的网格补全：库里有记录就用记录，没有就给默认值。
 * 这就是 LEFT JOIN 的缺失分支 —— 新建方向不需要为 24 条经历批量插入。
 */
export function mergeStrategies(
  atomIds: string[],
  targetIds: string[],
  rows: StrategyRow[],
): Strategy[] {
  const byKey = new Map<string, StrategyRow>();
  for (const r of rows) byKey.set(key(r.atom_id, r.target_id), r);

  const out: Strategy[] = [];
  for (const atomId of atomIds) {
    for (const targetId of targetIds) {
      const row = byKey.get(key(atomId, targetId));
      out.push({
        atomId,
        targetId,
        renderWeight: row?.render_weight ?? DEFAULT_RENDER_WEIGHT,
        // 空串等于没分组。用户清空输入框时不该留下一个叫 "" 的组。
        exclusiveGroup: normalizeGroup(row?.exclusive_group ?? null),
        configured: row !== undefined,
      });
    }
  }
  return out;
}

/** 一个方向下的一个互斥组撞车了。 */
export type Conflict = {
  targetId: string;
  group: string;
  atomIds: string[]; // 该组里 render_weight 不为 omit 的经历，即会同时出现的那些
};

/**
 * 找出所有撞车的（方向, 互斥组）。
 *
 * 作用域严格限制在单一方向内：分组键是 (targetId, group)，不是 group。
 * 少了 targetId，A 方向配的互斥会漏到 B 方向去，而这正是验收 10 要抓的。
 *
 * 判定：同一方向、同一组内，render_weight 不为 omit 的经历有 2 条或以上。
 * 已经选了「省略」的经历不会出现在简历里，自然不参与撞车。
 */
export function findConflicts(strategies: Strategy[]): Conflict[] {
  const buckets = new Map<string, Conflict>();

  for (const s of strategies) {
    if (s.exclusiveGroup === null) continue;
    if (s.renderWeight === "omit") continue;
    const k = `${s.targetId} ${s.exclusiveGroup}`;
    const bucket = buckets.get(k);
    if (bucket) bucket.atomIds.push(s.atomId);
    else buckets.set(k, { targetId: s.targetId, group: s.exclusiveGroup, atomIds: [s.atomId] });
  }

  return [...buckets.values()].filter((b) => b.atomIds.length >= 2);
}

/** 本步只提示不阻断，所以这里只生成文案，不返回任何「不许保存」的信号。 */
export function conflictNotice(count: number): string {
  return `这组里有 ${count} 条经历会同时出现，简历生成时需要二选一`;
}
