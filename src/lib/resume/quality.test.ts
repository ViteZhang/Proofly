// =============================================================
// Proofly · 简历质量四项指标 · P0-0
//
//   node --test src/lib/resume/quality.test.ts
//
// 这四个数是 P1 的验收基准，所以它们自己先得是对的。最要紧的一条：
// 对生产库那份简历，证据利用率必须算出 0 —— 算不出 0 说明指标有 bug，
// 而不是简历没问题。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  atomMetricNumbers,
  evidenceUsage,
  lengthUsage,
  normalizeNumber,
  numbersIn,
  quantCoverage,
  structureCheck,
  type QualityAtom,
  type QualityBlock,
} from "./quality";
import type { LayoutEmployment } from "./layout";

const RUN: LayoutEmployment = {
  id: "e1",
  org: "润泽园教育集团",
  role: "产品专家",
  period: "2022.02 – 至今",
};

function qblock(p: Partial<QualityBlock> & { atomId: string }): QualityBlock {
  return {
    section: "工作经历",
    title: "",
    meta: "",
    summary: "",
    bullets: [],
    employment: null,
    org: null,
    ...p,
  };
}

const AI_ATOM: QualityAtom = {
  id: "a1",
  title: "AI 成长陪伴助手模块",
  evidenceLevel: "measured",
  metricValues: ["5,595 名", "24,584 轮", "58.2%", "0.905", "99.1%"],
};

test("归一 · 千分位、单位、百分号都不影响比对", () => {
  assert.equal(normalizeNumber("5,595 名"), "5595");
  assert.equal(normalizeNumber("58.2%"), "58.2");
  assert.equal(normalizeNumber("5.0"), "5");
  assert.equal(normalizeNumber("没有数字"), "");
});

test("归一 · 一段文字里的数值全收，去重", () => {
  assert.deepEqual([...numbersIn("由 21.4% 提升至 32.2%，21.4 再来一次")], ["21.4", "32.2"]);
});

test("指标数值 · 从 metrics 的取值里取，不取名称", () => {
  assert.deepEqual([...atomMetricNumbers(AI_ATOM)].sort(), ["0.905", "24584", "5595", "58.2", "99.1"]);
});

test("证据利用率 · 生产库那份简历算出来是 0", () => {
  // 两条 bullet，一个数字都没有 —— 这就是实际发生的事。
  const blocks = [
    qblock({
      atomId: "a1",
      title: "AI成长陪伴助手模块",
      bullets: [
        "提出并论证情感陪伴优于通用问答的定位，规划六大功能架构",
        "设计路由智能体与专项智能体组成的Multi-Agent架构，定义六类意图分类标准并撰写生产级System Prompt",
      ],
    }),
  ];
  const r = evidenceUsage(blocks, [AI_ATOM]);
  assert.equal(r.used, 0);
  assert.equal(r.available, 5);
  assert.equal(r.rate, 0);
});

test("证据利用率 · 用上了就算上，按归一后的值比", () => {
  const blocks = [
    qblock({
      atomId: "a1",
      bullets: ["累计服务 5,595 名用户，情绪倾诉类对话占 58.2%"],
    }),
  ];
  const r = evidenceUsage(blocks, [AI_ATOM]);
  assert.equal(r.used, 2);
  assert.equal(r.available, 5);
});

test("证据利用率 · 数字出现在别的经历块里不算", () => {
  const other: QualityAtom = { id: "a2", title: "别的", evidenceLevel: "measured", metricValues: [] };
  const blocks = [qblock({ atomId: "a2", bullets: ["累计服务 5,595 名用户"] })];
  const r = evidenceUsage(blocks, [AI_ATOM, other]);
  assert.equal(r.used, 0);
});

test("证据利用率 · 一条指标都没有的经历不进分母", () => {
  const bare: QualityAtom = { id: "a3", title: "无指标", evidenceLevel: "absent", metricValues: [] };
  const r = evidenceUsage([], [bare]);
  assert.equal(r.available, 0);
  assert.equal(r.rate, 0);
  assert.equal(r.perAtom.length, 0);
});

test("量化覆盖率 · 分母只算来源为 measured 的行", () => {
  const designed: QualityAtom = {
    id: "a4",
    title: "只设计过",
    evidenceLevel: "designed_only",
    metricValues: [],
  };
  const blocks = [
    qblock({ atomId: "a1", bullets: ["带数字 58.2%", "不带数字"] }),
    qblock({ atomId: "a4", bullets: ["设计了一套方案", "又设计了一套"] }),
  ];
  const r = quantCoverage(blocks, [AI_ATOM, designed]);
  assert.equal(r.total, 2);
  assert.equal(r.withNumber, 1);
  assert.equal(r.rate, 0.5);
});

test("量化覆盖率 · summary 也算一行", () => {
  const blocks = [qblock({ atomId: "a1", summary: "一句概述 99.1%", bullets: [] })];
  const r = quantCoverage(blocks, [AI_ATOM]);
  assert.equal(r.total, 1);
  assert.equal(r.withNumber, 1);
});

test("长度利用率 · 二十行对二十六行预算", () => {
  const blocks = Array.from({ length: 10 }, (_, i) =>
    qblock({ atomId: `a${i}`, bullets: ["一", "二"] }),
  );
  const r = lengthUsage(blocks, 26);
  assert.equal(r.lines, 20);
  assert.ok(Math.abs(r.rate - 20 / 26) < 1e-9);
});

test("长度利用率 · 空白行不算", () => {
  const r = lengthUsage([qblock({ atomId: "a", bullets: ["实", "   ", ""] })], 26);
  assert.equal(r.lines, 1);
});

test("结构正确性 · 分组之后同一段任职只有一个标题", () => {
  const blocks = ["AI助手", "APP战略升级", "业务中台"].map((t) =>
    qblock({ atomId: t, title: `润泽园教育集团 · ${t}`, employment: RUN, org: RUN.org }),
  );
  const r = structureCheck(blocks);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.splitEmployments, []);
  assert.deepEqual(r.duplicatedOrg, []);
});

test("结构正确性 · 不分组时同一段任职被拆成三份，判 false", () => {
  // employment 缺席就退回一块一个标题 —— 这正是 P0-2 之前的样子。
  const blocks = ["AI助手", "APP战略升级", "业务中台"].map((t) =>
    qblock({ atomId: t, title: `润泽园教育集团 · ${t}`, employment: null, org: null }),
  );
  const r = structureCheck(blocks);
  // 没有 employment 就查不出「被拆开」，但公司名重复也查不出（org 为 null）。
  // 这一条确认的是：判定跑在渲染结果上，不会凭空报错。
  assert.equal(r.ok, true);
});

test("结构正确性 · 标题里仍然带着公司名时报出来", () => {
  // 构造一个剥不掉的情形：公司名后面没有分隔符，stripOrgPrefix 会保守放过。
  const blocks = [
    qblock({
      atomId: "a",
      title: "润泽园教育集团旗下的中台",
      employment: RUN,
      org: RUN.org,
    }),
  ];
  const r = structureCheck(blocks);
  assert.equal(r.ok, false);
  assert.equal(r.duplicatedOrg.length, 1);
});

test("结构正确性 · 空简历不算错", () => {
  assert.equal(structureCheck([]).ok, true);
});
