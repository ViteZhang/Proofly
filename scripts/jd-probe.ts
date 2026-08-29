// =============================================================
// Proofly · JD 解析探针
//
//   pnpm jd:probe
//
// 覆盖《Step 4 方案》第七节验收 13–18。真调模型，不连库。
//
// 夹具是一份特意埋了坑的 JD：公司介绍、薪资福利、投递方式、纯口号
// 各一段，都不该被拆成要求；另有「5 年以上」「千万级 DAU」两条结构性
// 要求和「熟练掌握 SQL」一条非结构性要求。
// 真实 JD 要你自己贴，这份只保证规则本身没写错。
// =============================================================

import { callLLM } from "../src/lib/llm/core";
import { PARSE_SYSTEM, parseUser } from "../src/lib/llm/jd-prompts";
import { parseSchema } from "../src/lib/jd/schema";

const COMPANY = "光年科技";
const ROLE = "AI 产品经理（C 端）";

const JD = `关于我们
光年科技成立于 2019 年，累计融资 12 亿元，团队 800 余人，是国内领先的
AI 应用公司。我们相信和优秀的人一起做有挑战的事，是这个时代最好的成长方式。

岗位职责
1. 负责 AI 助手 C 端产品的规划与迭代，对 DAU、次日留存、人均使用时长负责。
2. 设计 AI 对话与多轮交互形态，定义模型能力的产品化边界。
3. 建立 AI 功能的效果评估体系，用数据驱动回答质量优化。
4. 协同算法、工程、设计团队推进项目落地，负责需求排期与上线节奏。

任职资格
1. 5 年以上互联网产品经验，其中 2 年以上 C 端产品经验。
2. 有千万级 DAU 产品的从业经历。
3. 熟练掌握 SQL，能独立完成数据提取与漏斗分析。
4. 对大模型能力边界有清晰认知，用过主流的提示词工程方法。
5. 有教育、社交或工具类产品经验者优先。
6. 有从 0 到 1 搭建产品的经历者更佳。

薪资福利
40-70K x 16 薪，六险一金，免费三餐，弹性办公，每年 15 天带薪年假。
办公地点：北京市海淀区。汇报对象：产品负责人。

投递方式
简历发送至 hr@example.com，邮件标题格式「姓名-岗位-来源」。`;

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

function hit(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

const res = await callLLM({
  tier: "strong",
  purpose: "jd_probe",
  system: PARSE_SYSTEM,
  user: parseUser({ company: COMPANY, roleTitle: ROLE, rawText: JD }),
  jsonSchema: parseSchema,
});

if (!res.ok) {
  console.log(`\n模型调用失败：${res.error}\n`);
  process.exit(1);
}

const reqs = res.data;
console.log(`\n拆出 ${reqs.length} 条：\n`);
for (const r of reqs) {
  const flags = [r.kind, r.is_structural ? "结构性" : ""].filter(Boolean).join(" · ");
  console.log(`  ${String(r.index).padStart(2)}. [${flags}] ${r.text}`);
  console.log(`      原文：${r.raw_phrase}`);
  if (r.derived_from) console.log(`      反推自：${r.derived_from}`);
}

const hard = reqs.filter((r) => r.kind === "hard");
const implicit = reqs.filter((r) => r.kind === "implicit");
const nice = reqs.filter((r) => r.kind === "nice_to_have");

console.log(`\n验收 13 · 拆分粒度`);
check(
  `拆出 8–15 条（实际 ${reqs.length}）`,
  reqs.length >= 8 && reqs.length <= 15,
  `hard ${hard.length} / implicit ${implicit.length} / nice ${nice.length}`,
);
check("index 不重复", new Set(reqs.map((r) => r.index)).size === reqs.length);

console.log(`\n验收 14 · implicit 不超过 hard 的一半`);
check(
  `implicit ${implicit.length} ≤ hard ${hard.length} / 2`,
  implicit.length * 2 <= hard.length,
);

console.log(`\n验收 15、16 · 结构性判定`);
const years = reqs.find((r) => hit(r.text + r.raw_phrase, ["5 年", "5年", "五年"]));
const dau = reqs.find((r) => hit(r.text + r.raw_phrase, ["千万级", "千万"]));
const sql = reqs.find((r) => hit(r.text + r.raw_phrase, ["SQL"]));
check("「5 年以上经验」被拆出来了", years !== undefined);
check("「5 年以上经验」判为结构性", years?.is_structural === true, JSON.stringify(years));
check("「千万级 DAU」被拆出来了", dau !== undefined);
check("「千万级 DAU」判为结构性", dau?.is_structural === true, JSON.stringify(dau));
check("「熟练掌握 SQL」被拆出来了", sql !== undefined);
check("「熟练掌握 SQL」不是结构性", sql?.is_structural === false, JSON.stringify(sql));

console.log(`\n验收 17 · 不该被拆成要求的东西`);
const NOISE: [string, string[]][] = [
  ["公司介绍（成立年份、融资、人数）", ["成立于", "融资", "800", "领先的 AI 应用公司"]],
  ["薪资福利", ["40-70K", "16 薪", "六险一金", "免费三餐", "年假", "弹性办公"]],
  ["办公地点与汇报关系", ["海淀", "办公地点", "汇报对象"]],
  ["投递方式", ["hr@example.com", "简历发送", "邮件标题"]],
  ["纯口号", ["优秀的人一起", "最好的成长方式"]],
];
for (const [label, words] of NOISE) {
  const bad = reqs.filter((r) => hit(`${r.text} ${r.raw_phrase}`, words));
  check(`${label} 没被当成要求`, bad.length === 0, bad.map((b) => b.text).join(" / "));
}

console.log(`\n验收 18 · raw_phrase 与原文逐字一致`);
let verbatim = 0;
const notVerbatim: string[] = [];
for (const r of reqs) {
  if (r.raw_phrase && JD.includes(r.raw_phrase)) verbatim++;
  else notVerbatim.push(`「${r.raw_phrase}」`);
}
check(
  `${verbatim} / ${reqs.length} 条能在 JD 原文里逐字找到`,
  notVerbatim.length === 0,
  notVerbatim.join("  "),
);

console.log(`\n其他`);
check("implicit 都填了 derived_from", implicit.every((r) => r.derived_from));
check("非 implicit 不填 derived_from", [...hard, ...nice].every((r) => !r.derived_from));
check("每条 text 都在 20 字以内", reqs.every((r) => r.text.length <= 20), reqs.filter((r) => r.text.length > 20).map((r) => `${r.text.length}字:${r.text}`).join(" / "));

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
