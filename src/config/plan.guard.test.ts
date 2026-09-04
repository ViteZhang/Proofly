// =============================================================
// Proofly · 价目守卫单测
//
//   pnpm guard:plan
//
// 也在 build 里跑一遍（package.json）。涨价 → 构建失败。
// 覆盖《商业化 C1》验收清单 17–19。
// =============================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { ACTION_PRICES, FREE_FOREVER, FREE_QUOTA, LIMITS, PACKAGES } from "./plan";
import {
  PRICE_FLOOR_HISTORY,
  assertPriceFloor,
  checkPrices,
  findUnrecordedActions,
} from "./plan.guard";

// ---- 真实配置 ----

test("当前价目表不高于历史最低价", () => {
  assert.deepEqual(checkPrices(), []);
  assert.doesNotThrow(() => assertPriceFloor());
});

test("每个动作都已登记 floor", () => {
  // 新动作允许暂时缺席，但既然是构建期检查，就顺手提醒补登记。
  assert.deepEqual(findUnrecordedActions(), []);
});

test("floor 里没有已下线的动作", () => {
  const live = new Set(Object.keys(ACTION_PRICES));
  const stale = Object.keys(PRICE_FLOOR_HISTORY).filter((k) => !live.has(k));
  assert.deepEqual(stale, []);
});

// ---- 验收 17–19：用合成价目表跑，不动真配置 ----

test("验收 17 · 上调任一标价即失败", () => {
  const bad = checkPrices({ resume_baseline: 12 }, { resume_baseline: 10 });
  assert.deepEqual(bad, [{ action: "resume_baseline", floor: 10, current: 12 }]);
  assert.throws(
    () => assertPriceFloor({ resume_baseline: 12 }, { resume_baseline: 10 }),
    /只可下调/,
  );
});

test("验收 18 · 下调通过", () => {
  assert.deepEqual(checkPrices({ resume_baseline: 8 }, { resume_baseline: 10 }), []);
  assert.doesNotThrow(() => assertPriceFloor({ resume_baseline: 8 }, { resume_baseline: 10 }));
});

test("验收 18b · 持平通过", () => {
  assert.deepEqual(checkPrices({ resume_baseline: 10 }, { resume_baseline: 10 }), []);
});

test("验收 19 · 新增动作通过，并被列为待登记", () => {
  const prices = { resume_baseline: 10, brand_new_action: 7 };
  const floor = { resume_baseline: 10 };
  assert.deepEqual(checkPrices(prices, floor), []);
  assert.deepEqual(findUnrecordedActions(prices, floor), ["brand_new_action"]);
});

test("多项同时涨价全部报出来", () => {
  const bad = checkPrices(
    { a: 2, b: 3, c: 1 },
    { a: 1, b: 1, c: 1 },
  );
  assert.deepEqual(bad.map((v) => v.action), ["a", "b"]);
});

// ---- 守卫本身不许被写空 ----

test("floor 必须是手写字面量，不能从 ACTION_PRICES 展开", () => {
  // 写成 { ...ACTION_PRICES } 的话守卫永远为真，等于没写。
  // 这条测的是那个具体的退化写法，所以直接读源码。
  const src = readFileSync(path.join(import.meta.dirname, "plan.guard.ts"), "utf8");
  const decl = src.slice(src.indexOf("export const PRICE_FLOOR_HISTORY"));
  const body = decl.slice(0, decl.indexOf("};") + 2);
  assert.ok(!body.includes("...ACTION_PRICES"), "PRICE_FLOOR_HISTORY 不许展开 ACTION_PRICES");
  assert.ok(!body.includes("..."), "PRICE_FLOOR_HISTORY 不许用展开语法");
});

// ---- 配置自身的一致性 ----

test("免费白名单与付费动作不重叠", () => {
  const paid = new Set(Object.keys(ACTION_PRICES));
  for (const code of FREE_FOREVER) {
    assert.ok(!paid.has(code), `${code} 同时出现在 FREE_FOREVER 和 ACTION_PRICES`);
  }
});

test("标价非负且为整数", () => {
  for (const [k, v] of Object.entries(ACTION_PRICES)) {
    assert.ok(Number.isInteger(v) && v >= 0, `${k} 的标价不合法：${v}`);
  }
});

test("注册赠送等于 3 份文档解析", () => {
  // 官网首页写的是「注册送 3 份材料解析」。这条一旦对不上，
  // 首页文案就在骗人 —— 改额度时两边必须一起动。
  assert.equal(FREE_QUOTA.signup_grant_credits, ACTION_PRICES.doc_parse_base * 3);
});

test("异步动作的 hold 活得比同步动作久", () => {
  assert.ok(LIMITS.hold_ttl_async_min > LIMITS.hold_ttl_sync_min);
});

test("积分包单价随档位递减", () => {
  const unit = PACKAGES.map((p) => p.price_cny / p.credits);
  for (let i = 1; i < unit.length; i++) {
    assert.ok(unit[i] < unit[i - 1], `${PACKAGES[i].name} 的单价没有比上一档更低`);
  }
});
