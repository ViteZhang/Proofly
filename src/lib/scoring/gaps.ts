// =============================================================
// Proofly · 把算分结果转成 gaps 表的行
// 纯函数。assessment_id 由调用方补上。
// =============================================================

import type { GapSeverity, Json } from "@/types/database";
import type { RequirementResult } from "./types";

export type GapRow = {
  requirement_id: string;
  requirement_index: number;
  gap_type: NonNullable<RequirementResult["gapType"]>;
  severity: GapSeverity;
  score_impact: number;
  detail: Json;
};

/**
 * 严重度按要求的 kind 定：硬性要求缺了最要命，加分项缺了无所谓。
 * 方案没规定这一档怎么分，这里跟 weight 保持同一个口径（3/2/1），
 * 免得界面上出现「加分项缺口标成高危」这种自相矛盾。
 */
const SEVERITY: Record<RequirementResult["kind"], GapSeverity> = {
  hard: "high",
  implicit: "medium",
  nice_to_have: "low",
};

export function gapRows(results: RequirementResult[]): GapRow[] {
  const out: GapRow[] = [];
  for (const r of results) {
    if (r.gapType === null) continue;
    out.push({
      requirement_id: r.requirementId,
      requirement_index: r.requirementIndex,
      gap_type: r.gapType,
      severity: SEVERITY[r.kind],
      score_impact: r.scoreLoss,
      // 展示要说出「命中了哪几条经历」「空标签叫什么」。存下来，
      // 免得回头去 join 一个已经变了的经历库。
      detail: {
        text: r.text,
        coverage: r.coverage,
        bestEvidence: r.bestEvidence,
        matchedTitles: r.matchedTitles,
        emptySkillLabels: r.emptySkillLabels,
        reason: r.reason,
      } as unknown as Json,
    });
  }
  return out;
}
