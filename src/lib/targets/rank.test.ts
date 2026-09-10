// =============================================================
// Proofly · 展开程度的自动分配 · P0-3
//
//   node --test src/lib/targets/rank.test.ts
//
// 这一片决定一份简历有多长、哪几段说得详细。它必须是确定性的：
// 同样的数据跑十次要得到同样的十份名单。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  BULLET_CAP,
  TOTAL_BULLET_BUDGET,
  normalizeHits,
  plannedLines,
  rankAtoms,
  recencyScore,
  trimToBudget,
  type RankableAtom,
  type RankedAtom,
} from "./rank";
import type { EvidenceLevel, RenderWeight } from "@/types/database";

const NOW = new Date("2026-09-01T00:00:00Z");

function atom(
  id: string,
  evidenceLevel: EvidenceLevel = "measured",
  periodEnd: string | null = null,
  sortOrder = 0,
): RankableAtom {
  return { id, title: id, evidenceLevel, periodEnd, sortOrder };
}

function weights(ranked: RankedAtom[]): RenderWeight[] {
  return ranked.map((r) => r.weight);
}

// ---- 新近度 ----

test("新近度 · 在职（periodEnd 为 null）按满分", () => {
  assert.equal(recencyScore(null, NOW), 1);
});

test("新近度 · 一年以内满分，五年以上到底", () => {
  assert.equal(recencyScore("2026-01-01", NOW), 1);
  assert.equal(recencyScore("2020-01-01", NOW), 0.2);
});

test("新近度 · 中间线性，越久越低", () => {
  const a = recencyScore("2024-09-01", NOW);
  const b = recencyScore("2022-09-01", NOW);
  assert.ok(a > b, `${a} 应大于 ${b}`);
  assert.ok(a < 1 && b > 0.2);
});

test("新近度 · 日期认不出来时按满分，不抛", () => {
  assert.equal(recencyScore("不是日期", NOW), 1);
});

// ---- 命中权重归一 ----

test("归一 · 全是 0 或者没有命中，返回空表而不是 NaN", () => {
  assert.equal(normalizeHits(new Map()).size, 0);
  assert.equal(normalizeHits(new Map([["a", 0]])).size, 0);
});

test("归一 · 最大值变 1，其余按比例", () => {
  const n = normalizeHits(new Map([["a", 4], ["b", 2]]));
  assert.equal(n.get("a"), 1);
  assert.equal(n.get("b"), 0.5);
});

// ---- 分档 ----

test("分档 · 十条经历排成 2 主打 / 2 展开 / 3 简写 / 3 一行，总行数不超预算", () => {
  const atoms = Array.from({ length: 10 }, (_, i) =>
    atom(`a${i}`, "measured", i < 3 ? null : `20${20 - i}-01-01`, i),
  );
  const ranked = rankAtoms(atoms, new Map(), { hasAssessment: false, now: NOW });
  const total = plannedLines(weights(ranked));
  assert.ok(total <= TOTAL_BULLET_BUDGET, `总行数 ${total}`);
  assert.ok(total >= 22, `总行数 ${total} 太少，预算没用满`);
  assert.equal(ranked.length, 10);
  // 前两名一定是 lead 或者被预算压过一档，绝不会掉到 one_line。
  assert.ok(ranked[0].weight === "lead" || ranked[0].weight === "expand");
});

test("分档 · 命中评估的经历排在前面", () => {
  const atoms = [
    atom("冷门", "measured", null, 0),
    atom("对口", "measured", null, 1),
  ];
  const ranked = rankAtoms(atoms, new Map([["对口", 10]]), {
    hasAssessment: true,
    now: NOW,
  });
  assert.equal(ranked[0].atomId, "对口");
});

test("分档 · 没有评估时，命中项不参与，证明度与新近度按 0.6 / 0.4 放大", () => {
  const ranked = rankAtoms([atom("强", "measured"), atom("弱", "absent")], new Map(), {
    hasAssessment: false,
    now: NOW,
  });
  assert.equal(ranked[0].atomId, "强");
  assert.equal(ranked[0].hit, 0);
  // 0.6 × 1.0 + 0.4 × 1.0
  assert.ok(Math.abs(ranked[0].score - 1) < 1e-9, String(ranked[0].score));
});

test("分档 · 评估跑过但一条没命中，与没跑过评估是两回事", () => {
  const withAssessment = rankAtoms([atom("a", "measured")], new Map(), {
    hasAssessment: true,
    now: NOW,
  });
  const without = rankAtoms([atom("a", "measured")], new Map(), {
    hasAssessment: false,
    now: NOW,
  });
  // 前者命中项实打实拿 0 分，总分只有 0.5；后者不让证明度替空判断背锅。
  assert.ok(withAssessment[0].score < without[0].score);
});

test("分档 · 分数打平时按经历列表的既有顺序，结果稳定", () => {
  const atoms = [atom("b", "measured", null, 5), atom("a", "measured", null, 1)];
  for (let i = 0; i < 5; i++) {
    const ranked = rankAtoms(atoms, new Map(), { hasAssessment: false, now: NOW });
    assert.deepEqual(ranked.map((r) => r.atomId), ["a", "b"]);
  }
});

// ---- 边界 ----

test("边界 · 0 条经历返回空", () => {
  assert.deepEqual(rankAtoms([], new Map(), { hasAssessment: false, now: NOW }), []);
});

test("边界 · 只有 1 条经历，它是 lead，不越界", () => {
  const ranked = rankAtoms([atom("only")], new Map(), { hasAssessment: false, now: NOW });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].weight, "lead");
});

test("边界 · 全是 absent 也照常分档，不会全掉到底", () => {
  const atoms = Array.from({ length: 5 }, (_, i) => atom(`a${i}`, "absent", null, i));
  const ranked = rankAtoms(atoms, new Map(), { hasAssessment: false, now: NOW });
  assert.deepEqual(weights(ranked).slice(0, 2), ["lead", "lead"]);
});

test("边界 · 全部在职（periodEnd 都为 null）不影响分档", () => {
  const atoms = Array.from({ length: 4 }, (_, i) => atom(`a${i}`, "measured", null, i));
  const ranked = rankAtoms(atoms, new Map(), { hasAssessment: false, now: NOW });
  assert.deepEqual(weights(ranked), ["lead", "lead", "expand", "expand"]);
});

// ---- 预算 ----

test("预算 · 超了从末位往前压，压到 one_line 为止，绝不压成 omit", () => {
  const ranked: RankedAtom[] = Array.from({ length: 20 }, (_, i) => ({
    atomId: `a${i}`,
    title: `a${i}`,
    score: 1,
    weight: "lead" as RenderWeight,
    hit: 0,
    evidence: 1,
    recency: 1,
  }));
  trimToBudget(ranked, 26);
  assert.ok(!ranked.some((r) => r.weight === "omit"));
  // 压到刚好进预算就停手，不会一路压到底 —— 每多留一行都是多说一句话。
  assert.ok(plannedLines(weights(ranked)) <= 26);
  assert.ok(ranked.some((r) => r.weight !== "one_line"), "不该全部压到最低档");
});

test("预算 · 二十条经历每条至少留一行，一条都不会消失", () => {
  const ranked: RankedAtom[] = Array.from({ length: 40 }, (_, i) => ({
    atomId: `a${i}`,
    title: `a${i}`,
    score: 1,
    weight: "lead" as RenderWeight,
    hit: 0,
    evidence: 1,
    recency: 1,
  }));
  trimToBudget(ranked, 10);
  // 四十条经历放不进十行的预算。宁可超预算，也不能让一条经历消失。
  assert.equal(plannedLines(weights(ranked)), 40);
  assert.ok(ranked.every((r) => r.weight === "one_line"));
});

test("预算 · 压不下去时停手，不空转", () => {
  const ranked: RankedAtom[] = [
    { atomId: "a", title: "a", score: 1, weight: "one_line", hit: 0, evidence: 1, recency: 1 },
  ];
  trimToBudget(ranked, 0);
  assert.equal(ranked[0].weight, "one_line");
});

test("预算 · 行数表与档位一一对应", () => {
  assert.equal(BULLET_CAP.lead, 5);
  assert.equal(BULLET_CAP.expand, 4);
  assert.equal(BULLET_CAP.brief, 2);
  // 原来 one_line 是 0，等同于 omit —— 一条设成「一行」的经历直接消失。
  assert.equal(BULLET_CAP.one_line, 1);
  assert.equal(BULLET_CAP.omit, 0);
});
