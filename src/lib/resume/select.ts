// =============================================================
// Proofly · 基线选材
//
// 《Step 6 施工提示词 v1.0》第三节。选哪几条经历、每条展开到什么程度、
// 互斥组里留谁 —— 全部由代码判定，不交给模型。
//
// 为什么不交给模型：互斥消解的规则是三级排序，模型每次生成都可能给出
// 不同的结果，而用户前一天刚看过一版。选材必须是确定的，同样的策略配置
// 生成十次要得到同样的十份名单。
//
// 不 import Next、不连库。
// =============================================================

import type { EvidenceLevel, EvidenceStrength, RenderWeight } from "@/types/database";

/** 3.1 展开权重的处理方式。文案直接进「本版取舍」。 */
export const WEIGHT_RULE: Record<RenderWeight, string> = {
  expand: "完整展开，3–5 条 bullet",
  brief: "压缩，1–2 条 bullet",
  one_line: "一行概述，无 bullet",
  omit: "不出现",
};

// 3.2 互斥消解的三级排序。顺序即优先级，越靠前越优先。
const WEIGHT_RANK: RenderWeight[] = ["expand", "brief", "one_line", "omit"];
const EVIDENCE_RANK: EvidenceLevel[] = ["measured", "estimated", "designed_only", "absent"];

export type SelectableAtom = {
  id: string;
  title: string;
  evidenceLevel: EvidenceLevel;
  periodStart: string | null;
  /** null 表示至今，3.2 明确规定视为最近。 */
  periodEnd: string | null;
  renderWeight: RenderWeight;
  exclusiveGroup: string | null;
  sortOrder: number;
};

/** 本版取舍的一条。界面上原样列出来，用户才知道为什么少了一段。 */
export type Tradeoff = {
  kind: "omit" | "exclusive" | "skill";
  atomId: string | null;
  title: string;
  detail: string;
};

/** null（至今）排在所有具体日期之前。 */
function endRank(v: string | null): string {
  return v === null ? "9999-12-31" : v;
}

/**
 * 3.2 的三级比较：render_weight → evidence_level → period_end。
 * 返回负数表示 a 胜出。第四级用 sort_order 兜底，保证结果稳定 ——
 * 三项全平时如果靠数组原顺序，同一份配置换个查询顺序就换个赢家。
 */
export function compareCandidates(a: SelectableAtom, b: SelectableAtom): number {
  const w = WEIGHT_RANK.indexOf(a.renderWeight) - WEIGHT_RANK.indexOf(b.renderWeight);
  if (w !== 0) return w;
  const e = EVIDENCE_RANK.indexOf(a.evidenceLevel) - EVIDENCE_RANK.indexOf(b.evidenceLevel);
  if (e !== 0) return e;
  const p = endRank(b.periodEnd).localeCompare(endRank(a.periodEnd));
  if (p !== 0) return p;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id.localeCompare(b.id);
}

/** 说清楚是哪一级规则把它比下去的。「不相关」这种理由等于没给理由。 */
export function loseReason(winner: SelectableAtom, loser: SelectableAtom): string {
  if (winner.renderWeight !== loser.renderWeight) {
    return `「${winner.title}」的展开权重是${WEIGHT_RULE[winner.renderWeight].split("，")[0]}，更靠前`;
  }
  if (winner.evidenceLevel !== loser.evidenceLevel) {
    return `两条权重相同，「${winner.title}」的证明度更高（${winner.evidenceLevel} > ${loser.evidenceLevel}）`;
  }
  if (endRank(winner.periodEnd) !== endRank(loser.periodEnd)) {
    const w = winner.periodEnd === null ? "至今" : winner.periodEnd;
    return `权重与证明度都相同，「${winner.title}」时间更近（${w}）`;
  }
  return `三项都相同，按经历列表的既有顺序取「${winner.title}」`;
}

export type Selection = {
  selected: SelectableAtom[];
  tradeoffs: Tradeoff[];
};

/**
 * 3.1 + 3.2：先去掉 omit，再在每个互斥组里二选一。
 *
 * 顺序不能倒过来 —— 已经选了「省略」的经历不该参与互斥竞争，
 * 否则它可能"赢"下一组，把本来要出现的那条挤掉，结果两条都不出现。
 */
export function resolveSelection(atoms: SelectableAtom[]): Selection {
  const tradeoffs: Tradeoff[] = [];
  const alive: SelectableAtom[] = [];

  for (const a of atoms) {
    if (a.renderWeight === "omit") {
      tradeoffs.push({
        kind: "omit",
        atomId: a.id,
        title: a.title,
        detail: "这个方向下设成了「省略」，本版没有出现。",
      });
      continue;
    }
    alive.push(a);
  }

  const groups = new Map<string, SelectableAtom[]>();
  const free: SelectableAtom[] = [];
  for (const a of alive) {
    const g = a.exclusiveGroup?.trim();
    if (!g) {
      free.push(a);
      continue;
    }
    const list = groups.get(g) ?? [];
    list.push(a);
    groups.set(g, list);
  }

  const winners: SelectableAtom[] = [...free];
  for (const [group, list] of groups) {
    const sorted = [...list].sort(compareCandidates);
    const winner = sorted[0];
    winners.push(winner);
    for (const loser of sorted.slice(1)) {
      tradeoffs.push({
        kind: "exclusive",
        atomId: loser.id,
        title: loser.title,
        detail: `与「${winner.title}」同属互斥组「${group}」，同组只能留一条：${loseReason(winner, loser)}。`,
      });
    }
  }

  // 输出顺序仍按经历列表的既有顺序，互斥消解只做减法。
  const keep = new Set(winners.map((a) => a.id));
  return { selected: atoms.filter((a) => keep.has(a.id)), tradeoffs };
}

// ---- 3.3 技能栏 ----

export type SelectableSkill = {
  id: string;
  label: string;
  strength: EvidenceStrength;
  category: string | null;
};

const STRENGTH_RANK: EvidenceStrength[] = ["strong", "weak", "none"];

/** 技能名与 JD 原词指同一件事。两个方向都查，短词不算（「AI」会命中一切）。 */
export function matchesPhrase(label: string, phrases: string[]): boolean {
  const l = label.trim().toLowerCase();
  if (l.length < 2) return false;
  return phrases.some((p) => {
    const t = p.trim().toLowerCase();
    if (t.length < 2) return false;
    return t.includes(l) || l.includes(t);
  });
}

/**
 * 只输出 evidence_strength 不为 none 的技能。
 * 被过滤掉的写进「本版取舍」—— 悄悄少一个标签，用户会以为是自己记错了。
 */
export function selectSkills(
  skills: SelectableSkill[],
  rawPhrases: string[],
): { kept: SelectableSkill[]; tradeoffs: Tradeoff[] } {
  const tradeoffs: Tradeoff[] = [];
  const kept: SelectableSkill[] = [];

  for (const s of skills) {
    if (s.strength === "none") {
      tradeoffs.push({
        kind: "skill",
        atomId: null,
        title: s.label,
        detail: "没有任何经历能支撑它，写进技能栏面试第一个就会问到，已过滤。",
      });
      continue;
    }
    kept.push(s);
  }

  // 与 JD 原词有匹配的优先，其余按 evidence_strength 排。
  return {
    kept: kept.sort((a, b) => {
      const am = matchesPhrase(a.label, rawPhrases) ? 0 : 1;
      const bm = matchesPhrase(b.label, rawPhrases) ? 0 : 1;
      if (am !== bm) return am - bm;
      const s = STRENGTH_RANK.indexOf(a.strength) - STRENGTH_RANK.indexOf(b.strength);
      if (s !== 0) return s;
      return a.label.localeCompare(b.label, "zh");
    }),
    tradeoffs,
  };
}
