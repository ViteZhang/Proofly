// =============================================================
// Proofly · 行动生成的真调模型探针
//
//   pnpm plan:probe
//
// 覆盖《Step 5 方案》第五节验收 1–6。
//
// 不连库：夹具是手写的，为的是把「该合并的」和「不该合并的」并排放进去。
// 真实缺口里这两种情况不会同时出现得这么干净，也就验不出来。
//
// 能自动判的都断言了（数量上限、learn 工时下限、anchor 必须真实存在、
// 空话黑名单、被舍弃的缺口有没有落进 dropped_gap_ids）；
// 聚类合不合理没法自动断言「合理」，全部打印出来给人看。
// =============================================================

import { callLLM } from "../src/lib/llm/core";
import { PLAN_SYSTEM, planUser } from "../src/lib/llm/task-prompts";
import { planSchema } from "../src/lib/planning/schema";
import { LEARN_MIN_HOURS, MAX_TASKS_OUT } from "../src/lib/planning/config";

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

const ANCHORS = [
  {
    id: "atom-ku",
    title: "知识宇宙",
    status: "in_dev",
    evidence_level: "designed_only",
    situation: "面向考研学生的 AI 学习助手，单元自动生成 + 断点续学，内测中。",
    pending_metrics: ["第二周回访率", "人均问 AI 次数", "断点续学使用率"],
  },
  {
    id: "atom-agent",
    title: "企业知识库问答 Agent",
    status: "shipped",
    evidence_level: "estimated",
    situation: "公司内部 RAG 问答，接了权限与多租户，已上线给三个部门用。",
    pending_metrics: ["答案采纳率"],
  },
];

// g1 / g2 是「做完同一件事能同时补上」的一对，必须合并。
// g3 / g4 听起来都跟数据有关，但做法完全不同，不该合并。
const GAPS = [
  { gap_id: "g1", target_name: "AI 产品经理（C 端）", requirement_text: "建立 AI 功能的效果评估体系，用数据驱动回答质量优化", gap_type: "no_evidence", severity: "high", score_loss: 8.6, related_skill_labels: ["AI 效果评估"] },
  { gap_id: "g2", target_name: "Agent 平台产品", requirement_text: "有 LLM 效果评测经验", gap_type: "no_evidence", severity: "high", score_loss: 7.9, related_skill_labels: ["LLM 评测"] },

  { gap_id: "g3", target_name: "AI 产品经理（C 端）", requirement_text: "熟练掌握 SQL，能独立完成数据提取与漏斗分析", gap_type: "no_capability", severity: "high", score_loss: 8.1, related_skill_labels: ["SQL"] },
  { gap_id: "g4", target_name: "AI 产品经理（C 端）", requirement_text: "对 DAU、次日留存、人均使用时长负责，能讲出真实的数据表现", gap_type: "weak_evidence", severity: "high", score_loss: 7.4, related_skill_labels: ["核心指标"] },

  { gap_id: "g5", target_name: "AI 产品经理（C 端）", requirement_text: "有千万级 DAU 产品的从业经历", gap_type: "structural", severity: "high", score_loss: 9.2, related_skill_labels: [] },
  { gap_id: "g6", target_name: "Agent 平台产品", requirement_text: "有大厂平台型产品从 0 到 1 的完整经历", gap_type: "structural", severity: "medium", score_loss: 6.3, related_skill_labels: [] },

  { gap_id: "g7", target_name: "Agent 平台产品", requirement_text: "用 RAG 搭建企业知识库问答，处理权限、多租户与时效性问题", gap_type: "weak_evidence", severity: "high", score_loss: 5.8, related_skill_labels: ["RAG"] },
  { gap_id: "g8", target_name: "Agent 平台产品", requirement_text: "定义 Agent 的工具调用边界与失败兜底策略", gap_type: "no_evidence", severity: "medium", score_loss: 5.1, related_skill_labels: ["Agent 编排"] },
  { gap_id: "g9", target_name: "AI 产品经理（C 端）", requirement_text: "设计 AI 对话与多轮交互形态", gap_type: "weak_evidence", severity: "medium", score_loss: 4.7, related_skill_labels: ["对话设计"] },
  { gap_id: "g10", target_name: "AI 产品经理（C 端）", requirement_text: "有教育行业 C 端增长经验", gap_type: "weak_evidence", severity: "low", score_loss: 3.9, related_skill_labels: ["增长"] },
  { gap_id: "g11", target_name: "Agent 平台产品", requirement_text: "有 A/B 实验设计与结果解读经验", gap_type: "no_evidence", severity: "medium", score_loss: 4.4, related_skill_labels: ["A/B 实验"] },
  { gap_id: "g12", target_name: "Agent 平台产品", requirement_text: "熟悉向量检索与召回优化", gap_type: "weak_evidence", severity: "medium", score_loss: 4.2, related_skill_labels: ["向量检索"] },
  { gap_id: "g13", target_name: "AI 产品经理（C 端）", requirement_text: "能独立完成竞品拆解与机会判断", gap_type: "no_evidence", severity: "low", score_loss: 3.1, related_skill_labels: ["竞品分析"] },
  { gap_id: "g14", target_name: "Agent 平台产品", requirement_text: "有 Prompt 工程的系统方法，能沉淀成规范", gap_type: "weak_evidence", severity: "medium", score_loss: 3.8, related_skill_labels: ["提示词工程"] },
  { gap_id: "g15", target_name: "AI 产品经理（C 端）", requirement_text: "有内容安全与合规审核机制的落地经验", gap_type: "no_capability", severity: "low", score_loss: 2.9, related_skill_labels: ["内容安全"] },
  { gap_id: "g16", target_name: "Agent 平台产品", requirement_text: "了解模型微调与蒸馏的成本收益权衡", gap_type: "no_capability", severity: "low", score_loss: 2.4, related_skill_labels: ["模型训练"] },
  { gap_id: "g17", target_name: "AI 产品经理（C 端）", requirement_text: "带过 3 人以上的产品小组", gap_type: "structural", severity: "medium", score_loss: 3.5, related_skill_labels: [] },
  { gap_id: "g18", target_name: "Agent 平台产品", requirement_text: "有开放平台生态运营经验", gap_type: "no_capability", severity: "low", score_loss: 2.2, related_skill_labels: ["生态运营"] },
];

const SKILLS = [
  { label: "AI 产品设计", evidence_strength: "strong" },
  { label: "RAG", evidence_strength: "weak" },
  { label: "提示词工程", evidence_strength: "weak" },
  { label: "SQL", evidence_strength: "none" },
  { label: "A/B 实验", evidence_strength: "none" },
  { label: "AI 效果评估", evidence_strength: "none" },
  { label: "LLM 评测", evidence_strength: "none" },
  { label: "增长", evidence_strength: "weak" },
];

console.log(`\n夹具：${GAPS.length} 条缺口 · ${ANCHORS.length} 个可挂靠项目 · ${SKILLS.length} 个技能标签\n`);

const res = await callLLM({
  tier: "strong",
  purpose: "plan_probe",
  system: PLAN_SYSTEM,
  user: planUser({
    gapsJson: JSON.stringify(GAPS, null, 2),
    anchorAtomsJson: JSON.stringify(ANCHORS, null, 2),
    skillsJson: JSON.stringify(SKILLS, null, 2),
  }),
  jsonSchema: planSchema,
});

if (!res.ok) {
  console.log(`生成失败：${res.error}\n`);
  process.exit(1);
}

const tasks = res.data.tasks;
const gapById = new Map(GAPS.map((g) => [g.gap_id, g]));

// ---- 打印 ----

console.log(`生成了 ${tasks.length} 条行动\n`);
for (const [i, t] of tasks.entries()) {
  const targets = new Set(
    t.gap_ids.map((id) => gapById.get(id)?.target_name).filter(Boolean),
  );
  console.log(
    `${String(i + 1).padStart(2)}. [${t.action_type}] ${t.title}   ${t.estimated_hours}h · 服务 ${targets.size} 个方向`,
  );
  console.log(`      缺口：${t.gap_ids.join(" ")}`);
  if (t.anchor_atom_id) {
    console.log(`      挂靠：${ANCHORS.find((a) => a.id === t.anchor_atom_id)?.title ?? `⚠ ${t.anchor_atom_id}（不存在）`}`);
  }
  console.log(`      产出：${t.deliverable}`);
  console.log(`      理由：${t.rationale}`);
}
if (res.data.dropped_gap_ids.length > 0) {
  console.log(`\n被舍弃的缺口：${res.data.dropped_gap_ids.join(" ")}`);
}

// ---- 断言 ----

console.log("\n验收 1 · 两个方向下语义相同的缺口应合并为一条");
const merged = tasks.find((t) => t.gap_ids.includes("g1") && t.gap_ids.includes("g2"));
check(
  "「建立 AI 效果评估体系」与「有 LLM 效果评测经验」合并了",
  merged !== undefined,
  merged === undefined
    ? `g1 在「${tasks.find((t) => t.gap_ids.includes("g1"))?.title ?? "没人认领"}」，g2 在「${tasks.find((t) => t.gap_ids.includes("g2"))?.title ?? "没人认领"}」`
    : "",
);

console.log("\n验收 2 · 听起来相关但做法不同的不该合并");
const sqlTask = tasks.find((t) => t.gap_ids.includes("g3"));
const metricTask = tasks.find((t) => t.gap_ids.includes("g4"));
check(
  "「学会 SQL」与「拿到 DAU/留存的真实数据」没合成一条",
  sqlTask !== undefined && metricTask !== undefined && sqlTask !== metricTask,
  sqlTask === metricTask ? `都进了「${sqlTask?.title}」` : "有一条没人认领",
);

console.log("\n验收 3 · 任务要具体到能开工");
// 「学习 X」「提升 Y 能力」这类空话。三个月后仍然只能说「我了解」。
const VAGUE = ["学习相关", "提升.{0,6}能力", "补充.{0,6}经验", "了解一下", "熟悉一下", "加强.{0,6}理解"];
const vague = tasks.filter((t) => VAGUE.some((re) => new RegExp(re).test(t.title)));
check("标题里没有空话", vague.length === 0, vague.map((t) => t.title).join(" / "));
const tooShort = tasks.filter((t) => t.title.length < 8);
check("标题不是一个短语了事", tooShort.length === 0, tooShort.map((t) => t.title).join(" / "));
const noDeliverable = tasks.filter((t) => t.deliverable.trim().length < 6);
check("每条都说得出具体产出物", noDeliverable.length === 0, noDeliverable.map((t) => t.title).join(" / "));

console.log("\n验收 4 · 造证据类必须挂靠已有项目");
const anchorIds = new Set(ANCHORS.map((a) => a.id));
const build = tasks.filter((t) => t.action_type === "build_evidence");
const badAnchor = build.filter((t) => !t.anchor_atom_id || !anchorIds.has(t.anchor_atom_id));
check(
  `${build.length} 条造证据任务全部挂在已有项目上`,
  build.length === 0 || badAnchor.length === 0,
  badAnchor.map((t) => `${t.title} → ${t.anchor_atom_id ?? "null"}`).join(" / "),
);
const bogusAnchor = tasks.filter((t) => t.anchor_atom_id && !anchorIds.has(t.anchor_atom_id));
check("没有编造出来的挂靠项目 id", bogusAnchor.length === 0, bogusAnchor.map((t) => t.anchor_atom_id).join(" / "));

console.log("\n验收 5 · 数量控制");
check(`任务不超过 ${MAX_TASKS_OUT} 条（实际 ${tasks.length}）`, tasks.length <= MAX_TASKS_OUT);
const covered = new Set(tasks.flatMap((t) => t.gap_ids));
const dropped = new Set(res.data.dropped_gap_ids);
const orphan = GAPS.filter((g) => !covered.has(g.gap_id) && !dropped.has(g.gap_id));
check(
  "没被任何任务认领的缺口都进了 dropped_gap_ids",
  orphan.length === 0,
  orphan.map((g) => `${g.gap_id}（${g.requirement_text.slice(0, 16)}…）`).join(" / "),
);
const fakeGap = [...covered].filter((id) => !gapById.has(id));
check("没有编造出来的 gap_id", fakeGap.length === 0, fakeGap.join(" / "));

console.log("\n验收 6 · learn 类工时不低于 30");
const learn = tasks.filter((t) => t.action_type === "learn");
const cheapLearn = learn.filter((t) => t.estimated_hours < LEARN_MIN_HOURS);
check(
  `${learn.length} 条学技能任务的工时都 ≥ ${LEARN_MIN_HOURS}`,
  cheapLearn.length === 0,
  cheapLearn.map((t) => `${t.title} ${t.estimated_hours}h`).join(" / "),
);

console.log("\nrationale");
const badRationale = tasks.filter((t) => t.rationale.length < 40);
check("每条 rationale 都说清了三件事（80–150 字量级）", badRationale.length === 0, badRationale.map((t) => t.title).join(" / "));
const flattery = tasks.filter((t) => /大大提升|极大|竞争力|脱颖而出|助您|为您/.test(t.rationale));
check("没有恭维话", flattery.length === 0, flattery.map((t) => t.title).join(" / "));

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}`);
console.log("聚类合不合理、任务是不是真的想做，看上面的逐条输出。\n");
process.exit(fail === 0 ? 0 : 1);
