// =============================================================
// Proofly · 用量收集单单测
//
//   pnpm telemetry:test
//
// 这张收集单是「每条 usage_logs 都要带 token 与耗时」（C2 验收 5）
// 的唯一实现，而它靠 AsyncLocalStorage —— 跨 await 断掉就静默失效，
// 谁都不会报错，只是 token 全成了 null。所以得测。
// =============================================================

import assert from "node:assert/strict";
import { test } from "node:test";

import { createSink, reportCall, totals, withUsageSink } from "./usage";

function call(prompt: number, completion: number, ms: number, succeeded = true) {
  reportCall({
    purpose: "t",
    provider: "p",
    model: "m",
    promptTokens: prompt,
    completionTokens: completion,
    durationMs: ms,
    succeeded,
  });
}

test("作用域外调用不报错，静默丢弃", () => {
  assert.doesNotThrow(() => call(1, 1, 1));
});

test("作用域内的调用被记下并汇总", async () => {
  const sink = createSink();
  await withUsageSink(sink, async () => {
    call(100, 50, 1000);
    call(200, 80, 2000);
  });
  const t = totals(sink);
  assert.equal(t.inputTokens, 300);
  assert.equal(t.outputTokens, 130);
  assert.equal(t.durationMs, 3000);
  assert.equal(t.callCount, 2);
});

test("跨 await 仍在同一张收集单上", async () => {
  const sink = createSink();
  await withUsageSink(sink, async () => {
    call(10, 5, 100);
    await new Promise((r) => setTimeout(r, 5));
    call(20, 10, 200); // 这一笔在 await 之后，最容易掉的就是它
    await Promise.all([
      (async () => {
        await new Promise((r) => setTimeout(r, 1));
        call(30, 15, 300);
      })(),
    ]);
  });
  assert.equal(totals(sink).callCount, 3);
  assert.equal(totals(sink).inputTokens, 60);
});

test("失败的调用也记 —— 失败一样烧 token", async () => {
  const sink = createSink();
  await withUsageSink(sink, async () => {
    call(500, 0, 900, false);
  });
  assert.equal(totals(sink).inputTokens, 500);
  assert.equal(sink.calls[0].succeeded, false);
});

test("两张收集单互不串台", async () => {
  const a = createSink();
  const b = createSink();
  await Promise.all([
    withUsageSink(a, async () => {
      await new Promise((r) => setTimeout(r, 3));
      call(1, 1, 1);
    }),
    withUsageSink(b, async () => {
      call(2, 2, 2);
      await new Promise((r) => setTimeout(r, 1));
      call(3, 3, 3);
    }),
  ]);
  assert.equal(totals(a).callCount, 1);
  assert.equal(totals(b).callCount, 2);
});

test("一次调用都没有时汇总为空，而不是 0", () => {
  const t = totals(createSink());
  assert.equal(t.inputTokens, null, "没调过模型的动作不该记成「0 token」");
  assert.equal(t.callCount, 0);
});
