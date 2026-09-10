// =============================================================
// Proofly · 技能分类与归并 · P0-4
//
//   node --test src/lib/skills/taxonomy.test.ts
//
// 这一片的验收标准很具体：那 66 条平铺标签要收敛成六组以内、不超过 24 条，
// 七个「产品 X 设计」要变成一条。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  OTHER_CATEGORY,
  SKILL_CATEGORIES,
  TOTAL_LIMIT,
  categoryOf,
  curateSkills,
  flattenSkills,
  groupSkills,
  mergeSkillLabel,
} from "./taxonomy";

/** 生产库里那 66 条的真实样本，顺序照抄。 */
const REAL = [
  "产品设计", "数据分析", "需求分析", "产品定位设计", "产品定义",
  "产品方案与文档设计", "产品规划", "产品架构设计", "产品系统设计",
  "产品战略规划", "单位经济模型", "独立全栈交付", "对话系统设计",
  "对象模型设计", "后台产品设计", "交互设计", "竞品分析", "跨部门协作",
  "冷启动策略", "流量运营", "漏斗分析", "模块化设计", "内容变现",
  "配置化产品设计", "平台产品规划", "评分模式设计", "商业化设计",
  "上下文管理", "社群运营", "社群运营协同", "数据建模", "推荐系统设计",
  "问题定义", "新手引导设计", "信息架构设计", "业务流程梳理",
  "业务流程数字化", "业务验证", "移动端产品设计", "意图识别",
  "用户行为数据分析", "用户需求分析", "用户转化优化", "语义检索与向量检索",
  "指标体系设计", "中台化设计", "转化率优化", "AI 产品规划", "AI 产品设计",
  "AI 幻觉治理", "Human-in-the-loop 流程设计", "Multi-Agent 架构设计",
  "Prompt Engineering", "大模型 API", "个性化学习系统设计", "幻觉治理",
  "全栈开发", "商业模式设计", "提示词工程", "AI 辅助开发", "AI 系统设计",
  "Java", "LLM 应用架构", "Next.js", "React Native", "Supabase",
];

test("归并 · 七个产品类近义词收敛成一条", () => {
  const canonical = [
    "产品设计", "产品定义", "产品规划", "产品架构设计",
    "产品系统设计", "产品战略规划", "产品方案与文档设计",
  ].map(mergeSkillLabel);
  assert.deepEqual(new Set(canonical), new Set(["产品定义与架构设计"]));
});

test("归并 · 不在表里的原样返回", () => {
  assert.equal(mergeSkillLabel("Supabase"), "Supabase");
  assert.equal(mergeSkillLabel("  Java  "), "Java");
});

test("归并 · 大小写与空格不影响匹配", () => {
  assert.equal(mergeSkillLabel("prompt engineering"), "提示词工程");
  assert.equal(mergeSkillLabel("Prompt  Engineering"), "提示词工程");
});

test("分类 · 命中多个域时取第一个，结果是确定的", () => {
  // 「AI 系统设计」既撞得上 AI 对话产品的关键词，也撞得上设计与交付的
  // 「设计」。跑十次必须是同一个答案。
  const first = categoryOf("AI 系统设计");
  for (let i = 0; i < 10; i++) assert.equal(categoryOf("AI 系统设计"), first);
  assert.equal(first, "AI 对话产品");
});

test("分类 · 用户手工填的 category 优先，哪怕不在六个域里", () => {
  assert.equal(categoryOf("Java", "我自己的分类"), "我自己的分类");
  assert.equal(categoryOf("Java", "   "), "设计与交付");
});

test("分类 · 谁都不命中的落进「其他」", () => {
  assert.equal(categoryOf("跨部门协作"), OTHER_CATEGORY);
});

test("整理 · 66 条收敛到 24 条以内、六组之内", () => {
  const groups = curateSkills(REAL);
  const flat = flattenSkills(groups);
  assert.ok(flat.length <= TOTAL_LIMIT, `实际 ${flat.length} 条`);
  assert.ok(groups.length <= SKILL_CATEGORIES.length + 1, `实际 ${groups.length} 组`);
  // 七个近义词只剩一条
  assert.equal(flat.filter((s) => s === "产品定义与架构设计").length, 1);
  assert.equal(flat.filter((s) => s.startsWith("产品") && s !== "产品定义与架构设计").length, 0);
});

test("整理 · 「其他」组限得更紧，且永远排在最后", () => {
  const groups = curateSkills(REAL);
  const other = groups.find((g) => g.category === OTHER_CATEGORY);
  if (other) {
    assert.ok(other.items.length <= 4, `其他组 ${other.items.length} 条`);
    assert.equal(groups[groups.length - 1].category, OTHER_CATEGORY);
  }
});

test("整理 · 幂等 —— 整理过的再跑一次不变", () => {
  const once = flattenSkills(curateSkills(REAL));
  const twice = flattenSkills(curateSkills(once));
  assert.deepEqual(twice, once);
});

test("整理 · 输入顺序即优先级，靠前的先占名额", () => {
  const groups = curateSkills(["Java", "Next.js", "React Native", "Supabase", "全栈开发", "交互设计", "信息架构设计"], {
    groupLimit: 2,
  });
  const g = groups.find((x) => x.category === "设计与交付")!;
  assert.deepEqual(g.items, ["Java", "Next.js"]);
});

test("整理 · 空输入不产出空标题", () => {
  assert.deepEqual(curateSkills([]), []);
  assert.deepEqual(groupSkills([]), []);
  assert.deepEqual(curateSkills(["   ", ""]), []);
});

test("整理 · 重复标签只留一条", () => {
  const flat = flattenSkills(curateSkills(["Java", "java", "JAVA"]));
  assert.deepEqual(flat, ["Java"]);
});

test("整理 · 总上限优先于组上限，不会因为组没满就超总数", () => {
  const many = Array.from({ length: 60 }, (_, i) => `技能${i}`);
  const flat = flattenSkills(curateSkills(many));
  assert.ok(flat.length <= TOTAL_LIMIT);
});

test("整理 · 用户自定义分类单独成组，排在六个域之后、其他之前", () => {
  const overrides = new Map<string, string | null>([["Java", "我的分类"]]);
  const groups = curateSkills(["意图识别", "Java", "跨部门协作"], { overrides });
  assert.deepEqual(
    groups.map((g) => g.category),
    ["AI 对话产品", "我的分类", OTHER_CATEGORY],
  );
});
