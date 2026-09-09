// =============================================================
// 守卫：管道给自己的预算，必须真的小于平台那把刀
//
// 这两个数分居两个文件（maxDuration 必须是页面段配置里的字面量，
// Next 要能静态读到，不能 import 一个常量进去），所以只能靠测试把它们钉在一起。
// 谁把 INVOCATION_BUDGET_MS 调过了头，这里立刻红。
// =============================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/app/import/page.tsx", "utf8");
const pipeline = readFileSync("src/lib/ingest/pipeline.ts", "utf8");
const core = readFileSync("src/lib/llm/core.ts", "utf8");

function num(src: string, re: RegExp, what: string): number {
  const m = src.match(re);
  assert.ok(m, `没找到 ${what}`);
  return Number(m[1].replace(/_/g, ""));
}

/** 一条候选最坏要花的时间：Pass 2 + 召回 + Pass 3 + 收尾余量。 */
function unitWorstMs(): number {
  return (
    num(pipeline, /PASS2_CAP_MS = ([\d_]+)/, "PASS2_CAP_MS") +
    num(pipeline, /PASS3_CAP_MS = ([\d_]+)/, "PASS3_CAP_MS") +
    num(pipeline, /RECALL_BUDGET_MS = ([\d_]+)/, "RECALL_BUDGET_MS") +
    num(pipeline, /RESERVE_MS = ([\d_]+)/, "RESERVE_MS")
  );
}

test("导入页声明了 maxDuration", () => {
  const s = num(page, /export const maxDuration = (\d+)/, "maxDuration");
  assert.ok(s > 0, "maxDuration 要是正数");
});

test("管道预算明显小于平台上限", () => {
  const wallMs = num(page, /export const maxDuration = (\d+)/, "maxDuration") * 1000;
  const budget = num(pipeline, /INVOCATION_BUDGET_MS = ([\d_]+)/, "INVOCATION_BUDGET_MS");
  assert.ok(
    budget < wallMs,
    `预算 ${budget}ms 不能大于等于平台上限 ${wallMs}ms，否则等于没有预算`,
  );
  // 冷启动、几次写库、结算都要时间。留不出 30 秒就等于没留。
  assert.ok(
    wallMs - budget >= 30_000,
    `预算离上限只差 ${wallMs - budget}ms，太紧，收尾会被砍`,
  );
});

test("一条候选最坏也装得进一轮预算", () => {
  const budget = num(pipeline, /INVOCATION_BUDGET_MS = ([\d_]+)/, "INVOCATION_BUDGET_MS");
  const worst = unitWorstMs();
  assert.ok(
    worst <= budget,
    `一条候选最坏要 ${worst}ms，超过一轮预算 ${budget}ms —— ` +
      `那意味着有的候选永远跑不完，续跑多少次都一样`,
  );
});

test("开新候选的门槛，至少够一家把 Pass 2 试一次", () => {
  const unitMin = num(pipeline, /UNIT_MIN_MS = ([\d_]+)/, "UNIT_MIN_MS");
  const pass3 = num(pipeline, /PASS3_CAP_MS = ([\d_]+)/, "PASS3_CAP_MS");
  const recall = num(pipeline, /RECALL_BUDGET_MS = ([\d_]+)/, "RECALL_BUDGET_MS");
  const reserve = num(pipeline, /RESERVE_MS = ([\d_]+)/, "RESERVE_MS");
  const minProvider = num(core, /MIN_PROVIDER_MS = ([\d_]+)/, "MIN_PROVIDER_MS");

  // 门槛低于这个数，就会出现「开了一条、Pass 2 连一家都没敲完就被砍」——
  // 钱烧了，候选还是 pending，什么都不留下。那正是要根治的那种失败。
  const floor = minProvider + recall + pass3 + reserve;
  assert.ok(
    unitMin >= floor,
    `开新候选的门槛 ${unitMin}ms 低于最低需要的 ${floor}ms`,
  );
});
