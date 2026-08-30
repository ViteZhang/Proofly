// =============================================================
// Proofly · 行动的界面文案与配色
//
// 数据库表名是 tasks，但界面文案一律用「行动」——《交互设计方案 v1.1》
// 第 10 节的术语表。别处不许再出现「任务」两个字。
//
// 配色照抄 S7 的表：取数绿 · 造证据紫 · 改叙事橙 · 学技能灰。
// =============================================================

import type { TaskActionType } from "@/types/database";

export const ACTION_COPY: Record<
  TaskActionType,
  { label: string; fg: string; bg: string }
> = {
  collect_data: { label: "取数", fg: "var(--proof)", bg: "var(--proof-soft)" },
  build_evidence: { label: "造证据", fg: "var(--ai)", bg: "var(--ai-soft)" },
  rewrite_narrative: { label: "改叙事", fg: "var(--warn)", bg: "var(--warn-soft)" },
  learn: { label: "学技能", fg: "var(--slate)", bg: "var(--line-soft)" },
};

export const SORT_LABEL: Record<string, string> = {
  priority: "按优先级",
  hours: "按工时",
  type: "按类型",
};

/** 空状态。评估都没做过，谈不上有什么行动。 */
export const EMPTY_COPY = "还没有行动。先去评估一份 JD，我会告诉你差在哪。";
