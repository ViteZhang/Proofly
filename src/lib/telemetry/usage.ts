// =============================================================
// Proofly · 调用用量的环境采集
//
// 为什么需要它：验收要求每条 usage_logs 都带 token 与耗时，而
// token 只有 callLLM 知道、写 usage_logs 的只有计费层。让业务代码
// 把 usage 一路手传过去，等于每接一个动作都要改一次业务签名 ——
// 那正是「改造已有代码时不要顺手重构」要避免的事。
//
// 所以用 AsyncLocalStorage 开一个作用域：计费层在执行动作前铺一张
// 收集单，callLLM 每发一次请求就往上记一笔。业务代码一个字不用改。
//
// **这个模块是中立的。** llm 与 billing 都 import 它，但两者互不
// import —— 熔断是安全机制、计费是商业机制，这条边界有架构测试盯着。
// =============================================================

import { AsyncLocalStorage } from "node:async_hooks";

export type CallUsage = {
  purpose: string;
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
  /** 这次请求本身成没成。失败的也要记 —— 失败一样烧 token。 */
  succeeded: boolean;
};

export type UsageSink = { calls: CallUsage[] };

const store = new AsyncLocalStorage<UsageSink>();

/** 开一个收集作用域。fn 里（含其 await 链）发出的每次模型调用都会被记下。 */
export function withUsageSink<T>(sink: UsageSink, fn: () => Promise<T>): Promise<T> {
  return store.run(sink, fn);
}

export function createSink(): UsageSink {
  return { calls: [] };
}

/**
 * 记一次实际发出的请求。
 *
 * 没有活动作用域时静默丢弃 —— 脚本、探针、后台任务都可能在作用域外
 * 调模型，那不是错误。记账永远不该让业务调用失败。
 */
export function reportCall(c: CallUsage): void {
  const sink = store.getStore();
  if (!sink) return;
  sink.calls.push(c);
}

export type UsageTotals = {
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  callCount: number;
};

/** 汇总。一次动作可能发了好几次请求（重试、分段、逐条）。 */
export function totals(sink: UsageSink): UsageTotals {
  if (sink.calls.length === 0) {
    return { inputTokens: null, outputTokens: null, durationMs: 0, callCount: 0 };
  }
  let input = 0;
  let output = 0;
  let ms = 0;
  for (const c of sink.calls) {
    input += c.promptTokens ?? 0;
    output += c.completionTokens ?? 0;
    ms += c.durationMs;
  }
  return { inputTokens: input, outputTokens: output, durationMs: ms, callCount: sink.calls.length };
}
