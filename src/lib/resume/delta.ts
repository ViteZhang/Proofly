// =============================================================
// Proofly · 投递版本的差异应用
//
// 投递版本不落一份自己的正文（除非已投递冻结）：它 = 基线块 + 已接受的
// 差异，每次读的时候算一遍。这样「基线改了，草稿版本自动跟着变」是
// 天然成立的，不需要额外的同步逻辑；而已投递的版本会在标记那一刻
// 固化成一份副本，从此不再跟着基线动。
//
// 纯函数，不 import Next、不连库。
// =============================================================

import type { Json } from "@/types/database";

export const DELTA_TYPES = [
  "keyword_align",
  "bullet_add",
  "bullet_drop",
  "reorder",
  "headline_tweak",
] as const;
export type DeltaType = (typeof DELTA_TYPES)[number];

export const DELTA_LABEL: Record<DeltaType, string> = {
  keyword_align: "关键词对齐",
  bullet_add: "增加一条",
  bullet_drop: "删掉一条",
  reorder: "调整顺序",
  headline_tweak: "个人定位段微调",
};

export type Delta = {
  id: string;
  type: DeltaType;
  targetBlockId: string;
  before: string;
  after: string;
  reason: string;
  sourceAtomId: string;
  sourceRef: string;
  /** 用户逐条拒绝之后置 false。拒绝的不删，留着才说得出「你拒过这一条」。 */
  accepted: boolean;
  /** reorder 里位置描述读不出确切名次时为 true：记下来，但不自动搬。 */
  manual?: boolean;
};

export type DeltaBlock = {
  id: string;
  section: string;
  title: string;
  meta: string;
  summary: string;
  bullets: string[];
};

export type Applied = {
  blocks: DeltaBlock[];
  headline: string;
  /** 被改动过的块 id。delta_ratio 的分子就是它的大小。 */
  affected: Set<string>;
};

function clone(b: DeltaBlock): DeltaBlock {
  return { ...b, bullets: [...b.bullets] };
}

/** 找出与 before 最像的那一条 bullet 的下标。找不到返回 -1。 */
function findBullet(bullets: string[], before: string): number {
  const t = before.trim();
  if (t === "") return -1;
  const exact = bullets.findIndex((b) => b.trim() === t);
  if (exact >= 0) return exact;
  return bullets.findIndex((b) => b.includes(t) || t.includes(b.trim()));
}

/** 「移到第 2 位」「放在个人项目之前」——先读名次，读不出就交给用户自己拖。 */
function parsePosition(text: string, blocks: DeltaBlock[]): number | null {
  const m = text.match(/第\s*([0-9一二三四五六七八九十]+)\s*(位|块|条|段)?/);
  if (m) {
    const digits = "一二三四五六七八九十";
    const raw = m[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : digits.indexOf(raw) + 1;
    if (n >= 1 && n <= blocks.length) return n - 1;
  }
  const hit = blocks.findIndex((b) => b.title.trim() !== "" && text.includes(b.title.trim()));
  return hit >= 0 ? hit : null;
}

export function applyDeltas(
  baseBlocks: DeltaBlock[],
  baseHeadline: string,
  deltas: Delta[],
): Applied {
  const blocks = baseBlocks.map(clone);
  let headline = baseHeadline;
  const affected = new Set<string>();

  for (const d of deltas) {
    if (!d.accepted) continue;

    if (d.type === "headline_tweak") {
      if (d.after.trim() !== "") headline = d.after.trim();
      affected.add("headline");
      continue;
    }

    const i = blocks.findIndex((b) => b.id === d.targetBlockId);
    if (i < 0) continue;
    const b = blocks[i];

    if (d.type === "keyword_align") {
      const from = d.before.trim();
      const to = d.after.trim();
      if (from === "" || to === "") continue;
      let touched = false;
      const swap = (s: string) => {
        if (!s.includes(from)) return s;
        touched = true;
        return s.split(from).join(to);
      };
      b.title = swap(b.title);
      b.summary = swap(b.summary);
      b.bullets = b.bullets.map(swap);
      if (touched) affected.add(b.id);
      continue;
    }

    if (d.type === "bullet_add") {
      const line = d.after.trim();
      if (line === "") continue;
      b.bullets.push(line);
      affected.add(b.id);
      continue;
    }

    if (d.type === "bullet_drop") {
      const j = findBullet(b.bullets, d.before);
      if (j < 0) continue;
      b.bullets.splice(j, 1);
      affected.add(b.id);
      continue;
    }

    if (d.type === "reorder") {
      const to = parsePosition(d.after, blocks);
      if (to === null) {
        d.manual = true;
        continue;
      }
      blocks.splice(to, 0, blocks.splice(i, 1)[0]);
      affected.add(b.id);
    }
  }

  return { blocks, headline, affected };
}

/** 受影响的块数 ÷ 基线总块数。headline 不算块。 */
export function deltaRatio(affected: Set<string>, totalBlocks: number): number {
  if (totalBlocks === 0) return 0;
  const n = [...affected].filter((x) => x !== "headline").length;
  return n / totalBlocks;
}

/** > 0.4 才提示。0.2–0.4 与 < 0.2 都不提示 —— 6.4 的三档里前两档行为相同。 */
export const OVER_THRESHOLD = 0.4;

export function overThreshold(ratio: number): boolean {
  return ratio > OVER_THRESHOLD;
}

export function overThresholdCopy(affectedCount: number, total: number, ratio: number): string {
  return `改动有点多（${affectedCount}/${total} 块，${Math.round(ratio * 100)}%）。这份 JD 跟当前方向差得比较远。要不要单独建一个方向？`;
}

// ---- 「差得比较远」的第二个信号 ----
//
// 6.4 只用 delta_ratio 判定「这份 JD 跟当前方向差得比较远」，它假设
// 偏离方向的 JD 会引出大量改动。实测下来恰恰相反：JD 偏得越远，
// 经历库里能对上的东西越少，模型（按 4.2 的要求）如实填 unmatched
// 而不硬凑，改动数反而趋近于零 —— 一份完全不搭的供应链 JD 跑出来是
// 1 处调整、delta_ratio = 0，那条提示永远不会弹。
//
// 所以补一个信号：对不上的要求过半，同样提示新建方向。这是在
// 施工提示词之外加的，取舍写在这里，行为与 delta_ratio 那条并列。
export const UNMATCHED_THRESHOLD = 0.5;

export function farOff(unmatched: number, requirements: number): boolean {
  if (requirements === 0) return false;
  return unmatched / requirements > UNMATCHED_THRESHOLD;
}

export function farOffCopy(unmatched: number, requirements: number): string {
  const pct = Math.round((unmatched / requirements) * 100);
  return `这份 JD 有 ${unmatched}/${requirements} 条要求（${pct}%）在你的经历库里找不到对应内容。硬凑没有意义，面试第一轮就会问到。要不要单独建一个方向？`;
}

/** deltas 列是无类型 jsonb，读出来必须过一遍。坏数据降级为空。 */
export function parseDeltas(v: Json | null): Delta[] {
  if (!Array.isArray(v)) return [];
  const out: Delta[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json | undefined>;
    const type = o.type;
    if (typeof type !== "string" || !DELTA_TYPES.includes(type as DeltaType)) continue;
    out.push({
      id: typeof o.id === "string" ? o.id : `d${out.length + 1}`,
      type: type as DeltaType,
      targetBlockId: typeof o.targetBlockId === "string" ? o.targetBlockId : "",
      before: typeof o.before === "string" ? o.before : "",
      after: typeof o.after === "string" ? o.after : "",
      reason: typeof o.reason === "string" ? o.reason : "",
      sourceAtomId: typeof o.sourceAtomId === "string" ? o.sourceAtomId : "",
      sourceRef: typeof o.sourceRef === "string" ? o.sourceRef : "",
      accepted: o.accepted !== false,
      manual: o.manual === true,
    });
  }
  return out;
}
