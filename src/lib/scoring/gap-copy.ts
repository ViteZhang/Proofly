// =============================================================
// Proofly · 缺口四类的文案与配色
//
// 《Step 4 方案》4.5 表格逐字照抄，不要自己发挥。
// 四类的解法完全不同，标签就是解法的名字——「会但没证据」和
// 「这个确实没做过」看着像一回事，处理起来一个是两周一个是两个月。
// =============================================================

import type { GapType } from "@/types/database";

export type GapCopy = {
  label: string;
  fg: string;
  bg: string;
  /** 补这一类缺口要做什么 */
  remedy: string;
};

export const GAP_COPY: Record<GapType, GapCopy> = {
  no_capability: {
    label: "这个确实没做过",
    fg: "var(--danger)",
    bg: "var(--danger-soft)",
    remedy: "学技能",
  },
  no_evidence: {
    label: "会但没证据",
    fg: "var(--warn)",
    bg: "var(--warn-soft)",
    remedy: "造证据",
  },
  weak_evidence: {
    label: "做过但没数据",
    fg: "var(--caution)",
    bg: "var(--caution-soft)",
    remedy: "取数",
  },
  structural: {
    label: "补不上",
    fg: "var(--slate)",
    bg: "var(--line-soft)",
    remedy: "改叙事",
  },
};

/** 右卡里「其他」那一档：扣了分，但不属于四类中的任何一类。 */
export const OTHER_COPY: GapCopy = {
  label: "其他扣分",
  fg: "var(--mute)",
  bg: "var(--line-soft)",
  remedy: "",
};

export const GAP_ORDER: GapType[] = [
  "no_capability",
  "no_evidence",
  "weak_evidence",
  "structural",
];

function quote(items: string[]): string {
  return items.map((s) => `「${s}」`).join("");
}

/**
 * 说明句式，同样按 4.5 表格。
 * 句子里的 X / Y 由真实数据填进去，填不出来时退回不带具体名字的说法——
 * 宁可少说一句，也不要出现「技能栏里有「」标签」这种半截话。
 */
export function gapExplain(
  gapType: GapType,
  v: { matchedTitles: string[]; emptySkillLabels: string[] },
): string {
  switch (gapType) {
    case "no_capability":
      return "没有经历能证明，也没有相关技能标签。";
    case "no_evidence":
      return v.emptySkillLabels.length > 0
        ? `没有经历能证明。技能栏里有${quote(v.emptySkillLabels)}标签，但它是空的。`
        : "没有经历能证明。";
    case "weak_evidence":
      return v.matchedTitles.length > 0
        ? `命中${quote(v.matchedTitles)}。做过，但都还没有实测数据。`
        : "做过，但还没有实测数据。";
    case "structural":
      return "这个补不上，只能换个说法。";
  }
}
