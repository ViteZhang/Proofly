// =============================================================
// Proofly · 按 Pass 1 给的标记在原文里定位片段
//
// 模型给的 start_marker / end_marker 要求与原文完全一致，但实际会有偏差：
// 空白不同、标点全半角不同、或者干脆抄错几个字。
// 定位失败就退回按序号均分，宁可片段切得糙一点，也不要整条丢掉。
// =============================================================

export type Located = {
  target: string;
  contextBefore: string;
  contextAfter: string;
  /** true 表示没找到标记，是按序号退回来的粗切 */
  fuzzy: boolean;
};

const CONTEXT_CHARS = 400;

export function locate(
  fullText: string,
  marker: { start: string; end: string },
  fallback: { index: number; total: number },
): Located {
  const start = findMarker(fullText, marker.start, 0);
  const endFrom = start === -1 ? 0 : start;
  const endIdx = findMarker(fullText, marker.end, endFrom);

  let from: number;
  let to: number;
  let fuzzy = false;

  if (start !== -1 && endIdx !== -1 && endIdx + marker.end.length > start) {
    from = start;
    to = endIdx + marker.end.length;
  } else if (start !== -1) {
    // 只找到开头：往后取一段，够 Pass 2 读的
    from = start;
    to = Math.min(fullText.length, start + 6000);
    fuzzy = true;
  } else {
    // 都没找到：按序号均分
    const size = Math.ceil(fullText.length / Math.max(1, fallback.total));
    from = Math.min(fullText.length, (fallback.index - 1) * size);
    to = Math.min(fullText.length, from + size);
    fuzzy = true;
  }

  return {
    target: fullText.slice(from, to),
    contextBefore: fullText.slice(Math.max(0, from - CONTEXT_CHARS), from),
    contextAfter: fullText.slice(to, Math.min(fullText.length, to + CONTEXT_CHARS)),
    fuzzy,
  };
}

// 先精确找；找不到就把空白与常见标点差异抹平再找一次。
function findMarker(text: string, marker: string, from: number): number {
  const m = marker.trim();
  if (m === "") return -1;

  const exact = text.indexOf(m, from);
  if (exact !== -1) return exact;

  const normText = normalize(text);
  const normMarker = normalize(m);
  if (normMarker === "") return -1;
  const i = normText.indexOf(normMarker, mapIndex(text, from));
  if (i === -1) return -1;

  // 规范化后的下标要映射回原文下标
  return unmapIndex(text, i);
}

const DROP = /[\s，。、；：？！“”‘’（）《》【】,.;:?!"'()<>[\]—－\-·]/g;

function normalize(s: string): string {
  return s.replace(DROP, "");
}

// 原文下标 → 规范化后的下标
function mapIndex(text: string, i: number): number {
  return normalize(text.slice(0, i)).length;
}

// 规范化后的下标 → 原文下标
function unmapIndex(text: string, target: number): number {
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (seen === target) return i;
    if (!DROP.test(text[i])) seen++;
    DROP.lastIndex = 0;
  }
  return text.length;
}
