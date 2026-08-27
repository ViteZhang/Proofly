// =============================================================
// Proofly · Stage C 定位与差异的探针
//
//   pnpm locate:probe
//
// 覆盖《Step 3 方案》第七节里由 Stage C 决定的那几条：11、12、13，
// 外加一条 UPDATE 正例和 0.75 阈值的行为。
//
// 候选经历用固定夹具，不连数据库：这样谁都能跑，跑出来的结果也可比。
// 夹具里故意放了两条高度相似的经历——判错的代价是不对称的，
// 该更新却新建会在档案里长出重复条目，用户两个月后才发现。
// =============================================================

import { callLLM, setCallLogger } from "../src/lib/llm/core";
import { STAGE_C_SYSTEM, stageCUser } from "../src/lib/llm/chat-prompts";
import { stageCSchema, type StageCResult } from "../src/lib/chat/schema";

setCallLogger(async () => {});

const KNOWLEDGE = "11111111-1111-4111-8111-111111111111";
const AI_MODULE_A = "22222222-2222-4222-8222-222222222222";
const AI_MODULE_B = "33333333-3333-4333-8333-333333333333";

const CANDIDATES = [
  {
    id: KNOWLEDGE,
    title: "知识宇宙 · AI-native 个性化学习 App",
    org: "个人项目",
    role: "产品负责人",
    period: "2024.06 – 至今",
    status: "shipped",
    evidence_level: "estimated",
    situation: "面向自学者的 AI 学习空间，支持按目标生成学习单元。",
    metric_names: ["第二周回访率", "免费池自负盈亏所需月度购买率"],
    pending_metrics: [],
    last_updated: "2026-08-20（7 天前）",
  },
  {
    id: AI_MODULE_A,
    title: "AI 成长陪伴助手模块 0→1 —— Multi-Agent 架构",
    org: "润泽园",
    role: "产品经理",
    period: "2025.03 – 至今",
    status: "design_done",
    evidence_level: "designed_only",
    situation: "润泽园 APP 内的 AI 陪伴模块，多智能体路由 + 记忆系统。",
    metric_names: [],
    pending_metrics: ["日活渗透率", "意图路由准确率"],
    last_updated: "2026-08-06（21 天前）",
  },
  {
    id: AI_MODULE_B,
    title: "AI 成长陪伴助手模块 0→1 —— RAG 与记忆系统",
    org: "润泽园",
    role: "产品经理",
    period: "2025.03 – 至今",
    status: "design_done",
    evidence_level: "designed_only",
    situation: "润泽园 APP 内的 AI 陪伴模块，检索增强与长期记忆。",
    metric_names: [],
    pending_metrics: ["日活渗透率"],
    last_updated: "2026-08-06（21 天前）",
  },
];

type Unit = Record<string, unknown>;

const unit = (over: Unit): Unit => ({
  types: ["status_update"],
  subject_hint: "",
  resolved_from_context: false,
  status: null,
  metrics: [],
  pending_metrics: [],
  content_patch: { situation: "", task: "", actions_add: [] },
  guards_patch: { must_say: [], never_say: [], role_framing: "" },
  new_experience: null,
  user_words: "",
  ...over,
});

type Check = { name: string; run: (r: StageCResult) => string | null };

const intentIs = (want: string): Check => ({
  name: `intent 为 ${want}`,
  run: (r) => (r.intent === want ? null : `实得 ${r.intent}`),
});

const belowGate: Check = {
  name: "置信度低于 0.75",
  run: (r) => (r.confidence < 0.75 ? null : `实得 ${r.confidence}`),
};

const targetIs = (id: string, label: string): Check => ({
  name: `目标是「${label}」`,
  run: (r) => (r.target_atom_id === id ? null : `实得 ${r.target_atom_id ?? "null"}`),
});

const parentIsNull: Check = {
  name: "parent_atom_id 为 null",
  run: (r) => (r.parent_atom_id === null ? null : `实得 ${r.parent_atom_id}`),
};

const parentIs = (id: string, label: string): Check => ({
  name: `parent 指向「${label}」`,
  run: (r) => (r.parent_atom_id === id ? null : `实得 ${r.parent_atom_id ?? "null"}`),
});

const twoOptions: Check = {
  name: "给了 2–3 个具体方案",
  run: (r) => (r.options.length >= 2 ? null : `实得 ${r.options.length} 个`),
};

const hasDiff: Check = {
  name: "diff 非空",
  run: (r) => (r.diff.length > 0 ? null : "是空的"),
};

const CASES: { id: string; unit: Unit; said: string; checks: Check[] }[] = [
  {
    id: "验收 11 · 代词 + 两个相似候选",
    said: "那个项目上线了",
    unit: unit({
      subject_hint: "那个项目",
      resolved_from_context: true,
      status: "shipped",
      user_words: "那个项目上线了",
    }),
    checks: [intentIs("ASK"), belowGate, twoOptions],
  },
  {
    id: "验收 12 · 全新项目",
    said: "我最近还做了个简历自动投递机器人，能按 JD 改简历再投",
    unit: unit({
      types: ["new_experience"],
      subject_hint: "简历自动投递机器人",
      user_words: "我最近还做了个简历自动投递机器人",
      new_experience: {
        title: "简历自动投递机器人",
        situation: "能按 JD 改简历再投",
      },
    }),
    checks: [intentIs("CREATE"), parentIsNull],
  },
  {
    id: "验收 13 · 已有项目下的新能力点",
    said: "知识宇宙里我还做了个学习计划自动排期的功能",
    unit: unit({
      types: ["new_experience"],
      subject_hint: "知识宇宙的学习计划自动排期",
      user_words: "知识宇宙里我还做了个学习计划自动排期的功能",
      new_experience: {
        title: "学习计划自动排期",
        situation: "知识宇宙里按目标自动排学习计划",
      },
    }),
    checks: [intentIs("CREATE"), parentIs(KNOWLEDGE, "知识宇宙")],
  },
  {
    id: "UPDATE 正例 · 指名道姓 + 带指标",
    said: "知识宇宙第二周回访率出来了，是 42%",
    unit: unit({
      types: ["metric_add"],
      subject_hint: "知识宇宙",
      metrics: [
        {
          name: "第二周回访率",
          kind: "outcome",
          from_value: "",
          to_value: "42%",
          delta: "",
          evidence_level: "measured",
          method: "",
        },
      ],
      user_words: "知识宇宙第二周回访率出来了，是 42%",
    }),
    checks: [intentIs("UPDATE"), targetIs(KNOWLEDGE, "知识宇宙"), hasDiff],
  },
];

let pass = 0;
let total = 0;
for (const c of CASES) {
  const r = await callLLM({
    tier: "strong",
    purpose: "chat_stage_c",
    system: STAGE_C_SYSTEM,
    user: stageCUser({
      unitJson: JSON.stringify(c.unit, null, 2),
      userMessage: c.said,
      candidatesJson: JSON.stringify(CANDIDATES, null, 2),
    }),
    jsonSchema: stageCSchema,
  });

  if (!r.ok) {
    console.log(`✗ ${c.id}\n    调用失败：${r.error}`);
    total += c.checks.length;
    continue;
  }

  const lines = c.checks.map((chk) => {
    total++;
    const bad = chk.run(r.data);
    if (bad === null) pass++;
    return `    ${bad === null ? "✓" : "✗"} ${chk.name}${bad === null ? "" : ` —— ${bad}`}`;
  });
  console.log(
    `${c.id}  [${r.usage.provider}]  置信度 ${r.data.confidence}\n${lines.join("\n")}\n` +
      `    依据：${r.data.ai_note}`,
  );
}
console.log(`\n${pass} / ${total} 项通过`);
if (pass < total) process.exitCode = 1;
