// =============================================================
// C11..C15 的单测
//
// 阻断级只有一条（C11），所以它的边界要钉死：**只有在档案里一条学历都
// 没有、而简历里确实印着教育段落时才拦**。多拦一次，用户就得为一个不
// 存在的问题去改档案；少拦一次，一份没有出处的学历就投出去了。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  c11ResumeEducation,
  c12ProfileMissing,
  c13EmploymentGap,
  c14OrgMismatch,
  c15DisplayName,
} from "./c11-c15-profile";
import type { HealthContext, HealthProfile, HealthResume } from "./types";

const emptyProfile: HealthProfile = {
  educations: [],
  employments: [],
  displayName: null,
  missingFactLabels: [],
};

function ctx(over: Partial<HealthContext> = {}): HealthContext {
  return {
    facts: [],
    profile: emptyProfile,
    atoms: [],
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

const resume = (md: string): HealthResume => ({
  kind: "baseline",
  id: "b1",
  targetId: "t1",
  targetName: "C 端 AI 应用",
  label: "C 端 AI 应用 · 基线",
  renderedMd: md,
  blocks: [],
});

const WITH_EDU = "# 张昭\n\n## 工作经历\n\n## 教育背景\n- 某大学\n";
const NO_EDU = "# 张昭\n\n## 工作经历\n\n## 技能\nRAG\n";

test("C11 · 简历有教育段落但档案里没学历 → 阻断", async () => {
  const r = await c11ResumeEducation.run(ctx({ resumes: [resume(WITH_EDU)] }));
  assert.equal(r.length, 1);
  assert.equal(r[0].level, "blocking");
});

test("C11 · 档案里有学历就不拦，哪怕简历里也有教育段落", async () => {
  const r = await c11ResumeEducation.run(
    ctx({
      resumes: [resume(WITH_EDU)],
      profile: { ...emptyProfile, educations: [{ id: "e1", school: "大工", degree: "bachelor" }] },
    }),
  );
  assert.equal(r.length, 0);
});

test("C11 · 简历里没有教育段落就不拦 —— 没学历本身不是错", async () => {
  const r = await c11ResumeEducation.run(ctx({ resumes: [resume(NO_EDU)] }));
  assert.equal(r.length, 0);
});

test("C12 · 缺项报一条，不是每缺一项报一条", async () => {
  const r = await c12ProfileMissing.run(
    ctx({ profile: { ...emptyProfile, missingFactLabels: ["姓名", "手机", "邮箱"] } }),
  );
  assert.equal(r.length, 1);
  assert.match(r[0].title, /还差 3 项/);
  // 指纹不带具体项：每补一项就换一条新问题的话，忽略记录会跟着失效
  assert.equal(r[0].fingerprint, "C12:missing");
});

test("C12 · 填全了就一条都不报", async () => {
  assert.equal((await c12ProfileMissing.run(ctx())).length, 0);
});

const emp = (id: string, org: string, s: string, e: string | null) => ({
  id,
  org,
  periodStart: s,
  periodEnd: e,
  needsReview: false,
});

test("C13 · 超过半年的空档报出来", async () => {
  const r = await c13EmploymentGap.run(
    ctx({
      profile: {
        ...emptyProfile,
        employments: [
          emp("m1", "趣店", "2021-06-01", "2022-02-01"),
          emp("m2", "润泽园", "2023-04-01", null),
        ],
      },
    }),
  );
  assert.equal(r.length, 1);
  assert.match(r[0].title, /14 个月空档/);
});

test("C13 · 三个月的空档不报 —— 换工作歇一阵太常见了", async () => {
  const r = await c13EmploymentGap.run(
    ctx({
      profile: {
        ...emptyProfile,
        employments: [
          emp("m1", "趣店", "2021-06-01", "2023-02-01"),
          emp("m2", "润泽园", "2023-05-01", null),
        ],
      },
    }),
  );
  assert.equal(r.length, 0);
});

test("C13 · 上一段还没结束不算空档，那是兼着两份", async () => {
  const r = await c13EmploymentGap.run(
    ctx({
      profile: {
        ...emptyProfile,
        employments: [
          emp("m1", "某公司", "2019-01-01", null),
          emp("m2", "润泽园", "2023-04-01", null),
        ],
      },
    }),
  );
  assert.equal(r.length, 0);
});

const atom = (id: string, org: string | null) => ({
  id,
  title: `经历 ${id}`,
  org,
  role: null,
  status: "shipped",
  evidenceLevel: "measured" as const,
  situation: null,
  task: null,
  actions: [],
  periodStart: null,
  periodEnd: null,
  metrics: [],
  updatedAt: "2026-08-01T00:00:00Z",
  sourceDocIds: [],
});

test("C14 · 经历里的公司在履历表里完全找不到 → 报", async () => {
  const r = await c14OrgMismatch.run(
    ctx({
      atoms: [atom("a1", "亿阁科技")],
      profile: { ...emptyProfile, employments: [emp("m1", "润泽园教育科技", "2023-04-01", null)] },
    }),
  );
  assert.equal(r.length, 1);
  assert.match(r[0].title, /亿阁科技/);
});

test("C14 · 简称与全称不报 —— 那多半是同一家", async () => {
  const r = await c14OrgMismatch.run(
    ctx({
      atoms: [atom("a1", "润泽园")],
      profile: { ...emptyProfile, employments: [emp("m1", "润泽园教育科技", "2023-04-01", null)] },
    }),
  );
  assert.equal(r.length, 0);
});

test("C14 · 一条履历都没有时不报 —— 那是 C12 的事", async () => {
  const r = await c14OrgMismatch.run(ctx({ atoms: [atom("a1", "亿阁科技")] }));
  assert.equal(r.length, 0);
});

test("C15 · 显示名与档案姓名不同 → 提示，不是警告", async () => {
  const r = await c15DisplayName.run(
    ctx({
      profile: { ...emptyProfile, displayName: "昭昭不睡觉" },
      facts: [
        {
          id: "f1",
          key: "name",
          label: "姓名",
          value: "张昭",
          status: "RESOLVED",
          conflicts: [],
          disclosureRule: null,
        },
      ],
    }),
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].level, "info");
});

test("C15 · 两个名字一样就闭嘴", async () => {
  const r = await c15DisplayName.run(
    ctx({
      profile: { ...emptyProfile, displayName: "张昭" },
      facts: [
        {
          id: "f1",
          key: "name",
          label: "姓名",
          value: "张昭",
          status: "RESOLVED",
          conflicts: [],
          disclosureRule: null,
        },
      ],
    }),
  );
  assert.equal(r.length, 0);
});
