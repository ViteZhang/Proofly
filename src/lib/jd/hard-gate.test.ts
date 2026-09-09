// =============================================================
// 硬门槛判定的单测
//
// 这一组盯的是一件事：**「不知道」不许被当成「没有」**。
// 原来的行为就是把档案里没有学历当成「找不到证据」，于是造出一条假缺口
// 和一条永远关不掉的任务。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { checkCredential, checkDegree, requiredDegree, type GateEvidence } from "./hard-gate";
import { classifyRequirement, isHardGate } from "./mapping";

const empty: GateEvidence = { degrees: [], credentials: [] };

const withDegree = (d: GateEvidence["degrees"][number]["degree"]): GateEvidence => ({
  degrees: [{ degree: d, evidenceLevel: "measured", school: "大连理工大学" }],
  credentials: [],
});

test("归类 · 学历类要求认得出来", () => {
  assert.equal(classifyRequirement("本科及以上，计算机或相关专业"), "education");
  assert.equal(classifyRequirement("硕士学历"), "education");
  assert.equal(classifyRequirement("统招全日制"), "education");
});

test("归类 · 证书、年限、常驻地各归各的", () => {
  assert.equal(classifyRequirement("持有 PMP 证书"), "credential");
  assert.equal(classifyRequirement("英语 CET-6 以上"), "credential");
  assert.equal(classifyRequirement("5 年以上产品经验"), "employment");
  assert.equal(classifyRequirement("常驻北京"), "profile_fact");
});

test("归类 · 判不准的一律当技能，走原来那条路", () => {
  assert.equal(classifyRequirement("熟练使用 RAG 做企业知识库"), "skill");
  assert.equal(classifyRequirement("对 DAU、留存负责"), "skill");
});

test("只有 hard 的学历 / 证书才走硬门槛", () => {
  assert.equal(isHardGate("hard", "education"), true);
  assert.equal(isHardGate("hard", "credential"), true);
  // 模型反推出来的隐含要求不该拿来判人不合格
  assert.equal(isHardGate("implicit", "education"), false);
  // 加分项本来就不是门槛
  assert.equal(isHardGate("nice_to_have", "education"), false);
  // 年限可以由经历侧支撑，判成硬门槛会误伤活儿多但工龄短的人
  assert.equal(isHardGate("hard", "employment"), false);
});

test("要求的最低学历认得出来，认不出的返回 null", () => {
  assert.equal(requiredDegree("本科及以上"), "bachelor");
  assert.equal(requiredDegree("硕士及以上学历"), "master");
  assert.equal(requiredDegree("研究生"), "master");
  assert.equal(requiredDegree("计算机相关专业"), null);
});

test("学历满足 · 本科要求 vs 本科学历", () => {
  const r = checkDegree("本科及以上，计算机相关专业", withDegree("bachelor"));
  assert.equal(r.verdict, "met");
});

test("学历满足 · 更高的学历当然满足更低的要求", () => {
  assert.equal(checkDegree("本科及以上", withDegree("master")).verdict, "met");
  assert.equal(checkDegree("大专以上", withDegree("doctor")).verdict, "met");
});

test("学历不满足 · 要硕士只有本科", () => {
  const r = checkDegree("硕士及以上", withDegree("bachelor"));
  assert.equal(r.verdict, "unmet");
  assert.equal(r.need, "master");
  assert.equal(r.have, "bachelor");
});

test("**没填学历 → unknown，不是 unmet**", () => {
  // 这一条就是整批改动的理由。判成 unmet 会产出一条假的硬门槛，
  // 判成缺口会产出一条永远关不掉的任务。都不对，答案是「还不知道」。
  const r = checkDegree("本科及以上", empty);
  assert.equal(r.verdict, "unknown");
});

test("要求里没写具体档位 → unknown，不猜", () => {
  assert.equal(checkDegree("计算机相关专业", withDegree("bachelor")).verdict, "unknown");
});

test("不可查的学历照样算满足 —— 真伪不是这个产品该替人判的", () => {
  const e: GateEvidence = {
    degrees: [{ degree: "bachelor", evidenceLevel: "absent", school: "某某学院" }],
    credentials: [],
  };
  assert.equal(checkDegree("本科及以上", e).verdict, "met");
});

test("证书 · 名字或等级对上就算满足", () => {
  const e: GateEvidence = {
    degrees: [],
    credentials: [{ name: "PMP", level: null, evidenceLevel: "measured" }],
  };
  assert.equal(checkCredential("持有 pmp 证书", e).verdict, "met");
});

test("证书 · 点名要一张具体的证而手上没有 → 不满足", () => {
  const e: GateEvidence = {
    degrees: [],
    credentials: [{ name: "CET-6", level: null, evidenceLevel: "measured" }],
  };
  assert.equal(checkCredential("必须持有 PMP 证书", e).verdict, "unmet");
});

test("证书 · 「有相关证书者优先」判不出是哪张 → unknown，不冤枉人", () => {
  const e: GateEvidence = {
    degrees: [],
    credentials: [{ name: "CET-6", level: null, evidenceLevel: "measured" }],
  };
  assert.equal(checkCredential("有相关行业背景者优先", e).verdict, "unknown");
});

test("证书 · 一条证书都没填 → unknown", () => {
  assert.equal(checkCredential("必须持有 PMP 证书", empty).verdict, "unknown");
});
