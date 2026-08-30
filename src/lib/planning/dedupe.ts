// =============================================================
// Proofly · 重新生成时的行动去重
//
// 纯函数，不 import Next、不连库、不调模型。
//
// 5.2 要求：重新生成时，与已有未完成任务比对，判定为同一条的不重复创建，
// 而是更新其 task_targets 关联。
//
// 判据用两条，任一命中即算同一条：
//
// 1. 标题相似度 —— 归一化后取字符二元组余弦。中文没有词边界，二元组
//    在这个长度（25 字以内的短标题）上比分词稳。
// 2. 底层要求文本的重合度 —— 这条才是主力。重新评估会产生一批全新的
//    gap 行，gap_id 全变了，靠 gap_id 比对必然全部落空；而「这条任务
//    在补哪几条 JD 要求」跨评估是稳定的。
//
// 为什么没用向量：callLLM 的 embedding 档一次只能喂一个字符串，
// 一次重新生成要为 20 来个标题各发一次请求。这里比的是「是不是同一件事」，
// 不是「语义有多近」，两条判据合起来已经够用，不值那 20 次调用。
// =============================================================

import { TITLE_DEDUPE_SIMILARITY } from "./config";

/** 底层要求文本的重合度门槛。过半重合就认为是同一件事。 */
export const REQUIREMENT_OVERLAP_THRESHOLD = 0.5;

/** 去掉标点、空白、大小写差异。留下的是实际内容。 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  if (s.length === 0) return out;
  if (s.length === 1) {
    out.set(s, 1);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** 字符二元组余弦相似度，0–1。 */
export function titleSimilarity(a: string, b: string): number {
  const x = bigrams(normalizeTitle(a));
  const y = bigrams(normalizeTitle(b));
  if (x.size === 0 || y.size === 0) return 0;

  let dot = 0;
  for (const [g, n] of x) dot += n * (y.get(g) ?? 0);
  if (dot === 0) return 0;

  const nx = Math.sqrt([...x.values()].reduce((s, n) => s + n * n, 0));
  const ny = Math.sqrt([...y.values()].reduce((s, n) => s + n * n, 0));
  return dot / (nx * ny);
}

/** 两组要求文本的 Jaccard 重合度。 */
export function requirementOverlap(a: string[], b: string[]): number {
  const x = new Set(a.map(normalizeTitle).filter((s) => s !== ""));
  const y = new Set(b.map(normalizeTitle).filter((s) => s !== ""));
  if (x.size === 0 || y.size === 0) return 0;

  let hit = 0;
  for (const s of x) if (y.has(s)) hit++;
  return hit / Math.min(x.size, y.size);
}

export type ExistingTask = {
  id: string;
  title: string;
  /** 该任务当前关联的全部缺口对应的要求原文。 */
  requirementTexts: string[];
};

export type IncomingTask = {
  title: string;
  requirementTexts: string[];
};

export type DedupeHit = {
  existingId: string;
  titleSimilarity: number;
  requirementOverlap: number;
};

/**
 * 在已有未完成任务里找出与新任务同一条的那个。找不到返回 null。
 * 命中多个时取标题最像的 —— 同分时取重合度更高的。
 */
export function findDuplicate(
  incoming: IncomingTask,
  existing: ExistingTask[],
): DedupeHit | null {
  const hits: DedupeHit[] = [];
  for (const e of existing) {
    const t = titleSimilarity(incoming.title, e.title);
    const o = requirementOverlap(incoming.requirementTexts, e.requirementTexts);
    if (t >= TITLE_DEDUPE_SIMILARITY || o >= REQUIREMENT_OVERLAP_THRESHOLD) {
      hits.push({ existingId: e.id, titleSimilarity: t, requirementOverlap: o });
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) =>
    b.titleSimilarity - a.titleSimilarity || b.requirementOverlap - a.requirementOverlap,
  );
  return hits[0];
}
