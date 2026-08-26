// =============================================================
// Proofly · 抽取质量评估
//
//   pnpm eval:extract
//
// 把 eval/golden/*.md 逐份喂给 Pass 2，与同名 .json 对照，
// 报告写到 eval/report-{时间戳}.md。
//
// 走 llm/core.ts 而不是 llm/index.ts：core 不认识 Next，
// 所以这个脚本能用 node 直接跑，不用起服务器。
// =============================================================

import fs from "node:fs";
import path from "node:path";

import { callLLM, setCallLogger } from "../src/lib/llm/core";
import { MODEL } from "../src/lib/llm/config";
import { PASS2_SYSTEM, pass2User } from "../src/lib/llm/prompts";
import { pass2Schema } from "../src/lib/ingest/schema";

type Golden = {
  title?: string;
  level?: string;
  actions?: string[];
  metrics?: { name: string; kind?: string }[];
  children?: { title?: string; level?: string; metrics?: { name: string; kind?: string }[]; actions?: string[] }[];
};

type CaseResult = {
  id: string;
  ok: boolean;
  error?: string;
  hallucinated: { metric: string; numbers: string[] }[];
  metricTotal: number;
  missedMetrics: string[];
  missedActions: number;
  goldenUnits: number;
  kindRight: number;
  kindTotal: number;
  levelRight: number;
  levelTotal: number;
  extractedTitle: string;
  childTitles: string[];
  goldenChildTitles: string[];
  gotMetricNames: string[];
  goldenMetricNames: string[];
};

const ROOT = path.resolve(import.meta.dirname, "..");

// provider → 实际发出的请求数。主用挂过就会有两家的数。
const served = new Map<string, number>();

function servedLine(): string {
  if (served.size === 0) return "（没记到调用）";
  return [...served.entries()].map(([k, n]) => `${k} ${n} 次`).join(" · ");
}
const GOLDEN = path.join(ROOT, "eval", "golden");

async function main() {
  const ids = fs
    .readdirSync(GOLDEN)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();

  if (ids.length === 0) {
    console.error("eval/golden 里没有案例。看 eval/README.md。");
    process.exit(1);
  }

  // 配了兜底之后，「用哪个型号」不能再从 config 里读——主用挂了会自动换家，
  // 报告上却还印着主用型号，那是在骗自己。数实际服务的那家。
  setCallLogger(async (e) => {
    served.set(e.provider, (served.get(e.provider) ?? 0) + 1);
  });

  console.log(`对照集 ${ids.length} 份 · Pass 2 主用 ${MODEL.strong}\n`);

  const results: CaseResult[] = [];
  for (const id of ids) {
    process.stdout.write(`  ${id} … `);
    const r = await runCase(id);
    results.push(r);
    console.log(
      r.ok
        ? `幻觉 ${r.hallucinated.length} · 漏 ${r.missedMetrics.length + r.missedActions} · kind ${r.kindRight}/${r.kindTotal}`
        : `失败：${r.error}`,
    );
  }

  const report = render(results);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(ROOT, "eval", `report-${stamp}.md`);
  fs.writeFileSync(out, report);

  const s = summarize(results);
  console.log(`\n幻觉率 ${pct(s.hallucination)}（门槛 0）`);
  console.log(`漏抽率 ${pct(s.miss)}（门槛 < 20%）`);
  console.log(`kind 准确率 ${pct(s.kind)}（门槛 > 90%）`);
  console.log(`切分一致性 ${pct(s.level)}（门槛 > 80%）`);
  console.log(`\n实际由谁服务：${servedLine()}`);
  console.log(`报告：${path.relative(process.cwd(), out)}`);

  // 幻觉率不为 0 就让 CI 红
  process.exit(s.hallucination > 0 ? 1 : 0);
}

async function runCase(id: string): Promise<CaseResult> {
  const source = fs.readFileSync(path.join(GOLDEN, `${id}.md`), "utf8");
  const golden: Golden = JSON.parse(fs.readFileSync(path.join(GOLDEN, `${id}.json`), "utf8"));

  const base: CaseResult = {
    id,
    ok: false,
    hallucinated: [],
    metricTotal: 0,
    missedMetrics: [],
    missedActions: 0,
    goldenUnits: 0,
    kindRight: 0,
    kindTotal: 0,
    levelRight: 0,
    levelTotal: 0,
    extractedTitle: "",
    childTitles: [],
    goldenChildTitles: (golden.children ?? []).map((c) => c.title ?? ""),
    gotMetricNames: [],
    goldenMetricNames: [],
  };

  const r = await callLLM({
    tier: "strong",
    purpose: "eval_pass2",
    system: PASS2_SYSTEM,
    user: pass2User({
      contextBefore: "",
      targetText: source,
      contextAfter: "",
      docTitle: `对照集 ${id}`,
    }),
    jsonSchema: pass2Schema,
  });
  if (!r.ok) return { ...base, error: r.error };

  const got = r.data;
  const gotMetrics = [
    ...got.metrics.map((m) => ({ ...m, from: got.title })),
    ...got.children.flatMap((c) => c.metrics.map((m) => ({ ...m, from: c.title }))),
  ];
  const goldMetrics = [
    ...(golden.metrics ?? []),
    ...(golden.children ?? []).flatMap((c) => c.metrics ?? []),
  ];
  const goldActions = [
    ...(golden.actions ?? []),
    ...(golden.children ?? []).flatMap((c) => c.actions ?? []),
  ];
  const gotActionText = [got.actions.join(" "), ...got.children.map((c) => c.actions.join(" "))].join(" ");

  // ---- 幻觉：数值在原文里找不到 ----
  const hallucinated: CaseResult["hallucinated"] = [];
  for (const m of gotMetrics) {
    const nums = numbersIn(`${m.from_value} ${m.to_value} ${m.delta}`);
    const missing = nums.filter((n) => !sourceHas(source, n));
    if (missing.length > 0) hallucinated.push({ metric: `${m.from} · ${m.name}`, numbers: missing });
  }

  // ---- 漏抽 ----
  const missedMetrics = goldMetrics
    .filter((g) => !gotMetrics.some((x) => similar(x.name, g.name)))
    .map((g) => g.name);
  const missedActions = goldActions.filter((a) => !coversAction(gotActionText, a)).length;

  // ---- kind 准确率：只看两边都有的指标 ----
  let kindRight = 0;
  let kindTotal = 0;
  for (const g of goldMetrics) {
    if (!g.kind) continue;
    const hit = gotMetrics.find((x) => similar(x.name, g.name));
    if (!hit) continue;
    kindTotal++;
    if (hit.kind === g.kind) kindRight++;
  }

  // ---- 切分一致性：顶层层级 + 每个 golden 能力点是否被抽成了能力点 ----
  let levelRight = golden.level === undefined || got.level === golden.level ? 1 : 0;
  let levelTotal = 1;
  for (const gc of golden.children ?? []) {
    levelTotal++;
    if (got.children.some((c) => similar(c.title, gc.title ?? ""))) levelRight++;
  }
  // golden 没有能力点，抽取却拆出了一堆 —— 过度切分，同样扣分
  if ((golden.children ?? []).length === 0 && got.children.length > 0) {
    levelTotal += got.children.length;
  }

  return {
    ...base,
    ok: true,
    hallucinated,
    metricTotal: gotMetrics.length,
    missedMetrics,
    missedActions,
    goldenUnits: goldMetrics.length + goldActions.length,
    kindRight,
    kindTotal,
    levelRight,
    levelTotal,
    extractedTitle: got.title,
    childTitles: got.children.map((c) => c.title),
    gotMetricNames: gotMetrics.map((m) => `${m.name}[${m.kind}]`),
    goldenMetricNames: goldMetrics.map((g) => `${g.name}${g.kind ? `[${g.kind}]` : ""}`),
  };
}

// ---- 指标计算 ----

function summarize(rs: CaseResult[]) {
  const ok = rs.filter((r) => r.ok);
  const hall = ok.reduce((n, r) => n + r.hallucinated.length, 0);
  const metrics = ok.reduce((n, r) => n + r.metricTotal, 0);
  const missed = ok.reduce((n, r) => n + r.missedMetrics.length + r.missedActions, 0);
  const units = ok.reduce((n, r) => n + r.goldenUnits, 0);
  const kr = ok.reduce((n, r) => n + r.kindRight, 0);
  const kt = ok.reduce((n, r) => n + r.kindTotal, 0);
  const lr = ok.reduce((n, r) => n + r.levelRight, 0);
  const lt = ok.reduce((n, r) => n + r.levelTotal, 0);
  return {
    hallucination: metrics === 0 ? 0 : hall / metrics,
    miss: units === 0 ? 0 : missed / units,
    kind: kt === 0 ? 1 : kr / kt,
    level: lt === 0 ? 1 : lr / lt,
    hall,
    metrics,
    missed,
    units,
    kr,
    kt,
    lr,
    lt,
  };
}

function render(rs: CaseResult[]): string {
  const s = summarize(rs);
  const gate = (v: boolean) => (v ? "达标" : "**没达标**");
  const L: string[] = [];

  L.push(`# 抽取质量评估 · ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  L.push("");
  L.push(`Pass 2 主用型号：\`${MODEL.strong}\` · 对照集 ${rs.length} 份`);
  L.push(`实际由谁服务：${servedLine()}`);
  L.push("");
  L.push("## 四项指标");
  L.push("");
  L.push("| 指标 | 结果 | 门槛 | 判定 |");
  L.push("|---|---|---|---|");
  L.push(`| 幻觉率 | ${pct(s.hallucination)}（${s.hall} / ${s.metrics}） | 必须 0 | ${gate(s.hall === 0)} |`);
  L.push(`| 漏抽率 | ${pct(s.miss)}（${s.missed} / ${s.units}） | < 20% | ${gate(s.miss < 0.2)} |`);
  L.push(`| kind 准确率 | ${pct(s.kind)}（${s.kr} / ${s.kt}） | > 90% | ${gate(s.kind > 0.9)} |`);
  L.push(`| 切分一致性 | ${pct(s.level)}（${s.lr} / ${s.lt}） | > 80% | ${gate(s.level > 0.8)} |`);
  L.push("");

  const allHall = rs.flatMap((r) => r.hallucinated.map((h) => ({ id: r.id, ...h })));
  L.push("## 幻觉条目");
  L.push("");
  if (allHall.length === 0) {
    L.push("没有。抽出的每一个数字都能在原文里找到。");
  } else {
    L.push("下面每一条的数值都在原文里找不到，是模型编的：");
    L.push("");
    for (const h of allHall) {
      L.push(`- \`${h.id}\` · **${h.metric}** —— 原文中没有：${h.numbers.join("、")}`);
    }
  }
  L.push("");

  L.push("## 逐条差异");
  L.push("");
  for (const r of rs) {
    L.push(`### ${r.id}`);
    L.push("");
    if (!r.ok) {
      L.push(`抽取失败：${r.error}`);
      L.push("");
      continue;
    }
    L.push(`- 抽出的标题：${r.extractedTitle}`);
    L.push(
      `- 能力点：抽出 ${r.childTitles.length} 个${r.childTitles.length ? `（${r.childTitles.join("、")}）` : ""}` +
        ` · 对照集 ${r.goldenChildTitles.length} 个${r.goldenChildTitles.length ? `（${r.goldenChildTitles.join("、")}）` : ""}`,
    );
    L.push(`- 指标：抽出 ${r.metricTotal} 条 · kind 判对 ${r.kindRight}/${r.kindTotal}`);
    L.push(`  - 抽出的：${r.gotMetricNames.join("、") || "（无）"}`);
    L.push(`  - 对照集：${r.goldenMetricNames.join("、") || "（无）"}`);
    if (r.missedMetrics.length > 0) {
      L.push(`- 漏掉的指标：${r.missedMetrics.join("、")}`);
      L.push(
        "  - 对照一下上面两行：名字不同但说的是同一件事，那是对照集的叫法要改，不是模型漏抽。",
      );
    }
    if (r.missedActions > 0) L.push(`- 漏掉的行动：${r.missedActions} 条`);
    if (r.hallucinated.length > 0) {
      L.push(`- **幻觉 ${r.hallucinated.length} 条**：${r.hallucinated.map((h) => h.metric).join("、")}`);
    }
    L.push("");
  }
  return L.join("\n");
}

// ---- 小工具 ----

// 抠出所有数字（含小数、含百分号前的数）
function numbersIn(s: string): string[] {
  return [...new Set((s.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => n !== "0"))];
}

// 原文里找这个数。允许千分位逗号被去掉后再找一次。
function sourceHas(source: string, n: string): boolean {
  if (source.includes(n)) return true;
  return source.replace(/,/g, "").includes(n);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s，。、·:：（）()「」【】"'-]/g, "");
}

// 指标名匹配：一方包含另一方，或者去掉修饰后相等
function similar(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === "" || y === "") return false;
  return x === y || x.includes(y) || y.includes(x);
}

// 行动是否被覆盖：golden 行动里的实词有一半以上出现在抽取结果里就算命中
function coversAction(gotText: string, goldAction: string): boolean {
  const got = norm(gotText);
  const words = norm(goldAction).match(/[一-龥]{2}|[a-z0-9]+/g) ?? [];
  if (words.length === 0) return true;
  const hits = words.filter((w) => got.includes(w)).length;
  return hits / words.length >= 0.5;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
