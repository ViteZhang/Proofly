// =============================================================
// Proofly · 「经历库里没被基线用上的内容」
//
// 这是投递增量最关键的一份输入：bullet_add 只能从这里取。这份清单
// 组装得不对，模型要么无米下炊（该加的加不进来），要么就会自己写一条
// —— 而自己写的那条，面试官一追问就露馅。
//
// 判定用「包含度」而不是相似度：一条 action 是不是已经被写进简历，
// 问的是「这条 action 的内容在不在那一段里」，不是「两段像不像」。
// 相似度是对称的，拿一句 30 字的 action 跟一整块 200 字的正文比，
// 再像也会被长度稀释掉。
//
// 不 import Next、不连库。
// =============================================================

/** 包含度到这个程度就算「已经写进去了」。 */
export const USED_THRESHOLD = 0.6;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length === 0) return out;
  if (s.length === 1) {
    out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** part 的二元组有多大比例出现在 whole 里。0–1，不对称。 */
export function containment(part: string, whole: string): number {
  const p = bigrams(normalize(part));
  if (p.size === 0) return 0;
  const w = bigrams(normalize(whole));
  let hit = 0;
  for (const g of p) if (w.has(g)) hit++;
  return hit / p.size;
}

export type SourceAtom = {
  id: string;
  title: string;
  evidenceLevel: string;
  actions: string[];
  metrics: { name: string; kind: string; value: string; evidenceLevel: string }[];
};

export type UnusedAtom = {
  atom_id: string;
  title: string;
  evidence_level: string;
  unused_actions: string[];
  unused_metrics: { name: string; kind: string; value: string; evidence_level: string }[];
};

const MAX_ACTIONS = 10;
const MAX_METRICS = 8;

/**
 * 每条经历里没进基线的 actions 与 metrics。
 *
 * 拿整份基线的正文比，不是只比这条经历自己那一块 —— 同一句话被写进
 * 别的块里，它也已经在简历上了，再当成「没用上」推给模型，就会加出
 * 一条重复的 bullet。
 */
export function unusedContent(atoms: SourceAtom[], blockTexts: string[]): UnusedAtom[] {
  const all = blockTexts.join("\n");
  const out: UnusedAtom[] = [];

  for (const a of atoms) {
    const actions = a.actions
      .filter((x) => x.trim() !== "" && containment(x, all) < USED_THRESHOLD)
      .slice(0, MAX_ACTIONS);
    const metrics = a.metrics
      .filter((m) => containment(`${m.name}${m.value}`, all) < USED_THRESHOLD)
      .slice(0, MAX_METRICS)
      .map((m) => ({
        name: m.name,
        kind: m.kind,
        value: m.value,
        evidence_level: m.evidenceLevel,
      }));

    if (actions.length === 0 && metrics.length === 0) continue;
    out.push({
      atom_id: a.id,
      title: a.title,
      evidence_level: a.evidenceLevel,
      unused_actions: actions,
      unused_metrics: metrics,
    });
  }
  return out;
}

/**
 * bullet_add 的 source_ref 能不能在这条经历里找到。
 *
 * 提示词要求逐字引用，但模型多半会顺手改一两个字。要求逐字相等的话，
 * 每条 add 都会被丢掉；完全不校验的话，编造的来源也能过。取包含度。
 */
export function refExists(ref: string, atom: SourceAtom): boolean {
  const hay = [...atom.actions, ...atom.metrics.map((m) => `${m.name} ${m.value}`)].join("\n");
  if (ref.trim() === "") return false;
  return containment(ref, hay) >= 0.75;
}

/**
 * source_ref 指向这条经历的哪一项。详情页要显示「来自 xxx 的 actions[2]」，
 * 而模型只给了逐字引用，没给下标 —— 下标是这里算出来的。
 */
export function locateRef(ref: string, atom: SourceAtom): string | null {
  let best: { where: string; score: number } | null = null;
  atom.actions.forEach((a, i) => {
    const s = containment(ref, a);
    if (!best || s > best.score) best = { where: `actions[${i}]`, score: s };
  });
  atom.metrics.forEach((m, i) => {
    const s = containment(ref, `${m.name} ${m.value}`);
    if (!best || s > best.score) best = { where: `metrics[${i}]`, score: s };
  });
  const hit = best as { where: string; score: number } | null;
  return hit && hit.score >= 0.6 ? hit.where : null;
}
