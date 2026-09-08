// =============================================================
// Proofly · 档案完整度
//
// 与证明度严格分开，两个数并列展示，不混算。
//
// 为什么不能混：证明度衡量的是「你的经历能否被证明」。把学历、证书这类
// 可查的确定事实算进分子，等于让任何人填完表单就能把数字刷上去 ——
// 指标会从「经历有多硬」退化成「表单填了多少」，而这恰好是这个产品最
// 不该发生的漂移。
//
// 纯函数，不连库。
// =============================================================

import { FACT_REGISTRY, REQUIRED_FACT_KEYS, type FactKey } from "./registry";

export type CompletenessItem = {
  key: string;
  label: string;
  filled: boolean;
  /** 点这个缺口跳到哪个区块 */
  anchor: string;
};

export type Completeness = {
  percent: number;
  filled: number;
  total: number;
  missing: CompletenessItem[];
};

export type CompletenessInput = {
  facts: { key: string; value: string | null }[];
  educationCount: number;
  employmentCount: number;
};

function blank(v: string | null | undefined): boolean {
  return !v || v.trim() === "";
}

/**
 * 必填基础项的填写率。
 *
 * 「有没有学历」「有没有履历」各算一项，而不是按条数算 —— 按条数算的话
 * 一个换过五家公司的人天然比一个待了十年的人「更完整」，这不成立。
 */
export function completeness(input: CompletenessInput): Completeness {
  const byKey = new Map(input.facts.map((f) => [f.key, f.value]));

  const items: CompletenessItem[] = REQUIRED_FACT_KEYS.map((k: FactKey) => ({
    key: k,
    label: FACT_REGISTRY[k].label,
    filled: !blank(byKey.get(k)),
    anchor: "identity",
  }));

  items.push({
    key: "educations",
    label: "教育经历",
    filled: input.educationCount > 0,
    anchor: "education",
  });
  items.push({
    key: "employments",
    label: "工作履历",
    filled: input.employmentCount > 0,
    anchor: "employment",
  });

  const filled = items.filter((i) => i.filled).length;
  return {
    percent: items.length === 0 ? 0 : Math.round((filled / items.length) * 100),
    filled,
    total: items.length,
    missing: items.filter((i) => !i.filled),
  };
}
