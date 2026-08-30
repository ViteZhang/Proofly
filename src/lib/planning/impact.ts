// =============================================================
// Proofly · 预期提升（impact）计算
//
// 纯函数，不 import Next、不连库、不调模型。
//
// impact 由代码按公式算，不由模型给。模型输出里若出现 impact 数值，
// 忽略它 —— 让模型猜一个「预计提升 12 分」，那个数字跟重评后的实际
// 变化毫无关系，清单上的排序也就跟着假掉。
//
// 任务完成 ≠ 把失分全部补回来。四类各有各的公式，见方案 §1.2。
// =============================================================

import {
  BUILD_EVIDENCE_COVERAGE_AFTER,
  BUILD_EVIDENCE_EV_AFTER,
  COLLECT_DATA_EV_AFTER,
  LEARN_COVERAGE_AFTER,
  LEARN_EV_AFTER,
  REWRITE_NARRATIVE_RECOVERY,
} from "./config";
import type { TaskActionType } from "@/types/database";

/** 算 impact 需要知道的一条缺口的现状。全部来自 assessments.results。 */
export type GapState = {
  /** 该要求的权重（由 kind 映射，见 scoring/config）。 */
  weight: number;
  /** 当前覆盖系数。 */
  coverage: number;
  /** 当前证明度系数。没命中任何经历时是 0。 */
  evidenceMultiplier: number;
  /** 该次评估全部要求的权重之和 —— impact 的分母。 */
  sumWeight: number;
  /** 该缺口当前的失分。只有 rewrite_narrative 用得上。 */
  scoreLoss: number;
};

/** 写进 task_targets.impact_basis 的计算依据。排查分数不对时的唯一手段。 */
export type ImpactBasis = {
  formula: TaskActionType;
  weight: number;
  coverage: number;
  coverage_after?: number;
  ev_mult_before: number;
  ev_mult_after?: number;
  sum_weight: number;
  score_loss?: number;
  recovery?: number;
  /** 公式算出来是负数时钳到 0，这里记下原始值，免得看起来像算错了。 */
  raw_result?: number;
  result: number;
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 「做完之后这条要求能到什么水平」减去「现在是什么水平」，
 * 按权重折算到 100 分制。三类结构性以外的公式共用这一段。
 */
function delta(g: GapState, scoreAfter: number): number {
  if (g.sumWeight <= 0) return 0;
  return (g.weight * (scoreAfter - g.coverage * g.evidenceMultiplier)) / g.sumWeight * 100;
}

export function computeImpact(action: TaskActionType, g: GapState): ImpactBasis {
  switch (action) {
    // 取数：覆盖程度不变，证明度升到实测。
    // impact = weight × coverage × (1.0 − 当前 ev_mult) / Σweight × 100
    case "collect_data": {
      const raw = delta(g, g.coverage * COLLECT_DATA_EV_AFTER);
      return basis({
        formula: action,
        weight: g.weight,
        coverage: g.coverage,
        coverage_after: g.coverage,
        ev_mult_before: g.evidenceMultiplier,
        ev_mult_after: COLLECT_DATA_EV_AFTER,
        sum_weight: g.sumWeight,
        raw,
      });
    }

    // 造证据：从无到有，保守估 partial × designed_only。
    case "build_evidence": {
      const after = BUILD_EVIDENCE_COVERAGE_AFTER * BUILD_EVIDENCE_EV_AFTER;
      return basis({
        formula: action,
        weight: g.weight,
        coverage: g.coverage,
        coverage_after: BUILD_EVIDENCE_COVERAGE_AFTER,
        ev_mult_before: g.evidenceMultiplier,
        ev_mult_after: BUILD_EVIDENCE_EV_AFTER,
        sum_weight: g.sumWeight,
        raw: delta(g, after),
      });
    }

    // 学技能：更保守，weak × designed_only。
    case "learn": {
      const after = LEARN_COVERAGE_AFTER * LEARN_EV_AFTER;
      return basis({
        formula: action,
        weight: g.weight,
        coverage: g.coverage,
        coverage_after: LEARN_COVERAGE_AFTER,
        ev_mult_before: g.evidenceMultiplier,
        ev_mult_after: LEARN_EV_AFTER,
        sum_weight: g.sumWeight,
        raw: delta(g, after),
      });
    }

    // 改叙事：客观匹配度不会变，这个数是估的。
    // impact = score_loss × 0.3
    case "rewrite_narrative": {
      return basis({
        formula: action,
        weight: g.weight,
        coverage: g.coverage,
        ev_mult_before: g.evidenceMultiplier,
        sum_weight: g.sumWeight,
        score_loss: g.scoreLoss,
        recovery: REWRITE_NARRATIVE_RECOVERY,
        raw: g.scoreLoss * REWRITE_NARRATIVE_RECOVERY,
      });
    }
  }
}

/**
 * 公式可能算出负数 —— 比如一条 full+measured 的要求被归进了 learn 组，
 * 做完反而「不如现在」。那不是提升，钳到 0；原始值留在 raw_result 里，
 * 排查时能看出是聚类聚错了，而不是公式写错了。
 */
function basis(v: Omit<ImpactBasis, "result"> & { raw: number }): ImpactBasis {
  const { raw, ...rest } = v;
  const clamped = Math.max(0, raw);
  const out: ImpactBasis = { ...rest, result: round(clamped) };
  if (clamped !== raw) out.raw_result = round(raw);
  return out;
}

/** 一条任务在一个方向上的总 impact = 该方向下它关联的全部缺口之和。 */
export function sumImpact(bases: ImpactBasis[]): number {
  return round(bases.reduce((s, b) => s + b.result, 0));
}
