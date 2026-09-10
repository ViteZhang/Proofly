// =============================================================
// Proofly · 经历在一个方向下的展开程度,由代码算
//
// 原来的做法是:atom_target_strategy 没记录就一律按 brief 处理,等用户
// 自己去配。真实数据里那张表是空的 —— 不是「用户忘了配」,是产品少了
// 一步。结果十条经历全走默认值,每条硬截 2 行,一份最压缩形态的简历。
//
// 排序的依据已经现成:assessments.strengths 记着每条经历命中了哪几条
// JD 要求,requirements.weight 记着每条要求有多重。这两样加上证明度和
// 新近度,足以给出一个比「全都一样」好得多的默认分配。
//
// 算出来的是默认值,不是结论:用户改过的行永不被覆盖(source='manual')。
//
// 纯函数,不连库、不 import Next。
// =============================================================

import type { EvidenceLevel, RenderWeight } from "@/types/database";

/** 每档占几行。one_line 的那一行落在 summary 上,不是 bullet。 */
export const BULLET_CAP: Record<RenderWeight, number> = {
  lead: 5,
  expand: 4,
  brief: 2,
  one_line: 1,
  omit: 0,
};

/**
 * 一份简历的总行数预算。26 行大约两页。
 *
 * 它是上限不是目标:经历不够多的时候不会去凑,只在超了的时候往下压。
 */
export const TOTAL_BULLET_BUDGET = 26;

/** 名次 → 档位。前两条是这个方向的主打。 */
export const TIERS: { upTo: number; weight: RenderWeight }[] = [
  { upTo: 2, weight: "lead" },
  { upTo: 4, weight: "expand" },
  { upTo: 7, weight: "brief" },
];
const TAIL_WEIGHT: RenderWeight = "one_line";

/** 往下压的顺序。omit 不在里面 —— 自动分配不会把一条经历整个删掉。 */
const DOWNGRADE: RenderWeight[] = ["lead", "expand", "brief", "one_line"];

const EVIDENCE_SCORE: Record<EvidenceLevel, number> = {
  measured: 1.0,
  estimated: 0.7,
  designed_only: 0.4,
  absent: 0.2,
};

/** 有评估时的三项权重。 */
const W_HIT = 0.5;
const W_EVIDENCE = 0.3;
const W_RECENCY = 0.2;
/** 没有评估时,命中项拿不到分,剩下两项按比例放大。 */
const W_EVIDENCE_ALONE = 0.6;
const W_RECENCY_ALONE = 0.4;

const RECENT_MONTHS = 12;
const STALE_MONTHS = 60;
const STALE_SCORE = 0.2;

export type RankableAtom = {
  id: string;
  title: string;
  evidenceLevel: EvidenceLevel;
  /** null 表示至今,按最新算。 */
  periodEnd: string | null;
  /** 经历列表里的既有顺序,分数打平时兜底。 */
  sortOrder: number;
};

/** 这条经历在这个方向的评估里命中的要求权重之和。没有评估就是空表。 */
export type HitWeights = Map<string, number>;

export type RankedAtom = {
  atomId: string;
  title: string;
  score: number;
  weight: RenderWeight;
  /** 三个分项,写进解释文案用 */
  hit: number;
  evidence: number;
  recency: number;
};

/**
 * 距今多少个月 → 新近度分。
 *
 * 一年以内满分,五年以上 0.2,中间线性。在职(periodEnd 为 null)按满分 ——
 * 一段还没结束的经历,不管它从哪年开始,都是「现在的」。
 */
export function recencyScore(periodEnd: string | null, now: Date): number {
  if (!periodEnd) return 1;
  const end = new Date(`${periodEnd.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return 1;
  const months =
    (now.getUTCFullYear() - end.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - end.getUTCMonth());
  if (months <= RECENT_MONTHS) return 1;
  if (months >= STALE_MONTHS) return STALE_SCORE;
  const span = STALE_MONTHS - RECENT_MONTHS;
  return 1 - ((months - RECENT_MONTHS) / span) * (1 - STALE_SCORE);
}

/** 把命中权重归一到 0–1。全是 0(或没有评估)时整项返回 0,不是 NaN。 */
export function normalizeHits(hits: HitWeights): Map<string, number> {
  let max = 0;
  for (const v of hits.values()) if (v > max) max = v;
  const out = new Map<string, number>();
  if (max <= 0) return out;
  for (const [k, v] of hits) out.set(k, v / max);
  return out;
}

/**
 * 排名 + 分档 + 预算兜底。
 *
 * hasAssessment 单独传,不靠「hits 是不是空的」推断 —— 评估跑过但一条都
 * 没命中,和根本没跑过评估,是两件事:前者说明这些经历确实不对口,命中项
 * 该实打实地拿 0 分;后者不该让证明度和新近度替一个不存在的判断背锅。
 */
export function rankAtoms(
  atoms: RankableAtom[],
  hits: HitWeights,
  opts: { hasAssessment: boolean; now?: Date; budget?: number } = { hasAssessment: false },
): RankedAtom[] {
  if (atoms.length === 0) return [];
  const now = opts.now ?? new Date();
  const budget = opts.budget ?? TOTAL_BULLET_BUDGET;
  const normalized = normalizeHits(hits);

  const wHit = opts.hasAssessment ? W_HIT : 0;
  const wEvidence = opts.hasAssessment ? W_EVIDENCE : W_EVIDENCE_ALONE;
  const wRecency = opts.hasAssessment ? W_RECENCY : W_RECENCY_ALONE;

  const scored = atoms.map((a) => {
    const hit = normalized.get(a.id) ?? 0;
    const evidence = EVIDENCE_SCORE[a.evidenceLevel] ?? 0.2;
    const recency = recencyScore(a.periodEnd, now);
    return {
      atomId: a.id,
      title: a.title,
      score: hit * wHit + evidence * wEvidence + recency * wRecency,
      weight: TAIL_WEIGHT,
      hit,
      evidence,
      recency,
    };
  });

  // 分数打平时按经历列表的既有顺序 —— 同一份数据换个查询顺序不能换个结果。
  const orderById = new Map(atoms.map((a) => [a.id, a.sortOrder]));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const oa = orderById.get(a.atomId) ?? 0;
    const ob = orderById.get(b.atomId) ?? 0;
    if (oa !== ob) return oa - ob;
    return a.atomId.localeCompare(b.atomId);
  });

  scored.forEach((s, i) => {
    const rank = i + 1;
    s.weight = TIERS.find((t) => rank <= t.upTo)?.weight ?? TAIL_WEIGHT;
  });

  trimToBudget(scored, budget);
  return scored;
}

/**
 * 超预算时从末位往前逐档下压,压到 one_line 为止。
 *
 * 不压到 omit:少一行是版面问题,少一段经历是内容问题。宁可多半页,
 * 也不能让一条本该出现的经历因为算术不够用而消失。
 */
export function trimToBudget(ranked: RankedAtom[], budget: number): void {
  const total = () => ranked.reduce((n, r) => n + BULLET_CAP[r.weight], 0);
  // 每一轮最多下压一档,轮数封顶,防止表配错时空转。
  const maxRounds = ranked.length * DOWNGRADE.length + 1;
  for (let round = 0; total() > budget && round < maxRounds; round++) {
    let moved = false;
    for (let i = ranked.length - 1; i >= 0; i--) {
      const at = DOWNGRADE.indexOf(ranked[i].weight);
      if (at < 0 || at >= DOWNGRADE.length - 1) continue;
      ranked[i].weight = DOWNGRADE[at + 1];
      moved = true;
      break;
    }
    if (!moved) break;
  }
}

/** 预计行数。生成按钮旁边那句「预计 N 条」用它。 */
export function plannedLines(weights: RenderWeight[]): number {
  return weights.reduce((n, w) => n + BULLET_CAP[w], 0);
}
