// =============================================================
// Proofly · 计分与缺口判定的类型
// assessments.results 存的就是 RequirementResult[]，这里是唯一定义处。
// =============================================================

import type { EvidenceLevel, GapType, MappedKind, RequirementKind } from "@/types/database";

export type Coverage = "full" | "partial" | "weak" | "none";

/** 算分需要知道的一条要求。 */
export type RequirementInput = {
  id: string;
  index: number;
  text: string;
  rawPhrase: string | null;
  kind: RequirementKind;
  isStructural: boolean;
  /** 这条要求对的是什么。学历、证书类不跟经历比，跟结构化档案比。 */
  mappedKind: MappedKind;
  /**
   * 硬门槛判定结果。null 表示这条不是硬门槛，走正常的匹配打分。
   * 非 null 的要求整条被排除在加权之外 —— 见 score() 的注释。
   */
  hardGate: HardGate | null;
};

/** 硬门槛的一条判定。detail 是给界面直接显示的人话。 */
export type HardGate = {
  verdict: "met" | "unmet" | "unknown";
  detail: string;
};

/** 模型对一条要求给出的判定。分数不在里面——模型给了也会被忽略。 */
export type Verdict = {
  requirementIndex: number;
  coverage: Coverage;
  matchedAtomIds: string[];
  reason: string;
  relatedSkillLabels: string[];
};

/** 算分要用到的经历信息。 */
export type AtomFact = {
  id: string;
  title: string;
  evidenceLevel: EvidenceLevel;
};

/** 技能标签的证据强度，用来分辨「没这个能力」和「有能力但拿不出证明」。 */
export type SkillFact = {
  label: string;
  strength: "strong" | "weak" | "none";
};

/**
 * 一条要求的完整结果，冻结进 assessments.results。
 *
 * gapType 为 null 表示这条不构成缺口。注意它跟「没扣分」不是一回事：
 * 方案第三节的四类判定条件并不覆盖所有会扣分的情形（比如 partial 命中
 * 且证明度是实测），这些落在 otherLoss 里，见 aggregate()。
 */
export type RequirementResult = {
  requirementId: string;
  requirementIndex: number;
  text: string;
  rawPhrase: string | null;
  kind: RequirementKind;
  isStructural: boolean;

  weight: number;
  coverage: Coverage;
  coverageValue: number;
  /** 命中经历里的最高证明度，没命中是 null。 */
  bestEvidence: EvidenceLevel | null;
  evidenceMultiplier: number;
  requirementScore: number;
  scoreLoss: number;

  matchedAtomIds: string[];
  matchedTitles: string[];
  relatedSkillLabels: string[];
  /** relatedSkillLabels 里 evidence_strength 为 none 的那些。 */
  emptySkillLabels: string[];
  reason: string;

  mappedKind: MappedKind;
  /** 非 null 表示这条走的是硬门槛那条路，不参与加权。 */
  hardGate: HardGate | null;

  gapType: GapType | null;
};

export type ScoreResult = {
  matchScore: number;
  results: RequirementResult[];
};

/** 右卡的失分构成。四类各一行，加上一行兜底。 */
export type LossBucket = {
  gapType: GapType | null; // null = 「其他」
  loss: number;
  count: number;
};
