// =============================================================
// 教育背景 / 证书段落的单测
//
// 盯两件事：
//   1. 「不可查」的证书不许被导出 —— 写在简历上却拿不出编号的证书，
//      面试时是负分。
//   2. 工作段落的时间取自履历表，不取自经历 —— 那正是「导出的日期偏窄」
//      这个 bug 的位置。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { blockMeta, credentialLines, educationLines, employmentMeta } from "./profile-sections";
import { renderMarkdown } from "./markdown";
import type { Credential, Education, Employment } from "@/lib/queries/profile";

const edu: Education = {
  id: "e1",
  school: "大连理工大学",
  major: "软件工程",
  degree: "bachelor",
  isFullTime: true,
  periodStart: "2011-09-01",
  periodEnd: "2015-07-01",
  status: "graduated",
  evidenceLevel: "measured",
  credentialNote: "学信网可查",
  sortOrder: 0,
};

const emp: Employment = {
  id: "m1",
  org: "润泽园教育科技",
  title: "高级产品经理",
  city: "北京",
  employmentType: "fulltime",
  periodStart: "2023-04-01",
  periodEnd: null,
  entityNote: null,
  sortOrder: 0,
  needsReview: false,
  atomCount: 2,
};

const cred = (over: Partial<Credential>): Credential => ({
  id: "c1",
  kind: "certificate",
  name: "PMP",
  issuer: "PMI",
  level: null,
  issuedAt: "2018-06-01",
  expiresAt: null,
  identifier: "PMP-12345",
  url: null,
  evidenceLevel: "measured",
  sortOrder: 0,
  ...over,
});

test("教育背景一行说清学校、专业、层次与时间", () => {
  const [l] = educationLines([edu]);
  assert.equal(l.main, "大连理工大学　软件工程 · 本科");
  assert.equal(l.when, "2011.09 – 2015.07");
});

test("在读的学历右边写「在读」，不写「至今」", () => {
  const [l] = educationLines([{ ...edu, periodEnd: null, status: "in_progress" }]);
  assert.equal(l.when, "2011.09 – 在读");
  assert.match(l.main, /在读/);
});

test("不可查的证书不导出", () => {
  const lines = credentialLines([cred({ evidenceLevel: "absent" })]);
  assert.equal(lines.length, 0);
});

test("可查的证书把编号一起印出去 —— 有编号对面才有得核", () => {
  const [l] = credentialLines([cred({})]);
  assert.match(l.main, /PMP/);
  assert.match(l.main, /编号 PMP-12345/);
});

test("工作段落的公司与起止取自履历表", () => {
  assert.equal(employmentMeta(emp), "润泽园教育科技 · 高级产品经理　2023.04 – 至今");
});

test("在职的履历右边是「至今」，不是空的", () => {
  assert.match(employmentMeta(emp), /至今$/);
});

test("渲染 · 三段的先后是 经历 → 教育背景 → 技能 → 证书", () => {
  const md = renderMarkdown({
    name: "张昭",
    contact: ["a@b.com"],
    headline: "",
    blocks: [
      {
        section: "工作经历",
        title: "AI 助手 0→1",
        meta: employmentMeta(emp),
        summary: "",
        bullets: ["做了一件事"],
      },
    ],
    skills: ["RAG"],
    educations: educationLines([edu]),
    credentials: credentialLines([cred({})]),
  });

  const at = (h: string) => md.indexOf(h);
  assert.ok(at("## 工作经历") < at("## 教育背景"), md);
  assert.ok(at("## 教育背景") < at("## 技能"));
  assert.ok(at("## 技能") < at("## 证书与语言"));
  // 履历的时间必须出现在工作段落的标题行里
  assert.match(md, /### AI 助手 0→1　润泽园教育科技 · 高级产品经理　2023\.04 – 至今/);
});

test("渲染 · 没有学历和证书时不留空标题", () => {
  const md = renderMarkdown({
    name: "张昭",
    contact: [],
    headline: "",
    blocks: [],
    skills: [],
    educations: [],
    credentials: [],
  });
  assert.equal(md.includes("教育背景"), false);
  assert.equal(md.includes("证书与语言"), false);
});

test("块的时间 · 挂了履历就以履历为准，模型写的不算", () => {
  // 这就是「导出的日期偏窄」那个 bug 的位置：模型看到的是这条经历的
  // 2023.05，而人真正的入职时间是 2023.04。
  assert.equal(
    blockMeta("润泽园教育科技 · 高级产品经理　2023.04 – 至今", "2023.05 – 至今", "2023.05 – 至今"),
    "润泽园教育科技 · 高级产品经理　2023.04 – 至今",
  );
});

test("块的时间 · 没挂履历时才用模型写的", () => {
  assert.equal(blockMeta(undefined, "2021.06 – 2023.02", "兜底"), "2021.06 – 2023.02");
});

test("块的时间 · 模型没写就用经历自己的时间兜底", () => {
  assert.equal(blockMeta(undefined, "   ", "2021.06 – 2023.02"), "2021.06 – 2023.02");
});
