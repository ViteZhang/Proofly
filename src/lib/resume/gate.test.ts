// =============================================================
// Proofly · 门禁单测
//
//   pnpm gate:test
//
// 覆盖《Step 6 施工提示词 v1.0》6.1 的单测表全部九行，外加边界。
// 最要紧的一条区分：交付物计数放行、效果数字拦截。这两类都是
// 「designed_only 的块里出现了数字」，判反了就要么放幻觉过去，
// 要么把一句完全诚实的话拦下来。
// =============================================================

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkBlock,
  checkResume,
  hasBlocking,
  violatesTemplate,
  type GateAtom,
  type GateBlock,
} from "./gate";
import type { EvidenceLevel } from "@/types/database";

// ---- 夹具 ----

function atom(over: Partial<GateAtom> = {}): GateAtom {
  return {
    id: "a1",
    title: "知识宇宙 · AI-native 学习 App",
    evidenceLevel: "designed_only",
    org: null,
    role: "产品负责人",
    situation: null,
    task: null,
    actions: [
      "设计三层记忆系统，制定记忆注入的 Token 预算方案",
      "产出 4 份设计文档，含 20+ 条意图分类测试用例",
      "设计了 5 类意图分类体系，响应延迟目标 300ms",
    ],
    metrics: [
      { name: "设计文档", kind: "output", fromValue: null, toValue: "4 份", delta: null, method: null, evidenceLevel: "measured" },
      { name: "优质作业筛选人效", kind: "outcome", fromValue: null, toValue: null, delta: "+75%", method: "对照组", evidenceLevel: "measured" },
    ],
    pendingMetricNames: [],
    periodStart: "2022-02-01",
    periodEnd: null,
    mustSay: [],
    neverSay: [],
    roleFraming: null,
    ...over,
  };
}

function block(text: string, template: EvidenceLevel, over: Partial<GateBlock> = {}): GateBlock {
  return {
    id: "b1",
    atomId: "a1",
    section: "个人项目",
    title: "知识宇宙",
    meta: "",
    summary: "",
    bullets: [text],
    templateUsed: template,
    ...over,
  };
}

/** 只看 G1，避免 G3（数字出处）干扰措辞模板的判定。 */
function g1(text: string, template: EvidenceLevel): boolean {
  return violatesTemplate(text, template) !== null;
}

// ---- 6.1 单测表九行 ----

test("G1｜「人效提升 75%」measured → 通过", () => {
  assert.equal(g1("优质作业筛选人效提升 75%", "measured"), false);
});

test("G1｜「人效提升 75%」designed_only → 拦截", () => {
  assert.equal(g1("优质作业筛选人效提升 75%", "designed_only"), true);
});

test("G1｜「产出 4 份设计文档」designed_only → 通过（交付物计数）", () => {
  assert.equal(g1("产出 4 份设计文档", "designed_only"), false);
});

test("G1｜「含 20+ 条意图分类测试用例」designed_only → 通过", () => {
  assert.equal(g1("含 20+ 条意图分类测试用例", "designed_only"), false);
});

test("G1｜「响应延迟缩短 300ms」designed_only → 拦截", () => {
  // 2.2 原文那条正则的单位表里没有 ms，会漏掉这一行。实际判定用的是加宽版。
  assert.equal(g1("响应延迟缩短 300ms", "designed_only"), true);
});

test("G1｜「设计了 5 类意图分类体系」designed_only → 通过", () => {
  assert.equal(g1("设计了 5 类意图分类体系", "designed_only"), false);
});

test("G1｜「翻了 3 倍」absent → 拦截", () => {
  assert.equal(g1("日活翻了 3 倍", "absent"), true);
});

test("G2｜never_say 含「创业」，文中出现「创业公司」→ 拦截（包含匹配）", () => {
  const r = checkBlock(
    block("在创业公司完成产品定义", "designed_only"),
    atom({ neverSay: ["创业"] }),
  );
  assert.ok(r.some((x) => x.code === "G2" && x.level === "blocking"));
});

test("G3｜数字 92% 不在来源经历中 → 拦截", () => {
  const r = checkBlock(block("意图分类准确率达到 92%", "measured"), atom());
  assert.ok(r.some((x) => x.code === "G3" && x.level === "blocking"));
});

// ---- 边界 ----

test("G1｜绕开动词的百分比同样拦下：designed_only 里写「留存 5%」", () => {
  assert.equal(g1("次日留存 5%", "designed_only"), true);
});

test("G1｜「翻了三倍」写成汉字也拦得住", () => {
  assert.equal(g1("规模翻了三倍", "absent"), true);
});

test("G1｜estimated 允许「约三成」，禁止「约 5.2%」", () => {
  assert.equal(g1("客服人工工作量内部测算下降约三成", "estimated"), false);
  assert.equal(g1("学员次日留存提升约 5.2%", "estimated"), true);
});

test("G1｜estimated 写整数百分比但不带限定词 → warning，不阻断", () => {
  const r = checkBlock(block("学员次日留存提升 5%", "estimated"), atom({ evidenceLevel: "estimated" }));
  const g1w = r.filter((x) => x.code === "G1");
  assert.equal(g1w.length, 1);
  assert.equal(g1w[0].level, "warning");
});

test("G3｜来源里有的数字放行：「产出 4 份设计文档」", () => {
  const r = checkBlock(block("产出 4 份设计文档", "designed_only"), atom());
  assert.equal(hasBlocking(r), false);
});

test("G3｜5.0 与 5 视为同一个数字", () => {
  const r = checkBlock(
    block("设计了 5 类意图分类体系", "designed_only"),
    atom({ actions: ["设计了 5.0 类意图分类体系"] }),
  );
  assert.ok(!r.some((x) => x.code === "G3"));
});

test("G3｜块没有来源经历 → 拦截", () => {
  const r = checkBlock(block("随便写点什么", "absent", { atomId: null }), null);
  assert.ok(r.some((x) => x.code === "G3" && x.level === "blocking"));
});

test("G1｜模板与来源证明度不一致 → warning", () => {
  const r = checkBlock(
    block("设计三层记忆系统", "measured"),
    atom({ evidenceLevel: "designed_only" }),
  );
  assert.ok(r.some((x) => x.code === "G1" && x.level === "warning"));
});

test("G2｜must_say 没体现 → warning，不阻断", () => {
  const r = checkBlock(
    block("设计三层记忆系统", "designed_only"),
    atom({ mustSay: ["Token 预算"] }),
  );
  const g2 = r.filter((x) => x.code === "G2");
  assert.equal(g2.length, 1);
  assert.equal(g2[0].level, "warning");
});

// ---- checkResume ----

test("G4｜profile_facts 有 BLOCKING → 拦截", () => {
  const r = checkResume([], [{ key: "在职状态", value: null, status: "BLOCKING" }], []);
  assert.ok(r.some((x) => x.code === "G4" && x.level === "blocking"));
});

test("G5｜技能栏里混进 evidence_strength = none 的标签 → 拦截", () => {
  const r = checkResume([], [], [{ label: "RAG", strength: "none" }]);
  assert.ok(r.some((x) => x.code === "G5" && x.level === "blocking"));
});

test("G6｜同一互斥组有两条经历同时出现 → 拦截", () => {
  const blocks = [
    block("x", "absent", { id: "b1", atomId: "a1" }),
    block("y", "absent", { id: "b2", atomId: "a2" }),
  ];
  const r = checkResume(blocks, [], [], [
    { atomId: "a1", atomTitle: "知识宇宙", exclusiveGroup: "AI 学习产品" },
    { atomId: "a2", atomTitle: "AI 成长陪伴", exclusiveGroup: "AI 学习产品" },
  ]);
  assert.ok(r.some((x) => x.code === "G6" && x.level === "blocking"));
});

test("G6｜同一条经历被切成两个块，不算撞车", () => {
  const blocks = [
    block("x", "absent", { id: "b1", atomId: "a1" }),
    block("y", "absent", { id: "b2", atomId: "a1" }),
  ];
  const r = checkResume(blocks, [], [], [
    { atomId: "a1", atomTitle: "知识宇宙", exclusiveGroup: "AI 学习产品" },
  ]);
  assert.ok(!r.some((x) => x.code === "G6"));
});

test("G6｜互斥组里的另一条没进这份简历 → 不撞车", () => {
  const blocks = [block("x", "absent", { id: "b1", atomId: "a1" })];
  const r = checkResume(blocks, [], [], [
    { atomId: "a1", atomTitle: "知识宇宙", exclusiveGroup: "AI 学习产品" },
    { atomId: "a2", atomTitle: "AI 成长陪伴", exclusiveGroup: "AI 学习产品" },
  ]);
  assert.ok(!r.some((x) => x.code === "G6"));
});
