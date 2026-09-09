// =============================================================
// 生成前置拦截不能被自己的失败记录锁死
//
// 用户实际撞上的循环：生成基线被门禁拦下 → 结果写进 check_results →
// 体检把它汇总成 C3 阻断项 → 前置拦截看见阻断项，不许生成 → 那些行
// 只有重新生成才会被覆盖 → 回到第一步。一次失败永久关掉这个功能。
//
// 这两组断言分别钉住出口的两半：谁不该参与拦截，以及被拦下时「去解决」
// 该把人送到哪里。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { isGenerationOutput } from "./gate-derived";
import { c3Wording } from "./c2-c5-gate";
import type { GateRow, HealthAtom, HealthContext, HealthResume } from "./types";

// ---- 谁不参与生成前的拦截 ----

test("门禁自己写的结果不参与生成前置拦截", () => {
  assert.equal(isGenerationOutput("gate", "G3"), true);
  assert.equal(isGenerationOutput("gate", null), true);
});

test("体检从门禁汇总出的 C2..C5 同样不参与", () => {
  for (const c of ["C2", "C3", "C4", "C5"]) {
    assert.equal(isGenerationOutput("health", c), true, c);
  }
});

test("输入侧的检查照旧拦住生成", () => {
  // C1 事实冲突、C11 简历学历对不上档案 —— 这些改完就没了，不需要
  // 先生成一次。它们本来就该挡在生成前面。
  for (const c of ["C1", "C6", "C7", "C11", "C13"]) {
    assert.equal(isGenerationOutput("health", c), false, c);
  }
});

// ---- 被拦下时「去解决」送到哪里 ----

const atom: HealthAtom = {
  id: "a-1",
  title: "AI 成长陪伴助手模块",
  org: null,
  role: null,
  status: "active",
  evidenceLevel: "designed_only",
} as HealthAtom;

function ctx(over: Partial<HealthContext> = {}): HealthContext {
  return {
    facts: [],
    profile: { educations: [], employments: [], displayName: null, missingFactLabels: [] },
    atoms: [atom],
    skills: [],
    targets: [],
    resumes: [],
    sourceDocs: [],
    gateRows: [],
    interviewOutlines: [],
    now: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

const row = (blockId: string): GateRow => ({
  id: "r-1",
  code: "G3",
  level: "blocking",
  title: "出现了来源经历里没有的数字：2022.02",
  detail: "查不到",
  owner: "baseline:b-1",
  blockId,
});

const resume = (blocks: HealthResume["blocks"]): HealthResume => ({
  kind: "baseline",
  id: "b-1",
  targetId: "t-1",
  targetName: "C 端 AI 教育",
  label: "C 端 AI 教育 · 基线",
  renderedMd: "",
  blocks,
});

test("生成被拦下、一个块都没写入时，「去解决」送到那条经历", async () => {
  const issues = await c3Wording.run(
    ctx({ gateRows: [row("a-1")], resumes: [resume([])] }),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].resolveLink, "/app/library?atom=a-1");
});

test("生成成功、块确实存在时，「去解决」仍旧送到简历那一块", async () => {
  const issues = await c3Wording.run(
    ctx({
      gateRows: [row("blk-9")],
      resumes: [resume([{ id: "blk-9", atomId: "a-1", renderedText: null }])],
    }),
  );
  assert.equal(issues[0].resolveLink, "/app/resume?target=t-1&block=blk-9");
});

test("blockId 既不是块也不是经历时，不生成指向死路的链接", async () => {
  const issues = await c3Wording.run(
    ctx({ gateRows: [row("gone")], resumes: [resume([])] }),
  );
  assert.equal(issues[0].resolveLink, "/app/resume?target=t-1");
});
