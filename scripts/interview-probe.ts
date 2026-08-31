// =============================================================
// Proofly · 面试题风险判定与防编造探针
//
//   pnpm interview:probe
//
// 覆盖《Step 7》验收 1–4、7–13、15–20、22、24、27–29。
// 不连库、不调模型 —— 风险由代码判、防编造由代码查，那它们就该能
// 脱离模型单独验证。验收 14、21 那种「读一遍有没有编造」留给人工。
// =============================================================

import {
  RISK_REASON,
  hasDataGap,
  isExpanded,
  judgeRisk,
  locateGapMetric,
  methodlessMetrics,
  overstatesProgress,
  type RiskMetric,
} from "../src/lib/interview/risk";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  buildCaseQuestions,
  buildProbeQuestions,
  fabricatedNumbers,
  missingMustSay,
  neverSayHits,
  preferredType,
  quotaFor,
  weakDontDo,
  type PlanAtom,
} from "../src/lib/interview/plan";
import type { PlannedCase, PlannedProbe } from "../src/lib/interview/schema";
import type { AtomStatus, EvidenceLevel } from "../src/types/database";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

// ---- 夹具 ----

function metric(over: Partial<RiskMetric> = {}): RiskMetric {
  return {
    id: over.id ?? "m-1",
    name: over.name ?? "学员次日留存",
    kind: over.kind ?? "outcome",
    evidenceLevel: over.evidenceLevel ?? "measured",
    method: over.method ?? null,
  };
}

function atom(over: Partial<PlanAtom> = {}): PlanAtom {
  return {
    id: over.id ?? "a-1",
    title: over.title ?? "AI 学习助手",
    evidenceLevel: (over.evidenceLevel ?? "measured") as EvidenceLevel,
    status: (over.status ?? "shipped") as AtomStatus,
    metrics: over.metrics ?? [],
    block: over.block ?? { summary: "做了一个 AI 学习助手", bullets: ["设计了意图分类体系"] },
    mustSay: over.mustSay ?? [],
    neverSay: over.neverSay ?? [],
    probes: over.probes ?? [],
    sourceText: over.sourceText ?? "AI 学习助手 设计了 5 类意图分类 学员次日留存 从 38% 到 43%",
  };
}

function probe(over: Partial<PlannedProbe> = {}): PlannedProbe {
  return {
    question: over.question ?? "这个功能的效果怎么证明？",
    probe_type: over.probe_type ?? "effect",
    from_atom_id: over.from_atom_id ?? "a-1",
    from_existing_probe: over.from_existing_probe ?? false,
    answer_outline: over.answer_outline ?? [{ label: "先承认", content: "模块在灰度，没有稳定数据" }],
    dont_do: over.dont_do ?? "不要用「预计提升 30%」这类没依据的数字填空",
    data_gap_hint: over.data_gap_hint ?? "",
  };
}

function caseQ(over: Partial<PlannedCase> = {}): PlannedCase {
  return {
    kind: over.kind ?? "ai_tech",
    question: over.question ?? "RAG 和微调怎么选？",
    difficulty: over.difficulty ?? "standard",
    answer_outline: over.answer_outline ?? [{ label: "先给判据", content: "看知识更新频率" }],
    related_atom_ids: over.related_atom_ids ?? [],
    why_this_question: over.why_this_question ?? "JD 要求有 RAG 落地经验",
  };
}

// ---- 风险判定（验收 1–4） ----

console.log("\n【风险判定】");

const designedExpanded = atom({
  evidenceLevel: "designed_only",
  block: { summary: "设计了 AI 模块", bullets: ["产出 4 份设计文档"] },
});
check(
  "1 · designed_only 且在简历中展开 → 高风险",
  judgeRisk(designedExpanded).level === "high" &&
    judgeRisk(designedExpanded).reason === RISK_REASON.noData,
  JSON.stringify(judgeRisk(designedExpanded)),
);

const noMethod = atom({ metrics: [metric({ method: null })] });
const v2 = judgeRisk(noMethod);
check(
  "2 · measured 但 method 为空 → 高风险，文案是「有数字但没记口径」",
  v2.level === "high" && v2.reason === RISK_REASON.noMethod,
  JSON.stringify(v2),
);
check("2b · 高风险指向那条指标，「去补」能落到具体一行", v2.gapMetric?.id === "m-1");

const withMethod = atom({ metrics: [metric({ method: "同期新注册用户，按注册日分组" })] });
check(
  "3 · 补上 method 之后 → 低风险，没有 risk_reason",
  judgeRisk(withMethod).level === "low" && judgeRisk(withMethod).reason === null,
);

const estimated = atom({ evidenceLevel: "estimated" });
check(
  "4 · estimated → 中风险",
  judgeRisk(estimated).level === "medium" &&
    judgeRisk(estimated).reason === RISK_REASON.estimated,
);

const oneLineThin = atom({
  evidenceLevel: "absent",
  block: { summary: "做了一个内部工具", bullets: [] },
});
check(
  "4b · 没数据但简历上只占一行 → 降到中风险",
  judgeRisk(oneLineThin).level === "medium",
);
check("4c · 有 bullet 才算展开", isExpanded(designedExpanded) && !isExpanded(oneLineThin));

const inDev = atom({
  status: "in_dev",
  evidenceLevel: "measured",
  metrics: [metric({ method: "有口径" })],
  block: { summary: "AI 模块已上线并服务了首批用户", bullets: [] },
});
check(
  "4d · in_dev 却写成已上线 → 中风险",
  judgeRisk(inDev).level === "medium" && judgeRisk(inDev).reason === RISK_REASON.inDevOverstated,
  JSON.stringify(judgeRisk(inDev)),
);

const inDevHedged = atom({
  status: "in_dev",
  evidenceLevel: "measured",
  metrics: [metric({ method: "有口径" })],
  block: { summary: "AI 模块已上线，目前灰度中", bullets: [] },
});
check("4e · 自己写了灰度就不算夸大", !overstatesProgress(inDevHedged));

check(
  "4f · output 指标没口径不算风险（「交付 4 份方案」没有归因问题）",
  methodlessMetrics(atom({ metrics: [metric({ kind: "output", method: null })] })).length === 0,
);

// ---- data_gap_hint（验收 22、24） ----

console.log("\n【缺数据提示】");

check("22 · method 为空 → 存在数据缺口", hasDataGap(noMethod));
check("24 · 补上口径后 → 缺口消失", !hasDataGap(withMethod));
check(
  "22b · 提示点名了哪条指标就落到那条",
  locateGapMetric(
    atom({
      metrics: [
        metric({ id: "m-1", name: "日活" }),
        metric({ id: "m-2", name: "学员次日留存" }),
      ],
    }),
    "去把「学员次日留存」这条指标的口径补上",
  )?.id === "m-2",
);
check(
  "22c · 点不到名就取第一条没口径的",
  locateGapMetric(noMethod, "去补一下数据")?.id === "m-1",
);

// ---- 防编造（验收 15–20） ----

console.log("\n【防编造】");

check(
  "15 · 应答骨架里查不到出处的数字被揪出来",
  fabricatedNumbers([{ label: "再给依据", content: "留存从 38% 提到 51%" }], "留存 38% 到 43%")
    .join(",") === "51",
);
check(
  "15b · 来源里有的数字不报",
  fabricatedNumbers([{ label: "", content: "从 38% 到 43%" }], "留存 38% 到 43%").length === 0,
);

const lying = buildProbeQuestions(
  [probe({ answer_outline: [{ label: "先承认", content: "你可以说你做过一次 AB 实验" }] })],
  [atom()],
);
check("16 · 「你可以说你做了 XX」的题被丢掉", lying.questions.length === 0);
check("16b · 丢掉的原因说清楚了", lying.rejected[0]?.problems.join("").includes("编造"));

const vague = buildProbeQuestions(
  [probe({ answer_outline: [{ label: "再给依据", content: "可以说效果不错，用户反馈积极" }] })],
  [atom()],
);
check("17 · 「可以说效果不错」的题被丢掉", vague.questions.length === 0);

check(
  "18 · never_say 含「创业」→「连续创业经历」被识别",
  neverSayHits("我有连续创业经历", ["创业"]).join(",") === "创业",
);
const guarded = buildProbeQuestions(
  [probe({ answer_outline: [{ label: "先承认", content: "结合我的连续创业经历" }] })],
  [atom({ neverSay: ["创业"] })],
);
check("18b · 踩到 never_say 的题被丢掉", guarded.questions.length === 0);

check(
  "19 · must_say 没进应答骨架 → 报出来",
  missingMustSay([{ label: "", content: "先承认没有数据" }], ["从 0 到 1"]).join(",") === "从 0 到 1",
);
const mustOk = buildProbeQuestions(
  [probe({ answer_outline: [{ label: "先承认", content: "这是从 0 到 1 做起来的" }] })],
  [atom({ mustSay: ["从 0 到 1"] })],
);
check("19b · 体现了 must_say 就不报", mustOk.warnings.filter((w) => w.includes("必说")).length === 0);

check("20 · 「不要夸大」这类空话算不合格", weakDontDo("不要夸大") && weakDontDo(""));
check(
  "20b · 具体到句式的算合格",
  !weakDontDo("不要用「预计提升 30%」这类没依据的数字填空，追问两轮就露馅"),
);
const weakHigh = buildProbeQuestions(
  [probe({ dont_do: "不要夸大" })],
  [atom({ evidenceLevel: "designed_only" })],
);
check(
  "20c · 高风险题的「别做的事」太空泛 → 记 warning",
  weakHigh.warnings.some((w) => w.includes("空泛")),
  weakHigh.warnings.join(" | "),
);

// ---- 配额与来源（验收 7–13） ----

console.log("\n【项目深挖题】");

check(
  "8 · designed_only 的经历配额 3 题",
  quotaFor(atom({ evidenceLevel: "designed_only" })) === 3,
);
check(
  "9 · measured 且有口径的经历配额 1 题",
  quotaFor(atom({ metrics: [metric({ method: "有口径" })] })) === 1,
);
check("9b · measured 但无口径配额 2 题", quotaFor(noMethod) === 2);
check("9c · estimated 配额 2 题", quotaFor(estimated) === 2);

const orphan = buildProbeQuestions([probe({ from_atom_id: "不存在" })], [atom()]);
check("7 · 对不上经历的题被丢掉", orphan.questions.length === 0);
check("7b · 丢掉时说了原因", orphan.warnings.some((w) => w.includes("对不上经历")));

const overQuota = buildProbeQuestions(
  [
    probe({ question: "题一", probe_type: "decision" }),
    probe({ question: "题二", probe_type: "boundary" }),
    probe({ question: "题三", probe_type: "attribution" }),
  ],
  [noMethod],
);
check("9d · 超配额被截到 2 题", overQuota.questions.length === 2, `实际 ${overQuota.questions.length}`);
check(
  "10 · 没口径的经历，归因题优先保住",
  overQuota.questions.some((q) => q.probeType === "attribution"),
  overQuota.questions.map((q) => q.probeType).join(","),
);
check("10b · preferredType 认得没口径这一档", preferredType(noMethod) === "attribution");
check(
  "11 · in_dev 的经历优先保住进度题",
  preferredType(atom({ status: "in_dev", metrics: [metric({ method: "有" })] })) === "progress",
);

const withProbe = buildProbeQuestions(
  [probe({ from_existing_probe: true })],
  [atom({ probes: [{ q: "凭什么说是第二大场景", a_outline: "灰度数据" }] })],
);
check("12 · 人工预案转成的题保留 from_existing_probe", withProbe.questions[0]?.fromExistingProbe === true);
const fakeProbe = buildProbeQuestions([probe({ from_existing_probe: true })], [atom()]);
check(
  "12b · 经历里根本没写预案 → 强制改回 false",
  fakeProbe.questions[0]?.fromExistingProbe === false,
);
const missedProbe = buildProbeQuestions(
  [probe()],
  [atom({ probes: [{ q: "凭什么", a_outline: "灰度数据" }] })],
);
check(
  "12c · 有预案却没被用上 → 记 warning",
  missedProbe.warnings.some((w) => w.includes("追问预案")),
);

// 六条经历各 3 题 = 18 题，落在 15–20 之间。
const many = Array.from({ length: 6 }, (_, i) =>
  atom({ id: `a-${i}`, title: `经历 ${i}`, evidenceLevel: "designed_only" }),
);
const manyPlanned = many.flatMap((a) =>
  [0, 1, 2].map((k) => probe({ question: `${a.title} 的第 ${k} 问`, from_atom_id: a.id })),
);
const built = buildProbeQuestions(manyPlanned, many);
check(
  "13 · 题目总数落在 15–20 之间",
  built.questions.length >= MIN_QUESTIONS && built.questions.length <= MAX_QUESTIONS,
  `实际 ${built.questions.length}`,
);
const tooMany = buildProbeQuestions(
  many.flatMap((a) =>
    Array.from({ length: 8 }, (_, k) =>
      probe({ question: `${a.title} 的第 ${k} 问`, from_atom_id: a.id }),
    ),
  ),
  many,
);
check(
  "13b · 模型给 48 题也只留配额内的 18 题",
  tooMany.questions.length === 18 && tooMany.questions.length <= MAX_QUESTIONS,
  `实际 ${tooMany.questions.length}`,
);

const dup = buildProbeQuestions([probe({ question: "效果怎么证明？" }), probe({ question: "效果怎么证明" })], [atom()]);
check("13c · 重复题干只留一道", dup.questions.length === 1);

check(
  "7c · from_atom_id 全部来自给定经历",
  built.questions.every((q) => many.some((a) => a.id === q.fromAtomId)),
);

// ---- 案例题（验收 27–29） ----

console.log("\n【案例题】");

const cases = buildCaseQuestions(
  [
    caseQ({ related_atom_ids: ["a-1", "不存在的经历"] }),
    caseQ({ kind: "product_case", question: "给学习场景设计一个 AI 功能，怎么做？" }),
    caseQ({ kind: "data_case", question: "留存掉了 20%，怎么归因？", difficulty: "deep" }),
  ],
  [atom()],
  10,
);
check("27 · 引用不存在的经历被剔除", cases.questions[0]?.relatedAtomIds.join(",") === "a-1");
check("27b · 剔除时记 warning", cases.warnings.some((w) => w.includes("剔除")));
check("29 · 案例题风险一律 low", cases.questions.every((q) => q.riskLevel === "low"));
check("29b · 案例题不带 risk_reason", cases.questions.every((q) => q.riskReason === null));
check("28 · difficulty 归一到三档", cases.questions.map((q) => q.difficulty).join(",") === "standard,standard,deep");
check("28b · 认不出来的难度落进 standard", buildCaseQuestions([caseQ({ difficulty: "很难" })], [atom()], 0).questions[0]?.difficulty === "standard");
check(
  "29c · 类别认不出来的题被丢掉",
  buildCaseQuestions([caseQ({ kind: "project_probe" })], [atom()], 0).questions.length === 0,
);
check("29d · sortOrder 从给定起点接着排", cases.questions.map((q) => q.sortOrder).join(",") === "10,11,12");
const caseLie = buildCaseQuestions(
  [caseQ({ answer_outline: [{ label: "", content: "可以说效果不错" }] })],
  [atom()],
  0,
);
check("17b · 案例题的模糊化建议同样被丢掉", caseLie.questions.length === 0);
const caseGuard = buildCaseQuestions(
  [caseQ({ answer_outline: [{ label: "", content: "拿我的创业经历举例" }] })],
  [atom({ neverSay: ["创业"] })],
  0,
);
check("18c · 案例题也守 never_say", caseGuard.questions.length === 0);

console.log(`\n${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
