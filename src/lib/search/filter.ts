// =============================================================
// Proofly · 搜索的过滤与分组
//
// 纯函数。「搜了没结果」和「搜出一堆不相关的」都会让人再也不点那个框，
// 所以匹配规则要能被单测钉住，而不是靠在页面上试几次。
// =============================================================

import { KIND_ORDER, type SearchItem, type SearchKind } from "@/lib/search/types";

/** 每组最多几条。超出的显示「还有 N 条」，不是直接截断了事。 */
export const PER_GROUP = 5;

export type SearchGroup = {
  kind: SearchKind;
  items: SearchItem[];
  /** 没显示出来的条数。 */
  more: number;
};

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * 匹配：标题或副标题里包含查询串。
 *
 * 不做分词、不做拼音、不做模糊距离。中文分词在这个量级上收益极小，而一个
 * 「差不多能搜到」的搜索比一个「要么中要么不中」的更难用 —— 后者至少是
 * 可预期的。
 */
export function matches(item: SearchItem, q: string): boolean {
  const k = norm(q);
  if (k === "") return true;
  return norm(item.title).includes(k) || norm(item.subtitle).includes(k);
}

/**
 * 排序：标题从头命中的排在只是包含的前面。
 *
 * 搜「RAG」时「RAG 知识库」该排在「基于 RAG 的问答」前面 —— 人心里想的
 * 那一条通常就是名字以它开头的那条。
 */
function rank(item: SearchItem, q: string): number {
  const k = norm(q);
  if (k === "") return 2;
  const t = norm(item.title);
  if (t === k) return 0;
  if (t.startsWith(k)) return 1;
  if (t.includes(k)) return 2;
  return 3;
}

export function search(index: SearchItem[], q: string): SearchGroup[] {
  const hit = index.filter((i) => matches(i, q));

  return KIND_ORDER.map((kind) => {
    const all = hit
      .filter((i) => i.kind === kind)
      .sort((a, b) => rank(a, q) - rank(b, q) || a.title.localeCompare(b.title));
    return { kind, items: all.slice(0, PER_GROUP), more: Math.max(0, all.length - PER_GROUP) };
  }).filter((g) => g.items.length > 0);
}

/** 空输入时显示最近访问的几条。没有访问记录就退回索引里最靠前的几条。 */
export function recent(index: SearchItem[], ids: string[], n = 5): SearchItem[] {
  const byId = new Map(index.map((i) => [i.id, i]));
  const out: SearchItem[] = [];
  for (const id of ids) {
    const hit = byId.get(id);
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length >= n) return out;
  }
  for (const i of index) {
    if (out.length >= n) break;
    if (!out.includes(i)) out.push(i);
  }
  return out;
}
