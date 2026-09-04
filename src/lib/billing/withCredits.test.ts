// =============================================================
// Proofly · 计费包装器单测
//
//   pnpm billing:test
//
// 用假动作（mock run）把九步顺序的每个分支都走一遍。
// 对应《商业化 C1》验收 20、22、25、31–34。
//
// 数据库那半边（三态、幂等、并发、扣减优先级）在
// supabase/tests/billing_acceptance.sql 与 scripts/billing-concurrency.sh，
// 那些必须对真库跑，假客户端测不出行级锁。
// =============================================================

import assert from "node:assert/strict";
import { test } from "node:test";

import { ACTION_PRICES } from "@/config/plan";
import {
  CancelledError,
  DAILY_CAP_MESSAGE,
  withCredits,
  type BillingClient,
} from "./withCredits";

// ---- 假客户端 ----

type RpcCall = { name: string; args: Record<string, unknown> };

function chain(result: unknown) {
  const obj: Record<string, unknown> = {
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
    obj[m] = () => obj;
  }
  return obj;
}

type FakeCfg = {
  blocking?: number;
  balance?: number;
  rpc?: Record<string, unknown>;
};

function fake(cfg: FakeCfg = {}) {
  const calls: RpcCall[] = [];
  const client = {
    from(table: string) {
      if (table === "check_results") return chain({ count: cfg.blocking ?? 0 });
      if (table === "quota_counters") {
        return chain({ data: { credits_available: cfg.balance ?? 100 } });
      }
      return chain({ data: null });
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const v = cfg.rpc?.[name];
      if (v && typeof v === "object" && "error" in (v as object)) return Promise.resolve(v);
      return Promise.resolve({ data: v ?? null, error: null });
    },
  };
  return { client: client as unknown as BillingClient, calls };
}

const HOLD_OK = {
  hold_id: "h-1",
  release_token: "t-1",
  balance_after: 90,
  idempotent: false,
};

function names(calls: RpcCall[]) {
  return calls.map((c) => c.name);
}

// ---- 1 前置检查 ----

test("步骤 1 · 有 blocking 时返回 BLOCKED，且不 HOLD（验收 31）", async () => {
  const { client, calls } = fake({ blocking: 2 });
  let ran = false;
  const r = await withCredits({
    actionCode: "resume_baseline",
    userId: "u1",
    idempotencyKey: "k1",
    client,
    run: async () => {
      ran = true;
      return "x";
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "BLOCKED");
  assert.equal(ran, false, "被阻断时不该执行动作");
  assert.ok(!names(calls).includes("hold_credits"), "被阻断时不该产生 hold");
});

test("步骤 1 · 阻断只挡产出材料的动作，不挡拿来修数据的动作", async () => {
  const { client, calls } = fake({ blocking: 3, rpc: { hold_credits: HOLD_OK } });
  const r = await withCredits({
    actionCode: "doc_parse_base",
    userId: "u1",
    idempotencyKey: "k2",
    client,
    run: async () => "ok",
  });
  assert.equal(r.ok, true);
  assert.ok(names(calls).includes("hold_credits"));
});

// ---- 2 永久免费 ----

test("步骤 2 · 白名单动作不 HOLD，写 free_forever（验收 20）", async () => {
  const { client, calls } = fake();
  const r = await withCredits({
    actionCode: "data_export",
    userId: "u1",
    idempotencyKey: "k3",
    client,
    run: async () => "dump",
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.charged, 0);
  assert.equal(r.ok === true && r.freeReason, "free_forever");
  assert.ok(!names(calls).includes("hold_credits"));
  assert.equal(calls[0].name, "log_free_usage");
  assert.equal(calls[0].args.p_reason, "free_forever");
});

// ---- 3 限次免费 ----

test("步骤 3 · 本月额度未用完 → 免费（验收 21）", async () => {
  const { client, calls } = fake({ rpc: { bump_chat_day: true, consume_free_chat: true } });
  const r = await withCredits({
    actionCode: "chat_record",
    userId: "u1",
    idempotencyKey: "k4",
    client,
    run: async () => "said",
  });
  assert.equal(r.ok === true && r.freeReason, "free_quota");
  assert.ok(!names(calls).includes("hold_credits"));
});

test("步骤 3 · 额度用完 → 按超额价扣 1 分（验收 22）", async () => {
  const { client, calls } = fake({
    rpc: { bump_chat_day: true, consume_free_chat: false, hold_credits: HOLD_OK },
  });
  const r = await withCredits({
    actionCode: "chat_record",
    userId: "u1",
    idempotencyKey: "k5",
    client,
    run: async () => "said",
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.charged, ACTION_PRICES.chat_record_overage);
  const hold = calls.find((c) => c.name === "hold_credits");
  assert.equal(hold?.args.p_action, "chat_record_overage");
  assert.equal(hold?.args.p_credits, 1);
});

test("步骤 3 · 闲聊无限免费，但要过日上限（验收 24）", async () => {
  const ok = fake({ rpc: { bump_chat_day: true } });
  const r = await withCredits({
    actionCode: "chat_smalltalk",
    userId: "u1",
    idempotencyKey: "k4b",
    client: ok.client,
    run: async () => "hi",
  });
  assert.equal(r.ok === true && r.charged, 0);
  assert.ok(!names(ok.calls).includes("hold_credits"));
  assert.ok(!names(ok.calls).includes("consume_free_chat"), "闲聊不吃记录额度");
});

test("步骤 3 · 撞上日上限 → 拒绝服务，且不扣分（验收 24）", async () => {
  const { client, calls } = fake({ rpc: { bump_chat_day: false } });
  let ran = false;
  const r = await withCredits({
    actionCode: "chat_smalltalk",
    userId: "u1",
    idempotencyKey: "k4c",
    client,
    run: async () => {
      ran = true;
      return "hi";
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "BLOCKED");
  assert.equal(r.ok === false && r.message, DAILY_CAP_MESSAGE);
  assert.equal(ran, false);
  assert.ok(!names(calls).includes("hold_credits"), "防刷不该产生扣分");
  assert.ok(!names(calls).includes("log_free_usage"), "被拦下的轮次没有执行，也就没有成本");
});

test("步骤 3 · 日上限先于免费额度判定，不白吃一次额度", async () => {
  const { client, calls } = fake({ rpc: { bump_chat_day: false } });
  await withCredits({
    actionCode: "chat_record",
    userId: "u1",
    idempotencyKey: "k4d",
    client,
    run: async () => "x",
  });
  assert.deepEqual(names(calls), ["bump_chat_day"]);
});

// ---- 4 重生成窗口 ----

test("步骤 4 · 同指纹 24h 内 → 免费（验收 25）", async () => {
  const { client, calls } = fake({ rpc: { check_regen_free: true } });
  const r = await withCredits({
    actionCode: "resume_baseline",
    userId: "u1",
    idempotencyKey: "k6",
    fingerprint: "abc.v1",
    client,
    run: async () => "resume",
  });
  assert.equal(r.ok === true && r.freeReason, "regen_window");
  assert.ok(!names(calls).includes("hold_credits"));
});

test("步骤 4 · 指纹变了 → 收费（验收 26、27）", async () => {
  const { client, calls } = fake({
    rpc: { check_regen_free: false, hold_credits: HOLD_OK },
  });
  const r = await withCredits({
    actionCode: "resume_baseline",
    userId: "u1",
    idempotencyKey: "k7",
    fingerprint: "zzz.v1",
    client,
    run: async () => "resume",
  });
  assert.equal(r.ok === true && r.charged, ACTION_PRICES.resume_baseline);
  assert.ok(names(calls).includes("settle_hold"));
});

test("步骤 4 · 免费重生成不写指纹标记，收费的才写", async () => {
  const { client, calls } = fake({
    rpc: { check_regen_free: false, hold_credits: HOLD_OK },
  });
  await withCredits({
    actionCode: "resume_baseline",
    userId: "u1",
    idempotencyKey: "k8",
    fingerprint: "zzz.v1",
    client,
    run: async () => "resume",
  });
  assert.ok(names(calls).includes("tag_usage_fingerprint"));
});

// ---- 5 余额不足 ----

test("步骤 5 · 余额不足返回 INSUFFICIENT，带 required 与 available（验收 32）", async () => {
  const { client } = fake({
    balance: 3,
    rpc: {
      hold_credits: { data: null, error: { message: "INSUFFICIENT_CREDITS" } },
    },
  });
  let ran = false;
  const r = await withCredits({
    actionCode: "interview_kit",
    userId: "u1",
    idempotencyKey: "k9",
    client,
    run: async () => {
      ran = true;
      return "kit";
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "INSUFFICIENT");
  assert.equal(r.ok === false && r.required, ACTION_PRICES.interview_kit);
  assert.equal(r.ok === false && r.available, 3);
  assert.equal(ran, false, "余额不足时不该执行动作");
});

// ---- 6/8 正常路径 ----

test("步骤 6–8 · 成功即结算，token 数随结算落库", async () => {
  const { client, calls } = fake({ rpc: { hold_credits: HOLD_OK } });
  const r = await withCredits({
    actionCode: "target_assess",
    userId: "u1",
    idempotencyKey: "k10",
    client,
    run: async (ctx) => {
      ctx.report({ inputTokens: 1200, outputTokens: 800, durationMs: 4200 });
      return "assess";
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.charged, ACTION_PRICES.target_assess);
  assert.equal(r.ok === true && r.balanceAfter, 90);
  const settle = calls.find((c) => c.name === "settle_hold");
  const meta = settle?.args.p_usage_meta as Record<string, unknown>;
  assert.equal(meta.input_tokens, 1200);
  assert.equal(meta.duration_ms, 4200);
  assert.ok(!names(calls).includes("release_hold"));
});

test("异步动作的预扣活 25 分钟，同步的 5 分钟", async () => {
  const a = fake({ rpc: { hold_credits: HOLD_OK } });
  await withCredits({
    actionCode: "interview_kit",
    userId: "u1",
    idempotencyKey: "k11",
    isAsync: true,
    client: a.client,
    run: async () => "kit",
  });
  assert.equal(a.calls.find((c) => c.name === "hold_credits")?.args.p_ttl_min, 25);

  const b = fake({ rpc: { hold_credits: HOLD_OK } });
  await withCredits({
    actionCode: "resume_baseline",
    userId: "u1",
    idempotencyKey: "k12",
    client: b.client,
    run: async () => "r",
  });
  assert.equal(b.calls.find((c) => c.name === "hold_credits")?.args.p_ttl_min, 5);
});

// ---- 7 完整性校验 ----

test("步骤 7 · validate 返回 false → RELEASE，不结算（验收 33）", async () => {
  const { client, calls } = fake({ rpc: { hold_credits: HOLD_OK } });
  const r = await withCredits({
    actionCode: "interview_kit",
    userId: "u1",
    idempotencyKey: "k13",
    client,
    validate: () => false,
    run: async (ctx) => {
      ctx.report({ inputTokens: 9000, outputTokens: 4000 });
      return "半个题包";
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "FAILED");
  const rel = calls.find((c) => c.name === "release_hold");
  assert.equal(rel?.args.p_reason, "incomplete");
  assert.equal(rel?.args.p_release_token, "t-1");
  // 截断那次也烧了 token，要带着一起退
  assert.equal((rel?.args.p_usage_meta as Record<string, unknown>).input_tokens, 9000);
  assert.ok(!names(calls).includes("settle_hold"));
});

// ---- 9 异常 ----

test("步骤 9 · run 抛异常 → RELEASE（验收 34）", async () => {
  const { client, calls } = fake({ rpc: { hold_credits: HOLD_OK } });
  const r = await withCredits({
    actionCode: "resume_delta",
    userId: "u1",
    idempotencyKey: "k14",
    client,
    run: async () => {
      throw new Error("上游超时");
    },
  });
  assert.equal(r.ok === false && r.code, "FAILED");
  assert.equal(calls.find((c) => c.name === "release_hold")?.args.p_reason, "failed");
  assert.ok(!names(calls).includes("settle_hold"));
});

test("步骤 9 · 用户取消算 CANCELLED，不算失败", async () => {
  const { client, calls } = fake({ rpc: { hold_credits: HOLD_OK } });
  const r = await withCredits({
    actionCode: "resume_delta",
    userId: "u1",
    idempotencyKey: "k15",
    client,
    run: async () => {
      throw new CancelledError();
    },
  });
  assert.equal(r.ok === false && r.code, "CANCELLED");
  assert.equal(calls.find((c) => c.name === "release_hold")?.args.p_reason, "cancelled");
});

test("免费动作失败也留痕", async () => {
  const { client, calls } = fake();
  const r = await withCredits({
    actionCode: "health_check_fast",
    userId: "u1",
    idempotencyKey: "k16",
    client,
    run: async () => {
      throw new Error("炸了");
    },
  });
  assert.equal(r.ok === false && r.code, "FAILED");
  assert.equal(calls[0].name, "log_free_usage");
  assert.equal(calls[0].args.p_succeeded, false);
});
