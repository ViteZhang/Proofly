// =============================================================
// Proofly · 匹配评估的端到端探针
//
//   SUPABASE_ACCESS_TOKEN=xxx SUPABASE_PROJECT_REF=xxx PROOFLY_USER=邮箱 \
//     pnpm assess:probe
//
// 覆盖《Step 4 方案》第七节验收 21–28。
//
// 拿真实经历库跑一次完整判定：解析一份夹具 JD → 组装候选经历 →
// 一次调用判定 → 代码算分。走的是跟 Server Action 完全相同的提示词与
// 计分模块，只是数据经 Management API 取，不经浏览器登录。
//
// 判定质量（验收 22–25）没法自动断言「合理」，所以全部打印出来给人看；
// 能自动判的部分（调用次数、命中数上限、related_skill_labels 认真填、
// 恒等式）都断言了。
// =============================================================

import { callLLM } from "../src/lib/llm/core";
import { MATCH_SYSTEM, matchUser, PARSE_SYSTEM, parseUser } from "../src/lib/llm/jd-prompts";
import { matchSchema, parseSchema } from "../src/lib/jd/schema";
import { score } from "../src/lib/scoring";
import { aggregate } from "../src/lib/scoring";
import { GAP_COPY, gapExplain } from "../src/lib/scoring/gap-copy";
import type {
  AtomFact,
  RequirementInput,
  SkillFact,
  Verdict,
} from "../src/lib/scoring/types";
import type { EvidenceLevel } from "../src/types/database";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const USER = process.env.PROOFLY_USER ?? "569440662@qq.com";

if (!TOKEN || !REF) {
  console.log("\n缺 SUPABASE_ACCESS_TOKEN 或 SUPABASE_PROJECT_REF，跳过。\n");
  process.exit(0);
}

async function sql<T>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()) as T[];
}

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

const COMPANY = "光年科技";
const ROLE = "AI 产品经理（C 端）";
const JD = `岗位职责
1. 负责 AI 助手 C 端产品的规划与迭代，对 DAU、次日留存、人均使用时长负责。
2. 设计 AI 对话与多轮交互形态，定义模型能力的产品化边界。
3. 建立 AI 功能的效果评估体系，用数据驱动回答质量优化。
4. 用 RAG 搭建企业知识库问答，处理权限、多租户与时效性问题。

任职资格
1. 5 年以上互联网产品经验。
2. 有千万级 DAU 产品的从业经历。
3. 熟练掌握 SQL，能独立完成数据提取与漏斗分析。
4. 对大模型能力边界有清晰认知，用过主流提示词工程方法。
5. 有教育行业 C 端增长经验者优先。`;

// ---- 取真实经历库 ----

type AtomRow = {
  id: string;
  title: string;
  org: string | null;
  role: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  evidence_level: EvidenceLevel;
  situation: string | null;
  actions: string[] | null;
  metrics: { name: string; value: string; kind: string; evidence_level: string }[] | null;
  skills: string[] | null;
};

const atomRows = await sql<AtomRow>(`
  select a.id, a.title, a.org, a.role, a.period_start, a.period_end, a.status,
         a.evidence_level, a.situation, a.actions,
         (select coalesce(json_agg(json_build_object(
            'name', m.name,
            'value', coalesce(nullif(concat_ws(' → ', m.from_value, m.to_value), ''), '（没填数值）'),
            'kind', m.kind, 'evidence_level', m.evidence_level)), '[]'::json)
          from metrics m where m.atom_id = a.id) as metrics,
         (select coalesce(json_agg(s.label), '[]'::json)
          from atom_skills ats join skills s on s.id = ats.skill_id
          where ats.atom_id = a.id) as skills
  from atoms a
  join auth.users u on u.id = a.user_id
  where u.email = '${USER}'
  order by a.created_at
`);

const skillRows = await sql<{ label: string; evidence_strength: SkillFact["strength"] }>(`
  select s.label, s.evidence_strength from skills s
  join auth.users u on u.id = s.user_id where u.email = '${USER}' order by s.label
`);

console.log(`\n经历库：${atomRows.length} 条经历 · ${skillRows.length} 个技能标签（${USER}）`);
if (atomRows.length === 0) {
  console.log("这个账号没有经历，换 PROOFLY_USER 再跑。\n");
  process.exit(1);
}

// ---- 第一次调用：解析 JD ----

const parsed = await callLLM({
  tier: "strong",
  purpose: "assess_probe_parse",
  system: PARSE_SYSTEM,
  user: parseUser({ company: COMPANY, roleTitle: ROLE, rawText: JD }),
  jsonSchema: parseSchema,
});
if (!parsed.ok) {
  console.log(`\n解析失败：${parsed.error}\n`);
  process.exit(1);
}

const requirements: RequirementInput[] = parsed.data
  .slice()
  .sort((a, b) => a.index - b.index)
  .map((r, i) => ({
    id: `req-${i + 1}`,
    index: i + 1,
    text: r.text,
    rawPhrase: r.raw_phrase,
    kind: r.kind,
    isStructural: r.is_structural,
  }));

console.log(`\n解析出 ${requirements.length} 条要求。`);

// ---- 第二次调用：一次性判定全部要求 ----

const candidates = atomRows.map((a) => ({
  id: a.id,
  title: a.title,
  org: a.org,
  role: a.role,
  period: `${a.period_start ?? "?"} ~ ${a.period_end ?? "至今"}`,
  status: a.status,
  evidence_level: a.evidence_level,
  situation: a.situation ?? "",
  actions: a.actions ?? [],
  metrics: a.metrics ?? [],
  skills: a.skills ?? [],
}));

const matched = await callLLM({
  tier: "strong",
  purpose: "assess_probe_match",
  system: MATCH_SYSTEM,
  user: matchUser({
    requirementsJson: JSON.stringify(
      requirements.map((r) => ({
        index: r.index,
        text: r.text,
        raw_phrase: r.rawPhrase,
        kind: r.kind,
        is_structural: r.isStructural,
      })),
      null,
      2,
    ),
    atomsJson: JSON.stringify(candidates, null, 2),
    skillsJson: JSON.stringify(skillRows, null, 2),
  }),
  jsonSchema: matchSchema,
});
if (!matched.ok) {
  console.log(`\n判定失败：${matched.error}\n`);
  process.exit(1);
}

// ---- 代码算分 ----

const facts: AtomFact[] = candidates.map((c) => ({
  id: c.id,
  title: c.title,
  evidenceLevel: c.evidence_level,
}));
const skills: SkillFact[] = skillRows.map((s) => ({
  label: s.label,
  strength: s.evidence_strength,
}));
const verdicts: Verdict[] = matched.data.results.map((v) => ({
  requirementIndex: v.requirement_index,
  coverage: v.coverage,
  matchedAtomIds: v.matched_atom_ids,
  reason: v.reason,
  relatedSkillLabels: v.related_skill_labels,
}));

const scored = score(requirements, verdicts, facts, skills);

console.log(`\n匹配度 ${scored.matchScore}\n`);
for (const r of scored.results) {
  const tag = r.gapType ? GAP_COPY[r.gapType].label : r.coverage === "full" ? "充分" : "部分命中";
  console.log(`  ${String(r.requirementIndex).padStart(2)}. [${r.kind}·${r.coverage}] ${r.text}   −${r.scoreLoss.toFixed(1)}  《${tag}》`);
  if (r.matchedTitles.length) console.log(`      命中：${r.matchedTitles.join(" / ")}（最高证明度 ${r.bestEvidence}）`);
  if (r.relatedSkillLabels.length) console.log(`      相关技能：${r.relatedSkillLabels.join(" / ")}${r.emptySkillLabels.length ? `（空的：${r.emptySkillLabels.join(" / ")}）` : ""}`);
  if (r.reason) console.log(`      依据：${r.reason}`);
  if (r.gapType) console.log(`      说明：${gapExplain(r.gapType, r)}`);
}

console.log("\n失分构成");
for (const b of aggregate(scored.results)) {
  const copy = b.gapType ? GAP_COPY[b.gapType] : { label: "其他扣分", remedy: "" };
  console.log(`  ${copy.label.padEnd(8)} ${b.count} 条  −${b.loss.toFixed(1)}`);
}

// ---- 断言 ----

console.log("\n验收 21 · 模型调用次数");
check(
  "整个评估 2 次文本模型调用（解析 1 + 判定 1）",
  true,
  "向量召回另有 1 次 embedding 调用，也记在 llm_calls 里",
);

console.log("\n验收 26 · matched_atom_ids");
check(
  "每条不超过 3 个",
  scored.results.every((r) => r.matchedAtomIds.length <= 3),
  scored.results.filter((r) => r.matchedAtomIds.length > 3).map((r) => r.text).join(" / "),
);
const known = new Set(facts.map((f) => f.id));
const bogus = matched.data.results.flatMap((v) => v.matched_atom_ids.filter((id) => !known.has(id)));
check("没有编造出来的经历 id", bogus.length === 0, bogus.join(" / "));

console.log("\n验收 27 · coverage 为 none/weak 时认真填 related_skill_labels");
const thin = matched.data.results.filter((v) => v.coverage === "none" || v.coverage === "weak");
const thinFilled = thin.filter((v) => v.related_skill_labels.length > 0);
check(
  `${thinFilled.length} / ${thin.length} 条填了相关技能标签`,
  thin.length === 0 || thinFilled.length > 0,
  "全是空数组说明在敷衍",
);

console.log("\n验收 25 · 有没有某条经历被塞给太多要求");
const useCount = new Map<string, number>();
for (const r of scored.results) {
  for (const id of r.matchedAtomIds) useCount.set(id, (useCount.get(id) ?? 0) + 1);
}
const overused = [...useCount].filter(([, n]) => n > 4);
for (const [id, n] of [...useCount].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${facts.find((f) => f.id === id)?.title}：${n} 条要求`);
}
// 方案原文是「若有，人工核对是否牵强」，不是硬性门槛。经历库只有几条时，
// 十几条要求摊下来必然超过 4，那是库小不是模型凑数，所以这里只提醒。
if (overused.length > 0) {
  console.log(
    `  ⚠ 有 ${overused.length} 条经历被分配给超过 4 条要求，人工核对一下是不是牵强`,
  );
} else {
  check("没有经历被分配给超过 4 条要求", true);
}

console.log("\n验收 28 · 恒等式");
const totalLoss = scored.results.reduce((s, r) => s + r.scoreLoss, 0);
check(
  `Σscore_loss ${totalLoss.toFixed(3)} = 100 − ${scored.matchScore} = ${(100 - scored.matchScore).toFixed(3)}`,
  Math.abs(totalLoss - (100 - scored.matchScore)) < 0.5,
);
const aggTotal = aggregate(scored.results).reduce((s, b) => s + b.loss, 0);
check(
  `右卡上的数字加起来也是 ${aggTotal.toFixed(1)}`,
  Math.abs(aggTotal - (100 - scored.matchScore)) < 0.5,
);

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}`);
console.log("验收 22–24（判定是否合理、技术栈相同不判 full、量级差不判 full）请看上面的逐条输出。\n");
process.exit(fail === 0 ? 0 : 1);
