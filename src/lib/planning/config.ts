// =============================================================
// Proofly · 行动规划系数
//
// 与 scoring/config.ts 并列，是 impact 计算唯一写死系数的地方。
// 业务代码一律 import 这里的常量。
//
// 能复用 scoring/config 的就复用，不重新写一遍数字 —— 两处各写一份
// 0.6，改了一处忘了另一处，界面上的「预期提升」就跟实际重评对不上。
// =============================================================

import { COVERAGE, EVIDENCE } from "@/lib/scoring/config";
import type { GapType, TaskActionType } from "@/types/database";

/** 缺口类型 → 行动类型。方案 §二 的对应表，严格按此，不自由发挥。 */
export const ACTION_FOR_GAP: Record<GapType, TaskActionType> = {
  weak_evidence: "collect_data",
  no_evidence: "build_evidence",
  no_capability: "learn",
  structural: "rewrite_narrative",
};

/**
 * 一组缺口类型不一致时，取最容易执行的那类。
 * 越靠前越容易 —— 数组顺序就是方案里那串 `>`。
 */
export const ACTION_EASE_ORDER: TaskActionType[] = [
  "collect_data",
  "build_evidence",
  "rewrite_narrative",
  "learn",
];

/** 取数做完，证明度升到实测。 */
export const COLLECT_DATA_EV_AFTER = EVIDENCE.measured;

/**
 * 造证据：从无到有，保守估新经历只到 partial 覆盖、designed_only 证明度。
 * 估高了会让人以为做完就补齐了，实际重评时分数达不到，清单上的数字就成了假的。
 */
export const BUILD_EVIDENCE_COVERAGE_AFTER = COVERAGE.partial;
export const BUILD_EVIDENCE_EV_AFTER = EVIDENCE.designed_only;

/** 学技能：比造证据更保守 —— 刚学会的东西撑不起 partial。 */
export const LEARN_COVERAGE_AFTER = COVERAGE.weak;
export const LEARN_EV_AFTER = EVIDENCE.designed_only;

/**
 * 改叙事：结构性差距补不上，客观匹配度不会变。
 * 但「面试官问到时有准备好的说法」确实有价值，估为挽回三成。
 *
 * 这个值是估的，界面上必须标注出来（见 IMPACT_IS_ESTIMATED_NOTE）。
 * 不标注就是在骗自己。
 */
export const REWRITE_NARRATIVE_RECOVERY = 0.3;

/** 改叙事类 impact 旁的 `?` 提示文案。 */
export const IMPACT_IS_ESTIMATED_NOTE =
  "结构性差距补不上，改叙事只能挽回部分印象分，这个数字是估算的";

/** 送进模型的缺口上限。超过说明该重新评估，而不是生成任务。 */
export const MAX_GAPS_IN = 25;

/** 一次生成的行动条数上限。清单太长等于没有清单。 */
export const MAX_TASKS_OUT = 10;

/** learn 类工时下限。低估它会让人以为技能缺口很好补，从而错配时间。 */
export const LEARN_MIN_HOURS = 30;

/**
 * 重新生成时的标题去重阈值（余弦相似度）。
 * 超过这个值就认为是同一条任务，更新它的关联而不是再造一条。
 */
export const TITLE_DEDUPE_SIMILARITY = 0.86;

/**
 * 缺口被判定为「已解决」的门槛：重评后该要求的
 * coverage × evidence_multiplier 达到这个值即写入 resolved_at。
 *
 * 取 partial × designed_only = 0.36 —— 正好是「造证据类」保守估计
 * 做完后能达到的水平。门槛定得比它高，任务做完了缺口也关不掉。
 */
export const GAP_RESOLVED_THRESHOLD =
  BUILD_EVIDENCE_COVERAGE_AFTER * BUILD_EVIDENCE_EV_AFTER;
