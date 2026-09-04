// =============================================================
// Proofly · 深扫分批与跳过的单测
//
// 这个函数决定「这次调几次模型」。判错了要么重复烧钱，要么该扫的
// 没扫却收了 5 分。
// =============================================================

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectDeepScanBatch } from "./c8-conflict";
import type { HealthAtom, HealthContext } from "./types";

function atom(id: string, updatedAt: string, lastRev?: string | null, sources = 2): HealthAtom {
  return {
    id,
    title: id,
    org: null,
    role: null,
    status: "shipped",
    evidenceLevel: "measured",
    situation: null,
    task: null,
    actions: [],
    periodStart: null,
    periodEnd: null,
    metrics: [],
    updatedAt,
    lastDeepScanRev: lastRev ?? null,
    sourceDocIds: Array.from({ length: sources }, (_, i) => `d${i}`),
  };
}

function ctx(atoms: HealthAtom[]): HealthContext {
  return { atoms } as unknown as HealthContext;
}

const T = (n: number) => new Date(2026, 0, n).toISOString();

test("单一来源的经历本来就不扫", () => {
  const r = selectDeepScanBatch(ctx([atom("a", T(1), null, 1)]));
  assert.equal(r.batch.length, 0);
});

test("验收 29 · 12 条待扫只扫 10 条，报还剩 2 条", () => {
  const atoms = Array.from({ length: 12 }, (_, i) => atom(`a${i}`, T(i + 1)));
  const r = selectDeepScanBatch(ctx(atoms));
  assert.equal(r.batch.length, 10);
  assert.equal(r.remaining, 2);
});

test("按最近更新排序 —— 刚改过的最可能有冲突", () => {
  const r = selectDeepScanBatch(ctx([atom("old", T(1)), atom("new", T(9))]), 1);
  assert.deepEqual(r.batch.map((a) => a.id), ["new"]);
  assert.equal(r.remaining, 1);
});

test("验收 31 · 扫过且此后没改过的跳过，不调模型", () => {
  const r = selectDeepScanBatch(ctx([atom("done", T(5), T(5)), atom("dirty", T(6), T(5))]));
  assert.deepEqual(r.batch.map((a) => a.id), ["dirty"]);
  assert.deepEqual(r.skipped.map((a) => a.id), ["done"]);
});

test("扫过之后又改过的要重扫", () => {
  const r = selectDeepScanBatch(ctx([atom("a", T(7), T(5))]));
  assert.equal(r.batch.length, 1, "改过就得重扫，上次的结论已经不作数了");
});

test("全都扫过且没改 → 一条都不扫（这时不该收钱）", () => {
  const r = selectDeepScanBatch(ctx([atom("a", T(3), T(3)), atom("b", T(4), T(9))]));
  assert.equal(r.batch.length, 0);
  assert.equal(r.remaining, 0);
});
