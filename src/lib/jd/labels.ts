// =============================================================
// Proofly · JD 相关的展示文案
// 缺口四类的标签文案见 src/lib/scoring/gap-copy.ts —— 那一组是方案
// 4.5 表格逐字规定的，不许润色，所以单独放，免得跟这里的自拟文案混在一起。
// =============================================================

import type { RequirementKind } from "@/types/database";

// 方案 4.5 的示例里写的是「[硬性]」，另外两档照这个口径起名。
export const KIND_LABEL: Record<RequirementKind, string> = {
  hard: "硬性",
  implicit: "隐含",
  nice_to_have: "加分",
};

export const KIND_ORDER: RequirementKind[] = ["hard", "implicit", "nice_to_have"];

export const KIND_HINT: Record<RequirementKind, string> = {
  hard: "JD 明写的要求",
  implicit: "字面没写，但这个岗位一定会考察",
  nice_to_have: "写了「优先」「加分」的",
};

export const BIND_LABEL = {
  none: { text: "还没生成简历", mark: "◌", action: "生成简历" },
  draft: { text: "简历草稿", mark: "●", action: "继续编辑" },
  submitted: { text: "已投递", mark: "✓", action: "查看" },
} as const;
