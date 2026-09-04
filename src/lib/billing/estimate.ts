// =============================================================
// Proofly · 文档解析的分值预估
//
// 解析的标价取决于段数与扫描页数，而**段数要抽完才知道**。
// 所以先估一个给用户看，再按实际结算 —— 少了退差额，多了不加价。
//
// 「超过预估的部分不收费」这一条，代码里实现了还不够，必须写在界面上
// （C2 2.1、交互方案 2.2）：预估偏差是我们的问题，不该用户买单，而
// 用户只有看见这句话才敢点确认。
//
// **预估不调模型。** 用文本长度与标题层级做启发式。估不准没关系。
// =============================================================

import { ACTION_PRICES } from "@/config/plan";

/** 每多少字算一段 */
const CHARS_PER_SEGMENT = 1500;
/** 粗估段数的上限 */
const MAX_ESTIMATED_SEGMENTS = 12;
/** 基础解析覆盖的段数 */
const SEGMENTS_INCLUDED = 5;

/**
 * 粗估段数：按字数与二级标题数各算一次，取大的那个。
 *
 * 取大不取小，是因为估少了会让用户在结算时看到「怎么比说好的多」——
 * 虽然多出的部分不收费，但那一刻的观感是被骗了。估多了只会让他发现
 * 「比预估便宜」，那是好事。
 */
export function estimateSegments(text: string): number {
  const byLength = Math.ceil(text.length / CHARS_PER_SEGMENT);
  const byHeading = (text.match(/^#{2,3}\s+\S/gm) ?? []).length;
  const n = Math.max(byLength, byHeading, 1);
  return Math.min(n, MAX_ESTIMATED_SEGMENTS);
}

export type CreditLine = { label: string; credits: number };

export type ParseQuote = {
  segments: number;
  scanPages: number;
  lines: CreditLine[];
  total: number;
};

/**
 * 按段数与扫描页数算分。预估与结算走的是同一个函数 ——
 * 两处各写一遍的话，迟早对不上，而对不上的那次是用户在付钱。
 */
export function quoteParse(segments: number, scanPages: number): ParseQuote {
  const extra = Math.max(segments - SEGMENTS_INCLUDED, 0);
  const lines: CreditLine[] = [
    { label: "基础解析", credits: ACTION_PRICES.doc_parse_base },
  ];
  if (extra > 0) {
    lines.push({
      label: `多出 ${extra} 段经历`,
      credits: extra * ACTION_PRICES.doc_parse_extra_seg,
    });
  }
  if (scanPages > 0) {
    lines.push({
      label: `扫描件 ${scanPages} 页`,
      credits: scanPages * ACTION_PRICES.doc_parse_scan_page,
    });
  }
  return {
    segments,
    scanPages,
    lines,
    total: lines.reduce((sum, l) => sum + l.credits, 0),
  };
}
