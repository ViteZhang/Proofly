// =============================================================
// Proofly · 简历版面 · P0-1 / P0-2
//
//   node --test src/lib/resume/layout.test.ts
//
// 两件事在这里定死：公司名不许印两遍，同一段任职不许拆成几份工作。
// 两条都是「读的人一眼能看出来错了」的那种问题，所以判定必须能脱库单测。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  employmentHeading,
  itemHeading,
  layoutFlat,
  layoutResume,
  metaRedundant,
  stripOrgPrefix,
  titleWorthPrinting,
  type LayoutBlock,
  type LayoutEmployment,
} from "./layout";

const RUN: LayoutEmployment = {
  id: "e1",
  org: "润泽园教育集团",
  role: "产品专家",
  period: "2022.02 – 至今",
};
const XHX: LayoutEmployment = {
  id: "e2",
  org: "信华信技术股份有限公司",
  role: "Java研发工程师",
  period: "2015.06 – 2016.06",
};

function block(p: Partial<LayoutBlock> & { title: string }): LayoutBlock {
  return {
    section: "工作经历",
    meta: "",
    summary: "",
    bullets: [],
    employment: null,
    org: null,
    ...p,
  };
}

// ---- P0-1 公司名去重 ----

test("剥离 · 标题以公司名开头，连分隔符一起去掉", () => {
  assert.equal(
    stripOrgPrefix("润泽园教育集团 · AI成长陪伴助手模块", "润泽园教育集团"),
    "AI成长陪伴助手模块",
  );
});

test("剥离 · 标题恰好等于公司名，剥成空串", () => {
  assert.equal(stripOrgPrefix("润泽园教育集团", "润泽园教育集团"), "");
});

test("剥离 · 标题等于「公司 · 职位」，剩下职位（值不值得印由上层判）", () => {
  assert.equal(
    stripOrgPrefix("信华信技术股份有限公司 · Java研发工程师", "信华信技术股份有限公司"),
    "Java研发工程师",
  );
});

test("剥离 · 简称也认，三个字以上的共同前缀就算", () => {
  assert.equal(
    stripOrgPrefix("信华信 · Java研发工程师", "信华信技术股份有限公司"),
    "Java研发工程师",
  );
});

test("剥离 · 共同前缀不到三个字不动手，免得把标题切碎", () => {
  assert.equal(stripOrgPrefix("知识宇宙", "知识产权服务有限公司"), "知识宇宙");
});

test("剥离 · 前缀后面没有分隔符就整条放过", () => {
  // 「润泽园教育」被「润泽园」切一刀会剩下「教育」，那不是标题，是碎片。
  assert.equal(stripOrgPrefix("润泽园教育中台", "润泽园"), "润泽园教育中台");
});

test("剥离 · 公司名在标题中间，保守放过", () => {
  assert.equal(
    stripOrgPrefix("为润泽园设计的成长体系", "润泽园"),
    "为润泽园设计的成长体系",
  );
});

test("剥离 · 个人项目没有 org，什么都不做", () => {
  assert.equal(stripOrgPrefix("知识宇宙 · AI-native 学习 App", null), "知识宇宙 · AI-native 学习 App");
});

test("剥离 · 半角与全角分隔符都收", () => {
  assert.equal(stripOrgPrefix("趣店集团｜测评系统", "趣店集团"), "测评系统");
  assert.equal(stripOrgPrefix("趣店集团-测评系统", "趣店集团"), "测评系统");
});

test("标题值不值得单独印 · 剥完只剩职位就不印", () => {
  assert.equal(titleWorthPrinting("Java研发工程师", "Java研发工程师"), false);
  assert.equal(titleWorthPrinting("", "产品专家"), false);
  assert.equal(titleWorthPrinting("AI成长陪伴助手模块", "产品专家"), true);
});

// ---- P0-2 按任职分组 ----

test("分组 · 同一段任职的三个块收拢成一个雇主标题", () => {
  const groups = layoutResume([
    block({ title: "润泽园教育集团 · AI助手", employment: RUN, org: RUN.org }),
    block({ title: "润泽园教育集团 · APP战略升级", employment: RUN, org: RUN.org }),
    block({ title: "润泽园教育集团 · 业务中台", employment: RUN, org: RUN.org }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].employment?.id, "e1");
  assert.deepEqual(
    groups[0].items.map((i) => i.title),
    ["AI助手", "APP战略升级", "业务中台"],
  );
});

test("分组 · 同一家公司两段任职是两个标题", () => {
  const again: LayoutEmployment = { ...RUN, id: "e9", period: "2018.01 – 2019.12" };
  const groups = layoutResume([
    block({ title: "A", employment: RUN, org: RUN.org }),
    block({ title: "B", employment: again, org: again.org }),
  ]);
  assert.equal(groups.length, 2);
});

test("分组 · 一个雇主下只有一个项目时，项目标题并进雇主行", () => {
  const groups = layoutResume([
    block({
      title: "信华信技术股份有限公司 · Java研发工程师",
      employment: XHX,
      org: XHX.org,
    }),
  ]);
  assert.equal(groups[0].items[0].title, "");
  assert.equal(
    employmentHeading(groups[0].employment!),
    "信华信技术股份有限公司 ｜ Java研发工程师 ｜ 2015.06 – 2016.06",
  );
});

test("分组 · 一个雇主下只有一个项目但标题另有信息，仍然印出来", () => {
  const groups = layoutResume([
    block({ title: "润泽园教育集团 · AI助手", employment: RUN, org: RUN.org }),
  ]);
  assert.equal(groups[0].items[0].title, "AI助手");
});

test("分组 · 没挂任职的块各自独立，不会互相合并", () => {
  const groups = layoutResume([
    block({ section: "个人项目", title: "知识宇宙" }),
    block({ section: "个人项目", title: "Proofly" }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].employment, null);
});

test("分组 · 全都没有任职时行为与从前一致", () => {
  const groups = layoutResume([
    block({ title: "A" }),
    block({ title: "B" }),
    block({ section: "个人项目", title: "C" }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((g) => g.section), ["工作经历", "工作经历", "个人项目"]);
});

test("分组 · 任职被删（employment 为 null）时降级成独立块，不崩", () => {
  const groups = layoutResume([
    block({ title: "润泽园教育集团 · AI助手", employment: null, org: "润泽园教育集团" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].employment, null);
  // 没有雇主行可挂，公司名照旧剥掉 —— org 还在，重复仍然是重复。
  assert.equal(groups[0].items[0].title, "AI助手");
});

test("分组 · section 之间按第一次出现的先后，不重排", () => {
  const flat = layoutFlat([
    block({ section: "工作经历", title: "A", employment: RUN, org: RUN.org }),
    block({ section: "个人项目", title: "B" }),
    block({ section: "工作经历", title: "C", employment: RUN, org: RUN.org }),
  ]);
  assert.deepEqual(flat.map((f) => f.section), ["工作经历", "工作经历", "个人项目"]);
  // 挂了履历的块，时间在雇主行上，块自己不再重复印一遍。
  assert.deepEqual(flat.map((f) => f.meta), ["", "", ""]);
  // 雇主标题只在这一组的第一块前面印一次。
  assert.deepEqual(flat.map((f) => f.employmentHead !== null), [true, false, false]);
  assert.deepEqual(flat.map((f) => f.newSection), [true, false, true]);
});

test("分组 · 一个雇主下五个项目，标题只印一次", () => {
  const flat = layoutFlat(
    ["A", "B", "C", "D", "E"].map((t) =>
      block({ title: t, employment: RUN, org: RUN.org }),
    ),
  );
  assert.equal(flat.filter((f) => f.employmentHead !== null).length, 1);
  assert.equal(flat.length, 5);
});

test("分组 · 空输入返回空", () => {
  assert.deepEqual(layoutResume([]), []);
  assert.deepEqual(layoutFlat([]), []);
});

// ---- meta 的去冗余 ----

test("meta · 存量块里那行「公司 · 职位　起止」不再重复印", () => {
  assert.equal(metaRedundant("润泽园教育集团 · 产品专家　2022.02 – 至今", RUN), true);
});

test("meta · 与雇主行的起止完全相同也算重复", () => {
  assert.equal(metaRedundant("2022.02 – 至今", RUN), true);
});

test("meta · 项目自己的时间不算重复，照常印在括号里", () => {
  assert.equal(metaRedundant("2026.03 – 2026.09", RUN), false);
  assert.equal(
    itemHeading(
      { source: block({ title: "x" }), title: "AI助手", meta: "2026.03 – 2026.09", summary: "", bullets: [] },
      RUN,
    ),
    "AI助手（2026.03 – 2026.09）",
  );
});

test("meta · 没挂任职时标题与时间仍然同一行，用全角空格分隔", () => {
  assert.equal(
    itemHeading(
      { source: block({ title: "x" }), title: "知识宇宙", meta: "2026.01 – 至今", summary: "", bullets: [] },
      null,
    ),
    "知识宇宙　2026.01 – 至今",
  );
});

test("雇主标题 · 缺职位时不留空段", () => {
  assert.equal(
    employmentHeading({ id: "x", org: "某公司", role: "", period: "2020.01 – 2021.01" }),
    "某公司 ｜ 2020.01 – 2021.01",
  );
});

test("摊平 · 标题与拼好的那一行分开给，纸面才不会把时间印两遍", () => {
  const flat = layoutFlat([
    block({ section: "个人项目", title: "星图 · AI学习助手", meta: "2026.01 – 至今 · 产品负责人" }),
  ]);
  assert.equal(flat[0].title, "星图 · AI学习助手");
  assert.equal(flat[0].meta, "2026.01 – 至今 · 产品负责人");
  assert.equal(flat[0].heading, "星图 · AI学习助手　2026.01 – 至今 · 产品负责人");
});

test("摊平 · 挂了履历时块自己的时间照常给出，由渲染方决定印在哪", () => {
  const flat = layoutFlat([
    block({ title: "AI助手", meta: "2026.03 – 2026.09", employment: RUN, org: RUN.org }),
    block({ title: "APP升级", meta: "2026.01 – 2026.06", employment: RUN, org: RUN.org }),
  ]);
  assert.deepEqual(flat.map((f) => f.meta), ["2026.03 – 2026.09", "2026.01 – 2026.06"]);
  assert.equal(flat[0].heading, "AI助手（2026.03 – 2026.09）");
});
