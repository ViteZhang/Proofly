// =============================================================
// Proofly · Stage B 拆分与结构化的探针
//
//   pnpm split:probe                只跑内置的验收用例
//   pnpm split:probe "随便一句话"     看它把这句拆成什么
//
// 覆盖《Step 3 方案》第七节里由 Stage B 单独决定的那些条：
// 7、8、9、10、14–21。这些是防幻觉的核心——「用户没说的口径不许编」
// 一旦松掉，编出来的东西会直接进简历。所以要能一条命令跑一遍。
//
// 走 llm/core.ts，不认识 Next，不用起服务器。
// =============================================================

import { callLLM, setCallLogger } from "../src/lib/llm/core";
import { STAGE_B_SYSTEM, stageBUser } from "../src/lib/llm/chat-prompts";
import { stageBSchema, type StageBResult } from "../src/lib/chat/schema";

setCallLogger(async () => {});

const NO_CTX = "（还没有上文，这是第一句话）";
const ONE_PROJECT = `用户：知识宇宙这个项目我在做意图路由
助手：记下了。`;

type Check = { name: string; run: (r: StageBResult) => string | null };

type Case = {
  id: string;
  text: string;
  ctx?: string;
  checks: Check[];
};

const units = (n: number): Check => ({
  name: `拆成 ${n} 个单元`,
  run: (r) => (r.units.length === n ? null : `实得 ${r.units.length} 个`),
});

const noMetric: Check = {
  name: "不产生任何指标",
  run: (r) => {
    const all = r.units.flatMap((u) => u.metrics);
    return all.length === 0 ? null : `实得 ${all.length} 条：${all.map((m) => m.name).join("、")}`;
  },
};

const firstMetric = (
  name: string,
  pick: (m: StageBResult["units"][number]["metrics"][number]) => string,
  want: string,
): Check => ({
  name,
  run: (r) => {
    const m = r.units.flatMap((u) => u.metrics)[0];
    if (!m) return "一条指标都没产生";
    const got = pick(m);
    return got === want ? null : `实得 ${got === "" ? "（空）" : got}`;
  },
});

const status = (want: string): Check => ({
  name: `status 为 ${want}`,
  run: (r) => {
    const s = r.units.map((u) => u.status).find((x) => x !== null) ?? null;
    return s === want ? null : `实得 ${s ?? "null"}`;
  },
});

const resolvedFromContext: Check = {
  name: "resolved_from_context 为 true",
  run: (r) => (r.units.some((u) => u.resolved_from_context) ? null : "全是 false"),
};

const hasOverflow: Check = {
  name: "overflow_note 非空",
  run: (r) => (r.overflow_note.trim() !== "" ? null : "是空的"),
};

const atMost4: Check = {
  name: "单元不超过 4 个",
  run: (r) => (r.units.length <= 4 ? null : `实得 ${r.units.length} 个`),
};

// 验收 21：user_words 必须能在原话里逐字找到。
// 比对前抹掉空白与标点——模型会把「35%」写成「35 %」，那不算编造。
const norm = (s: string) => s.replace(/[\s，。、；：？！“”‘’（）,.;:?!"'()]/g, "");
const userWordsVerbatim = (text: string): Check => ({
  name: "user_words 在原话里逐字找得到",
  run: (r) => {
    const src = norm(text);
    const bad = r.units
      .map((u) => u.user_words)
      .filter((w) => w.trim() !== "" && !src.includes(norm(w)));
    return bad.length === 0 ? null : `对不上：${bad.join(" / ")}`;
  },
});

const CASES: Case[] = [
  {
    id: "验收 7 · 同一对象的多项变化合并",
    text: "上周上线了，渗透率 35%，路由准确率 92%",
    checks: [units(1), userWordsVerbatim("上周上线了，渗透率 35%，路由准确率 92%")],
  },
  {
    id: "验收 8 · 不同对象拆开",
    text: "AI 模块上线了，另外我新做了个打招呼智能体",
    checks: [units(2), userWordsVerbatim("AI 模块上线了，另外我新做了个打招呼智能体")],
  },
  {
    id: "验收 9 · 一次说六件事",
    text:
      "知识宇宙上线了，润泽园 APP 完成了改版，AI 作业点评拿到了数据，" +
      "打招呼智能体做完了，公司内训讲了三场，还有个简历工具刚开始做",
    checks: [atMost4, hasOverflow],
  },
  {
    id: "验收 10 · 代词解析",
    text: "那个项目上线了",
    ctx: ONE_PROJECT,
    checks: [units(1), resolvedFromContext],
  },
  {
    id: "验收 14 · 没数字就没指标",
    text: "知识宇宙那个项目效率提升了不少",
    checks: [noMetric],
  },
  {
    id: "验收 15 · 带限定词是估算",
    text: "知识宇宙的加载速度大概提升了 30%",
    checks: [firstMetric("evidence_level 为 estimated", (m) => m.evidence_level, "estimated")],
  },
  {
    id: "验收 16 · 灰度不是上线",
    text: "知识宇宙灰度上线了",
    checks: [status("in_dev")],
  },
  {
    id: "验收 17 · 全量才是上线",
    text: "知识宇宙全量上线了",
    checks: [status("shipped")],
  },
  {
    id: "验收 18 · 交付物",
    text: "知识宇宙这边交付了 4 份文档",
    checks: [firstMetric("kind 为 output", (m) => m.kind, "output")],
  },
  {
    id: "验收 19 · 结果指标",
    text: "知识宇宙的渗透率 35%",
    checks: [
      firstMetric("kind 为 outcome", (m) => m.kind, "outcome"),
      firstMetric("evidence_level 为 measured", (m) => m.evidence_level, "measured"),
    ],
  },
  {
    id: "验收 20 · 没说口径就不许编",
    text: "知识宇宙的渗透率 35%",
    checks: [firstMetric("method 留空", (m) => m.method, "")],
  },
];

async function split(text: string, ctx = NO_CTX) {
  return callLLM({
    tier: "strong",
    purpose: "chat_stage_b",
    system: STAGE_B_SYSTEM,
    user: stageBUser({ recentTurns: ctx, userMessage: text }),
    jsonSchema: stageBSchema,
  });
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));

if (argv.length > 0) {
  for (const text of argv) {
    const r = await split(text);
    console.log(r.ok ? JSON.stringify(r.data, null, 2) : `✗ ${r.error}`);
  }
} else {
  let pass = 0;
  let total = 0;
  for (const c of CASES) {
    const r = await split(c.text, c.ctx);
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
    console.log(`${c.id}  [${r.usage.provider}]\n${lines.join("\n")}`);
  }
  console.log(`\n${pass} / ${total} 项通过`);
  if (pass < total) process.exitCode = 1;
}
