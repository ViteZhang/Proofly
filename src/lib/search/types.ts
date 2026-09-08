// =============================================================
// Proofly · 全局搜索的形状
//
// 服务端返回一份「id / 类型 / 标题 / 副标题 / 证明度 / 去哪」，客户端做
// 模糊过滤。这个文件不连库 —— 过滤逻辑要能脱库单测，读取层 import 它，
// 不是反过来。
//
// 为什么不上语义搜索：atoms.embedding 已经在了，技术上可行，但经历库在
// 数百条以内时，关键词过滤与向量召回的体感差别很小，而后者每次查询都要
// 付一次 embedding 调用。成本不该花在体感差异不明显的地方。等经历库超过
// 五百条，或者出现「我记得做过但搜不到」的真实反馈，再换。
// =============================================================

import type { EvidenceLevel } from "@/types/database";

/** 换成语义搜索的阈值。到了这个数就该重新考虑 6.2 里那个结论了。 */
export const SEMANTIC_THRESHOLD = 500;

export type SearchKind = "atom" | "slice" | "skill" | "task" | "education" | "credential";

export type SearchItem = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  /** 有证明度的才给，技能和行动没有。 */
  proof: EvidenceLevel | null;
  route: string;
};

export const KIND_LABEL: Record<SearchKind, string> = {
  atom: "经历",
  slice: "能力切片",
  skill: "技能",
  task: "行动",
  education: "学历",
  credential: "证书",
};

/** 分组顺序。经历排最前 —— 十次搜索有八次是在找一条经历。 */
export const KIND_ORDER: SearchKind[] = [
  "atom",
  "slice",
  "skill",
  "task",
  "education",
  "credential",
];

