// =============================================================
// Proofly · 连带影响
//
//   const before = await readRippleState(atomIds);
//   ... 事务入库 ...
//   const effects = await computeRipple(changes, before);
//
// 本步只覆盖事实层四类。策略层两类（match_score_change /
// task_auto_complete）要到 Step 5 才有数据，类型定义已经写全，
// 现在一个都不会产生。
//
// 一条铁律：证明度和技能强度都不在这里算。
// 推导逻辑长在数据库触发器里（01_extensions_and_helpers.sql 的
// recompute_atom_evidence / recompute_skill_evidence），那是唯一真相。
// 这里只做两件事：写之前读一次，写完再读一次，做差。
// 应用层要是自己预测一遍，两边一旦走岔，界面显示的就是一句骗人的话——
// 比不显示糟得多。
// =============================================================

import { parsePendingMetrics } from "@/lib/domain";
import { getProofSummary } from "@/lib/queries/atoms";
import { createClient } from "@/lib/supabase/server";
import { diffRipple } from "./diff";
import type { AppliedChange, RippleEffect, RippleState } from "./types";

export { diffRipple };
export { STEP5_KINDS } from "./types";
export type {
  AppliedChange,
  AtomSnapshot,
  RippleEffect,
  RippleKind,
  RippleState,
  SkillSnapshot,
} from "./types";

/**
 * 读一次现状。入库前后各调一次，两份拿去做差。
 *
 * 技能是全量读的：一次变更可能带出此前不存在的技能行，
 * 只读「这几条经历关联的技能」会漏掉它。技能表本来也就几十行。
 */
export async function readRippleState(atomIds: string[]): Promise<RippleState> {
  const supabase = await createClient();

  const ids = [...new Set(atomIds)];
  const [atomRows, metricRows, skillRows, proof] = await Promise.all([
    ids.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("atoms")
          .select("id, evidence_level, pending_metrics")
          .in("id", ids),
    ids.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("metrics").select("atom_id").in("atom_id", ids),
    supabase.from("skills").select("id, label, evidence_strength"),
    getProofSummary(),
  ]);

  const metricCount = new Map<string, number>();
  for (const m of metricRows.data ?? []) {
    metricCount.set(m.atom_id, (metricCount.get(m.atom_id) ?? 0) + 1);
  }

  return {
    atoms: (atomRows.data ?? []).map((a) => ({
      atomId: a.id,
      evidenceLevel: a.evidence_level,
      pendingNames: parsePendingMetrics(a.pending_metrics).map((p) => p.name),
      metricCount: metricCount.get(a.id) ?? 0,
    })),
    skills: (skillRows.data ?? []).map((s) => ({
      skillId: s.id,
      label: s.label,
      strength: s.evidence_strength,
    })),
    globalScore: proof.score,
  };
}

/**
 * 算出这批变更带来的连带影响。
 *
 * before 是入库前的快照。没有它就没有可比的东西——这时候返回空数组，
 * 而不是猜一个出来。界面上少一行「证明度 46% → 54%」不要紧，
 * 显示一行错的才要命。
 */
export async function computeRipple(
  changes: AppliedChange[],
  before?: RippleState,
): Promise<RippleEffect[]> {
  if (before === undefined || changes.length === 0) return [];
  const after = await readRippleState(changes.map((c) => c.atomId));
  return diffRipple(changes, before, after);
}
