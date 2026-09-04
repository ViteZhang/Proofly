// =============================================================
// Proofly · 生成指纹单测
//
// 对应《商业化 C1》验收 26–28：事实变了要收费，策略变了要收费，
// 只有提示词变了必须免费。
// =============================================================

import assert from "node:assert/strict";
import { test } from "node:test";

import { computeFingerprint, fingerprintCore, sameInput } from "./fingerprint";

const base = {
  factRevision: 10,
  strategyRevision: 3,
  targetId: "t-1",
  promptVersion: "v1",
};

test("同样的输入算出同样的指纹", () => {
  assert.equal(
    computeFingerprint("resume_baseline", base),
    computeFingerprint("resume_baseline", base),
  );
});

test("验收 26 · 事实层变了 → 指纹变（要收费）", () => {
  const a = computeFingerprint("resume_baseline", base);
  const b = computeFingerprint("resume_baseline", { ...base, factRevision: 11 });
  assert.notEqual(fingerprintCore(a), fingerprintCore(b));
  assert.equal(sameInput(a, b), false);
});

test("验收 27 · 策略层变了 → 指纹变（要收费）", () => {
  const a = computeFingerprint("resume_baseline", base);
  const b = computeFingerprint("resume_baseline", { ...base, strategyRevision: 4 });
  assert.equal(sameInput(a, b), false);
});

test("验收 28 · 只有提示词版本变了 → 判为同一个输入（免费）", () => {
  const a = computeFingerprint("resume_baseline", base);
  const b = computeFingerprint("resume_baseline", { ...base, promptVersion: "v2" });
  assert.notEqual(a, b, "指纹整体应当带上提示词版本，便于排查");
  assert.equal(sameInput(a, b), true, "但比对只看 core");
});

test("不同动作不会撞指纹", () => {
  assert.equal(
    sameInput(
      computeFingerprint("resume_baseline", base),
      computeFingerprint("resume_delta", base),
    ),
    false,
  );
});

test("基线不看 JD，投递版本看", () => {
  const withJd = { ...base, jdId: "jd-1", jdRevision: 2 };
  assert.equal(
    sameInput(
      computeFingerprint("resume_baseline", base),
      computeFingerprint("resume_baseline", withJd),
    ),
    true,
    "基线跟 JD 无关，换 JD 不该让基线重新收费",
  );
  assert.equal(
    sameInput(
      computeFingerprint("resume_delta", { ...base, jdId: "jd-1", jdRevision: 1 }),
      computeFingerprint("resume_delta", withJd),
    ),
    false,
    "JD 改了，投递版本要重新生成",
  );
});

test("gap 集合顺序不影响指纹", () => {
  const a = computeFingerprint("task_plan", { gapIds: ["g2", "g1"], promptVersion: "v1" });
  const b = computeFingerprint("task_plan", { gapIds: ["g1", "g2"], promptVersion: "v1" });
  assert.equal(a, b);
});

test("没登记的动作不参与重生成窗口", () => {
  assert.equal(computeFingerprint("doc_parse_base", base), "");
  assert.equal(sameInput("", ""), false, "空指纹永远不算命中");
});

test("SQL 侧按 '.' 切第一段，两边口径一致", () => {
  const fp = computeFingerprint("interview_kit", base);
  assert.equal(fp.split(".")[0], fingerprintCore(fp));
  assert.equal(fp.split(".").length, 2);
});
