// =============================================================
// Proofly · 重复 delta 检测
//
// 同一个改动在多份版本里反复出现，说明基线漏了东西，而不是这些 JD 特殊。
// 每次投递都手动加同一条，加到第四次的时候人已经不觉得它是问题了 ——
// 这个检测存在的意义就是替他记住。
//
// 纯函数，不 import Next、不连库。
// =============================================================

import type { Delta } from "./delta";

/** 最近几份版本里出现过就算数。太长的话早就并进去的东西会一直被翻出来。 */
export const WINDOW = 5;
/** 出现这么多次才提示。 */
export const REPEAT_THRESHOLD = 3;

export type SignalKind = "merge_add" | "remove_block" | "align_wording";

export type Signal = {
  signature: string;
  kind: SignalKind;
  count: number;
  copy: string;
  acceptLabel: string;
  rejectLabel: string;
  /** 执行「并进基线」时要用到的那条 delta（同签名的取第一条）。 */
  sample: Delta;
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function signatureOf(d: Delta): string | null {
  if (d.type === "bullet_add") {
    if (!d.sourceAtomId || d.sourceRef.trim() === "") return null;
    return `add:${d.sourceAtomId}:${norm(d.sourceRef).slice(0, 60)}`;
  }
  if (d.type === "bullet_drop") {
    if (!d.targetBlockId) return null;
    return `drop:${d.targetBlockId}:${norm(d.before).slice(0, 60)}`;
  }
  if (d.type === "keyword_align") {
    if (d.before.trim() === "" || d.after.trim() === "") return null;
    return `align:${norm(d.before)}>${norm(d.after)}`;
  }
  return null;
}

export type VersionDeltas = {
  id: string;
  /** 已投递的版本也算数：它同样是一次「这条内容我又加了一遍」的证据。 */
  deltas: Delta[];
};

/** 一条内容在这批版本里出现在几份不同的版本中（同一份里重复只算一次）。 */
function countByVersion(versions: VersionDeltas[]): Map<string, { n: number; sample: Delta }> {
  const out = new Map<string, { n: number; sample: Delta }>();
  for (const v of versions) {
    const seen = new Set<string>();
    for (const d of v.deltas) {
      if (!d.accepted) continue;
      const sig = signatureOf(d);
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      const hit = out.get(sig);
      if (hit) hit.n += 1;
      else out.set(sig, { n: 1, sample: d });
    }
  }
  return out;
}

/**
 * 检测三种重复。已经做过选择的签名不再出现 —— 一条被拒绝过的建议
 * 每次生成都弹一遍，比不提示更烦。
 */
export function detectSignals(
  versions: VersionDeltas[],
  decided: Set<string>,
  labels: { blockTitle: (id: string) => string } = { blockTitle: () => "这一块" },
): Signal[] {
  const counts = countByVersion(versions.slice(0, WINDOW));
  const out: Signal[] = [];

  for (const [signature, { n, sample }] of counts) {
    if (n < REPEAT_THRESHOLD || decided.has(signature)) continue;

    if (sample.type === "bullet_add") {
      out.push({
        signature,
        kind: "merge_add",
        count: n,
        copy: `你最近 ${n} 份版本都把「${short(sample.after)}」加进来了。要不要直接并进基线？`,
        acceptLabel: "并进基线",
        rejectLabel: "不用",
        sample,
      });
      continue;
    }
    if (sample.type === "bullet_drop") {
      out.push({
        signature,
        kind: "remove_block",
        count: n,
        copy: `「${short(labels.blockTitle(sample.targetBlockId))}」连续 ${n} 次被删掉了。它可能不该留在基线里。`,
        acceptLabel: "从基线移除",
        rejectLabel: "保留",
        sample,
      });
      continue;
    }
    out.push({
      signature,
      kind: "align_wording",
      count: n,
      copy: `「${short(sample.before)}」每次都被改成「${short(sample.after)}」。要不要直接改基线用词？`,
      acceptLabel: "改基线",
      rejectLabel: "不用",
      sample,
    });
  }

  // 出现次数多的排前面。同样次数时按签名排，保证顺序稳定。
  return out.sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}

function short(s: string, n = 24): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}
