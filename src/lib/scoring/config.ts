// =============================================================
// Proofly · 计分系数
//
// 全项目唯一写死系数的地方。业务代码一律 import 这里的常量，
// 别处不许出现 3 / 2 / 1 / 0.6 / 0.85 这些数字。
//
// 想调整惩罚力度，改这个文件里的一个数字然后重算即可 ——
// 不重跑模型，不花钱。这正是「分数由代码算」换来的东西。
// =============================================================

import type { Coverage } from "./types";
import type { EvidenceLevel, RequirementKind } from "@/types/database";

/** 由 kind 映射。硬性要求的分量是加分项的三倍。 */
export const WEIGHT: Record<RequirementKind, number> = {
  hard: 3,
  implicit: 2,
  nice_to_have: 1,
};

/** 模型判定的四档覆盖程度。 */
export const COVERAGE: Record<Coverage, number> = {
  full: 1.0,
  partial: 0.6,
  weak: 0.3,
  none: 0,
};

/**
 * 取命中经历中的最高证明度。
 *
 * 这是整个公式的灵魂：同样是 full 命中，有实测数据得满分，只有设计方案
 * 得 6 折。对应真实的面试处境——你说你做过，面试官问效果，你答不上来，
 * 这条要求就只值 6 折。
 */
export const EVIDENCE: Record<EvidenceLevel, number> = {
  measured: 1.0,
  estimated: 0.85,
  designed_only: 0.6,
  absent: 0.4,
};

/** 一条经历都没命中时的系数。 */
export const NO_MATCH_MULTIPLIER = 0;

/**
 * weak_evidence 的判定门槛：命中经历的最高证明度落在这几档时，
 * 算「做过但没数据」。
 *
 * 方案第三节写的就是 designed_only / absent 两档，这里照做。
 * 但真实跑下来（见 assess:probe）大量 partial 命中的证明度是 estimated，
 * 它们既不算 weak_evidence，也不属于另外三类，失分只能进「其他」桶。
 * 而 estimated 的解法跟 designed_only 一模一样，都是取数换成实测；
 * 方案给这一类的说明句式本身也写的是「还没有实测数据」——估算确实
 * 不是实测。
 *
 * 要把 estimated 收进来，只改这一行，不用重跑模型。
 */
export const WEAK_EVIDENCE_LEVELS: EvidenceLevel[] = ["designed_only", "absent"];

/**
 * 首页风险提示卡的门槛：一个方向下 weak_evidence 类缺口的失分之和
 * 超过这个数，就说明「主要命中的经历证明度普遍偏低」——做过一堆事，
 * 但都拿不出数据。
 */
export const WEAK_EVIDENCE_RISK_THRESHOLD = 15;

/**
 * 恒等式的浮点容差：全部 score_loss 之和必须等于 100 - match_score。
 * 超出这个范围不是精度问题，是归因逻辑写错了，直接抛错。
 */
export const IDENTITY_TOLERANCE = 0.5;
