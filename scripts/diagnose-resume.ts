// =============================================================
// Proofly · 简历质量诊断（只读）
//
//   pnpm diagnose:resume -- --email you@example.com --password ****
//   pnpm diagnose:resume -- --email … --password … --baseline <uuid>
//
// 输出一份 Markdown 报告到 stdout，一个字都不写库。
//
// 为什么要先有它：现在无法回答「60 条 metrics 是不是覆盖了原始材料里的
// 全部数字」。如果摄入端也在漏，后面所有生成端的优化都建在缺失的原料上。
// 同时这份脚本产出的四个数是 P1 的验收基准 —— 没有基线就没有「改好了」。
//
// 越权由 RLS 兜底，不靠脚本自觉：它用匿名 key 登录成本人，读到的就是
// 本人那一份。这里没有 service role key，也不该有。
// =============================================================

import { createClient } from "@supabase/supabase-js";

import { TOTAL_BULLET_BUDGET } from "../src/lib/targets/rank";
import { period } from "../src/lib/profile/labels";
import {
  numbersIn,
  pct,
  qualityReport,
  type QualityAtom,
  type QualityBlock,
} from "../src/lib/resume/quality";
import { curateSkills } from "../src/lib/skills/taxonomy";
import type { LayoutEmployment } from "../src/lib/resume/layout";
import type { EvidenceLevel } from "../src/types/database";

/**
 * 人工核对清单。
 *
 * 这些数字来自人工写的那份简历。它们在不在库里，决定了「生成端优化」
 * 是不是建在完整的原料上。模糊匹配只做提示，判定以人工确认为准 ——
 * 一个自动判成「在库」的结论会让人跳过核对，而那正是要核对的东西。
 */
const EXPECTED = [
  "12 万 MAU",
  "DAU/MAU 21.4% → 32.2%",
  "平均 DAU 31,831 → 37,082",
  "次日留存 24.2% → 34.8%",
  "次月留存 29.1% → 34.9%",
  "运营团队 12 人 → 4 人",
  "流程错误率 约 30% → 3% 以下",
  "单个测评研发效率 +500%",
  "APP 下载量 +300%",
  "应用商店评分 2.7 → 4.3",
  "新用户付费转化 +30%",
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function die(msg: string): never {
  // 不抛栈：这个脚本的读者是人，不是错误采集器。
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) die("缺 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY，用 --env-file=.env.local 跑");

  const email = arg("email") ?? process.env.DIAG_EMAIL;
  const password = arg("password") ?? process.env.DIAG_PASSWORD;
  if (!email || !password) die("要 --email 与 --password（或 DIAG_EMAIL / DIAG_PASSWORD）。脚本登录成本人，读到的就是本人那一份。");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !auth.user) die(`登录失败：${authErr?.message ?? "账号或密码不对"}`);

  const out: string[] = [];
  out.push(`# 简历质量诊断`);
  out.push("");
  out.push(`账号 \`${email}\`　·　${new Date().toISOString().slice(0, 16).replace("T", " ")}`);

  // ---- ① 抽取覆盖率 ----

  const [{ data: atomRows }, { data: metricRows }] = await Promise.all([
    supabase
      .from("atoms")
      .select("id,title,org,evidence_level,parent_id,employment_id,period_end,sort_order")
      .order("sort_order", { ascending: true }),
    supabase.from("metrics").select("atom_id,name,from_value,to_value,delta,evidence_level"),
  ]);
  const atoms = atomRows ?? [];
  const metrics = metricRows ?? [];
  const titleOf = new Map(atoms.map((a) => [a.id, a.title]));

  out.push("");
  out.push("## ① 抽取覆盖率");
  out.push("");
  out.push(`库里 ${atoms.length} 条经历、${metrics.length} 条指标。`);

  const byAtom = new Map<string, typeof metrics>();
  for (const m of metrics) {
    const list = byAtom.get(m.atom_id) ?? [];
    list.push(m);
    byAtom.set(m.atom_id, list);
  }
  for (const [atomId, list] of byAtom) {
    out.push("");
    out.push(`**${titleOf.get(atomId) ?? atomId}**`);
    out.push("");
    out.push("| 指标 | from | to | delta | 证明度 |");
    out.push("|---|---|---|---|---|");
    for (const m of list) {
      out.push(
        `| ${m.name} | ${m.from_value ?? ""} | ${m.to_value ?? ""} | ${m.delta ?? ""} | ${m.evidence_level} |`,
      );
    }
  }

  // 人工核对清单。模糊匹配只提示，不判定。
  const haystack = metrics
    .map((m) => [m.name, m.from_value, m.to_value, m.delta].filter(Boolean).join(" "))
    .join("\n");
  const known = numbersIn(haystack);
  out.push("");
  out.push("### 人工核对：这些数字在不在库里");
  out.push("");
  out.push("> 判定以人工确认为准。「疑似」只表示数值对得上，不表示是同一条指标。");
  out.push("");
  out.push("| 人工版里的数字 | 自动提示 |");
  out.push("|---|---|");
  for (const line of EXPECTED) {
    const wanted = [...numbersIn(line)];
    const hit = wanted.filter((n) => known.has(n));
    const verdict =
      wanted.length === 0
        ? "—"
        : hit.length === wanted.length
          ? "疑似在库"
          : hit.length > 0
            ? `疑似部分在库（对上 ${hit.join("、")}）`
            : "不在库";
    out.push(`| ${line} | ${verdict} |`);
  }

  // ---- ③ 策略配置盘点（放在②之前，因为②要用它的预算）----

  const [{ data: targets }, { data: strategies }] = await Promise.all([
    supabase.from("targets").select("id,name").order("sort_order", { ascending: true }),
    supabase.from("atom_target_strategy").select("target_id,atom_id,render_weight,strategy_source"),
  ]);
  const projects = atoms.filter((a) => a.parent_id === null);

  out.push("");
  out.push("## ③ 策略配置盘点");
  out.push("");
  out.push("| 方向 | 经历数 | 有记录 | 自动 | 手工 | 档位分布 |");
  out.push("|---|---|---|---|---|---|");
  for (const t of targets ?? []) {
    const rows = (strategies ?? []).filter((s) => s.target_id === t.id);
    const dist = new Map<string, number>();
    for (const r of rows) dist.set(r.render_weight, (dist.get(r.render_weight) ?? 0) + 1);
    const missing = projects.length - rows.length;
    if (missing > 0) dist.set("（默认 brief）", missing);
    out.push(
      `| ${t.name} | ${projects.length} | ${rows.length} | ${rows.filter((r) => r.strategy_source === "auto").length} | ${rows.filter((r) => r.strategy_source === "manual").length} | ${[...dist].map(([k, v]) => `${k} ${v}`).join(" · ")} |`,
    );
  }

  // ---- ② 四项质量基线 ----

  const wantedBaseline = arg("baseline");
  const { data: baselines } = await supabase
    .from("resume_baselines")
    .select("id,target_id,headline,skills,generated_at,locked_at");
  const picked = wantedBaseline
    ? (baselines ?? []).find((b) => b.id === wantedBaseline)
    : (baselines ?? [])[0];

  out.push("");
  out.push("## ② 四项质量基线");

  if (wantedBaseline && !picked) {
    die(`找不到基线 ${wantedBaseline}（也可能它不属于这个账号）`);
  }
  if (!picked) {
    out.push("");
    out.push("这个账号还没有生成过基线，四项指标无从算起。");
  } else {
    const [{ data: blockRows }, { data: empRows }] = await Promise.all([
      supabase
        .from("resume_blocks")
        .select("id,atom_id,section,title,meta,summary,bullets,order_index")
        .eq("baseline_id", picked.id)
        .order("order_index", { ascending: true }),
      supabase.from("employments").select("id,org,title,period_start,period_end"),
    ]);

    const empById = new Map<string, LayoutEmployment>(
      (empRows ?? []).map((e) => [
        e.id,
        {
          id: e.id,
          org: e.org ?? "",
          role: e.title ?? "",
          period: period(e.period_start, e.period_end),
        },
      ]),
    );
    const atomById = new Map(atoms.map((a) => [a.id, a]));

    const blocks: QualityBlock[] = (blockRows ?? []).map((r) => {
      const a = r.atom_id ? atomById.get(r.atom_id) : undefined;
      const emp = a?.employment_id ? empById.get(a.employment_id) ?? null : null;
      return {
        atomId: r.atom_id,
        section: r.section ?? "",
        title: r.title ?? "",
        meta: r.meta ?? "",
        summary: r.summary ?? "",
        bullets: Array.isArray(r.bullets) ? (r.bullets as string[]) : [],
        employment: emp,
        org: emp?.org ?? a?.org ?? null,
      };
    });

    const used = new Set(blocks.map((b) => b.atomId).filter((x): x is string => !!x));
    const qatoms: QualityAtom[] = atoms
      .filter((a) => used.has(a.id))
      .map((a) => ({
        id: a.id,
        title: a.title,
        evidenceLevel: a.evidence_level as EvidenceLevel,
        metricValues: (byAtom.get(a.id) ?? []).flatMap((m) =>
          [m.from_value, m.to_value, m.delta].filter((x): x is string => !!x),
        ),
      }));

    const q = qualityReport(blocks, qatoms, TOTAL_BULLET_BUDGET);

    out.push("");
    out.push(`基线 \`${picked.id}\`　·　生成于 ${picked.generated_at ?? "（未知）"}　·　${blocks.length} 块`);
    out.push("");
    out.push("| 指标 | 值 | 明细 |");
    out.push("|---|---|---|");
    out.push(
      `| 证据利用率 | ${pct(q.evidence.rate)} | ${q.evidence.used} / ${q.evidence.available} 条指标数值出现在简历里 |`,
    );
    out.push(
      `| 量化覆盖率 | ${pct(q.quant.rate)} | measured 来源的 ${q.quant.total} 行里 ${q.quant.withNumber} 行带数字 |`,
    );
    out.push(
      `| 长度利用率 | ${pct(q.length.rate)} | ${q.length.lines} / ${q.length.budget} 行 |`,
    );
    out.push(
      `| 结构正确性 | ${q.structure.ok ? "true" : "false"} | ${
        q.structure.ok
          ? "没有被拆开的任职，也没有重复的公司名"
          : `拆开的任职 ${q.structure.splitEmployments.length} 段；重复公司名 ${q.structure.duplicatedOrg.length} 处`
      } |`,
    );

    if (q.evidence.perAtom.length > 0) {
      out.push("");
      out.push("### 证据利用率 · 逐条经历");
      out.push("");
      out.push("| 经历 | 用上 / 可用 |");
      out.push("|---|---|");
      for (const p of q.evidence.perAtom) {
        out.push(`| ${p.title} | ${p.used} / ${p.available} |`);
      }
    }

    const skills = Array.isArray(picked.skills) ? (picked.skills as string[]) : [];
    out.push("");
    out.push("### 技能栏");
    out.push("");
    out.push(`入库 ${skills.length} 条。按当前分类表整理后：`);
    out.push("");
    for (const g of curateSkills(skills)) {
      out.push(`- **${g.category}**：${g.items.join(" · ")}`);
    }

    const headline = picked.headline ?? "";
    out.push("");
    out.push("### 个人定位段");
    out.push("");
    out.push(`${headline.length} 字　·　${/\d/.test(headline) ? "含数值" : "**不含任何数值**"}`);
    out.push("");
    out.push(`> ${headline || "（空）"}`);
  }

  out.push("");
  console.log(out.join("\n"));
  await supabase.auth.signOut();
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
