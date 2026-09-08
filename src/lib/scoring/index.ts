// =============================================================
// Proofly · 匹配分与失分归因
//
// 纯函数，不 import Next、不连库、不调模型。
//
// 分数由代码算，不由模型给。模型只回答一件事：这条要求命中了哪些经历、
// 命中到什么程度。加权、求和、归一化、失分归因全在这里。
// 这样同样的输入永远得到同样的分数，两周后才能对比出进步。
//
//   requirement_score = coverage × evidence_multiplier
//   match_score       = Σ(weight × requirement_score) / Σ(weight) × 100
//   score_loss        = weight × (1 − requirement_score) / Σ(weight) × 100
// =============================================================

import {
  COVERAGE,
  EVIDENCE,
  IDENTITY_TOLERANCE,
  NO_MATCH_MULTIPLIER,
  WEAK_EVIDENCE_LEVELS,
  WEIGHT,
} from "./config";
import type {
  AtomFact,
  Coverage,
  LossBucket,
  RequirementInput,
  RequirementResult,
  ScoreResult,
  SkillFact,
  Verdict,
} from "./types";
import type { EvidenceLevel, GapType } from "@/types/database";

/** 每条要求最多列 3 条命中经历。模型多给了就截断。 */
export const MAX_MATCHED = 3;

// 由强到弱。取「最高」证明度时按这个顺序找第一个命中的。
const EVIDENCE_RANK: EvidenceLevel[] = ["measured", "estimated", "designed_only", "absent"];

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * 硬门槛整条排除在加权之外 —— 分母里也没有它。
 *
 * 为什么不是「不满足就扣分」：一条不可改变的因素会持续压低所有方向的
 * 分数，而分数唯一的用途是「我这两周有没有进步」。学历三个月不会变，
 * 让它常驻扣 6 分，等于给每个方向加了一个固定偏移量，读数就废了。
 * 它单独在方向页标注一栏，用户自己权衡投不投。
 */
export function score(
  requirements: RequirementInput[],
  verdicts: Verdict[],
  atoms: AtomFact[],
  skills: SkillFact[],
): ScoreResult {
  const totalWeight = requirements
    .filter((r) => r.hardGate === null)
    .reduce((sum, r) => sum + WEIGHT[r.kind], 0);
  if (requirements.length === 0) {
    return { matchScore: 0, results: [] };
  }

  const atomById = new Map(atoms.map((a) => [a.id, a]));
  const strengthByLabel = new Map(skills.map((s) => [s.label, s.strength]));
  const byIndex = new Map(verdicts.map((v) => [v.requirementIndex, v]));

  const results: RequirementResult[] = requirements.map((req) => {
    // 硬门槛不参与打分：既不进分子也不进分母，失分恒为 0。
    // 缺口类型只在「确实不满足」时给 hard_disqualifier —— 判不了
    // （档案里压根没填学历）不是缺口，是我们还不知道。
    if (req.hardGate !== null) {
      return {
        requirementId: req.id,
        requirementIndex: req.index,
        text: req.text,
        rawPhrase: req.rawPhrase,
        kind: req.kind,
        isStructural: req.isStructural,
        weight: 0,
        coverage: (req.hardGate.verdict === "met" ? "full" : "none") as Coverage,
        coverageValue: req.hardGate.verdict === "met" ? 1 : 0,
        bestEvidence: null,
        evidenceMultiplier: 0,
        requirementScore: 0,
        scoreLoss: 0,
        matchedAtomIds: [],
        matchedTitles: [],
        relatedSkillLabels: [],
        emptySkillLabels: [],
        reason: req.hardGate.detail,
        mappedKind: req.mappedKind,
        hardGate: req.hardGate,
        gapType: req.hardGate.verdict === "unmet" ? "hard_disqualifier" : null,
      };
    }

    const weight = WEIGHT[req.kind];
    // 模型漏判了某条要求，按「没有任何经历能支撑」算 —— 漏判不能白捡分。
    const v = byIndex.get(req.index);
    const coverage: Coverage = v?.coverage ?? "none";

    const matched = (v?.matchedAtomIds ?? [])
      .map((id) => atomById.get(id))
      .filter((a): a is AtomFact => a !== undefined)
      .slice(0, MAX_MATCHED);

    const bestEvidence = strongestEvidence(matched);
    const evidenceMultiplier =
      bestEvidence === null ? NO_MATCH_MULTIPLIER : EVIDENCE[bestEvidence];
    const coverageValue = COVERAGE[coverage];
    const requirementScore = coverageValue * evidenceMultiplier;

    const relatedSkillLabels = v?.relatedSkillLabels ?? [];
    // 「有这个标签但它是空的」才说明是缺证据，不是缺能力。
    const emptySkillLabels = relatedSkillLabels.filter(
      (l) => strengthByLabel.get(l) === "none",
    );

    return {
      requirementId: req.id,
      requirementIndex: req.index,
      text: req.text,
      rawPhrase: req.rawPhrase,
      kind: req.kind,
      isStructural: req.isStructural,

      weight,
      coverage,
      coverageValue,
      bestEvidence,
      evidenceMultiplier,
      requirementScore: round(requirementScore),
      scoreLoss: round((weight * (1 - requirementScore)) / totalWeight * 100),

      matchedAtomIds: matched.map((a) => a.id),
      matchedTitles: matched.map((a) => a.title),
      relatedSkillLabels,
      emptySkillLabels,
      reason: v?.reason ?? "",

      mappedKind: req.mappedKind,
      hardGate: null,

      gapType: classify({
        isStructural: req.isStructural,
        coverage,
        bestEvidence,
        relatedSkillLabels,
        emptySkillLabels,
      }),
    };
  });

  const weighted = results.reduce((sum, r) => sum + r.weight * r.requirementScore, 0);
  // 一份 JD 全是硬门槛（分母为 0）时不做除法。这种 JD 存在得很勉强，
  // 但除以零会得到 NaN，而 NaN 一路写进库比一个 0 分难查得多。
  const matchScore = totalWeight === 0 ? 0 : round((weighted / totalWeight) * 100);

  // 恒等式说的是「那 100 分被分完了」。一条可打分的要求都没有（整份 JD
  // 全是硬门槛）时没有 100 分可分，两边都是空的，此时校验它只会得到一个
  // 假警报。
  if (totalWeight > 0) assertIdentity(matchScore, results);
  return { matchScore, results };
}

function strongestEvidence(atoms: AtomFact[]): EvidenceLevel | null {
  for (const level of EVIDENCE_RANK) {
    if (atoms.some((a) => a.evidenceLevel === level)) return level;
  }
  return null;
}

/**
 * 缺口四类的判定，全部由代码做，只有 is_structural 来自模型。
 *
 * 优先级：structural > weak_evidence > no_evidence > no_capability。
 * structural 一旦成立就不往下判 —— 它无论 coverage 多少都补不上。
 *
 * 返回 null 表示这条不构成缺口。方案第三节给的四个条件并不覆盖所有会
 * 扣分的情形（最常见的是 partial 命中但证明度已经是实测：扣了 0.4×weight，
 * 却四类都不属于），这些失分进「其他」桶，见 aggregate()。
 * 不自己发明第五类，也不硬塞进现有四类里 —— 塞错了解法就跟着错。
 */
function classify(v: {
  isStructural: boolean;
  coverage: Coverage;
  bestEvidence: EvidenceLevel | null;
  relatedSkillLabels: string[];
  emptySkillLabels: string[];
}): GapType | null {
  if (v.isStructural) return "structural";

  const covered = v.coverage === "full" || v.coverage === "partial";
  if (covered && v.bestEvidence !== null && WEAK_EVIDENCE_LEVELS.includes(v.bestEvidence)) {
    return "weak_evidence";
  }

  const thin = v.coverage === "none" || v.coverage === "weak";
  if (thin && v.emptySkillLabels.length > 0) return "no_evidence";

  if (v.coverage === "none" && v.relatedSkillLabels.length === 0) return "no_capability";

  return null;
}

/**
 * 恒等式：全部 score_loss 之和必须等于 100 − match_score。
 * 不成立说明归因逻辑写错了，直接抛错，不许静默容忍。
 */
export function assertIdentity(matchScore: number, results: RequirementResult[]): void {
  const totalLoss = results.reduce((sum, r) => sum + r.scoreLoss, 0);
  const expected = 100 - matchScore;
  const drift = Math.abs(totalLoss - expected);
  if (drift > IDENTITY_TOLERANCE) {
    throw new Error(
      `失分归因对不上：Σscore_loss = ${totalLoss.toFixed(3)}，` +
        `100 − match_score = ${expected.toFixed(3)}，差 ${drift.toFixed(3)}。` +
        `这不是浮点误差，是算错了。`,
    );
  }
}

/** 右卡的失分构成。按 gap_type 聚合，四类之外的进「其他」（gapType 为 null）。 */
export function aggregate(results: RequirementResult[]): LossBucket[] {
  const order: (GapType | null)[] = [
    "no_capability",
    "no_evidence",
    "weak_evidence",
    "structural",
    null,
  ];
  const buckets = new Map<GapType | null, LossBucket>();
  for (const r of results) {
    if (r.scoreLoss <= 0) continue;
    const b = buckets.get(r.gapType) ?? { gapType: r.gapType, loss: 0, count: 0 };
    b.loss = round(b.loss + r.scoreLoss);
    b.count += 1;
    buckets.set(r.gapType, b);
  }
  return order.map((k) => buckets.get(k)).filter((b): b is LossBucket => b !== undefined);
}

/** 充分项：命中充分且不构成缺口。正向反馈和缺口一样重要。 */
export function isStrong(r: RequirementResult): boolean {
  return r.gapType === null && r.coverage === "full";
}
