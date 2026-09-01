// =============================================================
// Proofly · 体检快扫判定探针
//
//   pnpm health:probe
//
// 覆盖《Step 8》验收 6–13、42 的判定部分，以及状态条文案与忽略规则。
// 不连库、不调模型——快扫本来就该是纯判定，那它就该能脱库单测。
// 「跑一次快扫看零 LLM 调用」这种要连库的验收留给真调。
// =============================================================

import { c1Facts } from "../src/lib/health/c1-facts";
import { c2Skills, c3Wording, c4NeverSay, c5Exclusive } from "../src/lib/health/c2-c5-gate";
import { c9Stale, daysSince } from "../src/lib/health/c9-stale";
import { c10Method, methodMissing } from "../src/lib/health/c10-method";
import { QUICK_CHECKS } from "../src/lib/health/registry";
import { bannerOf, buildReport } from "../src/lib/health/report";
import type { HealthContext, HealthIssue } from "../src/lib/health/types";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `  —— ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-09-01T00:00:00Z");

function ctx(over: Partial<HealthContext> = {}): HealthContext {
  return {
    facts: [],
    atoms: [],
    skills: [],
    targets: [],
    resumes: [],
    sourceDocs: [],
    gateRows: [],
    interviewOutlines: [],
    now: NOW,
    ...over,
  };
}

function atom(over: Partial<HealthContext["atoms"][number]> = {}) {
  return {
    id: "a1",
    title: "润泽园 AI 助手",
    org: "润泽园",
    role: "产品经理",
    status: "shipped",
    evidenceLevel: "measured" as const,
    situation: null,
    task: null,
    actions: [],
    periodStart: null,
    periodEnd: null,
    metrics: [],
    updatedAt: "2026-08-01T00:00:00Z",
    sourceDocIds: [],
    ...over,
  };
}

function metric(over: Partial<HealthContext["atoms"][number]["metrics"][number]> = {}) {
  return {
    id: "m1",
    name: "人效提升",
    kind: "outcome" as const,
    fromValue: null,
    toValue: null,
    delta: "75%",
    method: "按周活跃算，对比上线前四周均值",
    evidenceLevel: "measured" as const,
    ...over,
  };
}

const run = async (c: (typeof QUICK_CHECKS)[number], x: HealthContext) => c.run(x);

// ============ C1 ============
console.log("\n【C1 事实层 BLOCKING】");
{
  const out = await run(c1Facts, ctx({
    facts: [
      {
        id: "f1",
        key: "location",
        label: "常驻地",
        value: null,
        status: "BLOCKING",
        conflicts: [
          { value: "北京", source: "旧简历.pdf" },
          { value: "新加坡", source: "项目全景档案.md" },
        ],
        disclosureRule: null,
      },
      {
        id: "f2",
        key: "name",
        label: "姓名",
        value: "张三",
        status: "RESOLVED",
        conflicts: [],
        disclosureRule: null,
      },
    ],
  }));
  check("6a · BLOCKING 的事实被检出，RESOLVED 的不报", out.length === 1, `${out.length} 条`);
  check("6b · 阻断级", out[0]?.level === "blocking");
  check("6c · detail 列出 conflict_log 各方说法", out[0].detail.includes("北京") && out[0].detail.includes("新加坡"));
  check("6d · 说法带上来源文档名", out[0].detail.includes("旧简历.pdf"));
  check("6e · 跳转直达该字段", out[0].resolveLink === "/facts?key=location&highlight=1");
  check("6f · 指纹按 key 稳定，不含行 id", out[0].fingerprint === "C1:location");
}

// ============ C2–C5 汇总 ============
console.log("\n【C2–C5 从门禁汇总】");
{
  const base = ctx({
    skills: [{ id: "s9", label: "Multi-Agent 编排", evidenceStrength: "none" }],
    resumes: [
      {
        kind: "baseline",
        id: "b1",
        targetId: "t1",
        targetName: "C 端 AI 应用",
        label: "C 端 AI 应用 · 基线",
        renderedMd: null,
        blocks: [],
      },
    ],
    gateRows: [
      { id: "g-a", code: "G5", level: "blocking", title: "技能栏里有拿不出证明的标签「Multi-Agent 编排」", detail: "d", owner: "baseline:b1", blockId: null },
      { id: "g-b", code: "G1", level: "blocking", title: "措辞与证明度不符", detail: "d", owner: "baseline:b1", blockId: "blk1" },
      { id: "g-c", code: "G3", level: "blocking", title: "出现了来源经历里没有的数字：73.6%", detail: "d", owner: "baseline:b1", blockId: "blk2" },
      { id: "g-d", code: "G2", level: "blocking", title: "触发护栏禁词「创业」", detail: "d", owner: "baseline:b1", blockId: "blk3" },
      { id: "g-e", code: "G6", level: "blocking", title: "互斥组「AI 项目」有 2 条经历同时出现", detail: "d", owner: "baseline:b1", blockId: null },
      { id: "g-f", code: "G4", level: "blocking", title: "基本事实「location」还没定下来", detail: "d", owner: "baseline:b1", blockId: null },
      { id: "g-g", code: "G1", level: "pass", title: "通过", detail: null, owner: "baseline:b1", blockId: null },
    ],
  });

  const c2 = await run(c2Skills, base);
  check("7a · C2 从 G5 汇总出一条", c2.length === 1, `${c2.length} 条`);
  check("7b · C2 跳转带 skill id", c2[0]?.resolveLink === "/library?tab=skills&skill=s9", c2[0]?.resolveLink);

  const c3 = await run(c3Wording, base);
  check("8a · C3 收 G1 与 G3 两类", c3.length === 2, `${c3.length} 条`);
  check("8b · C3 跳转带 target 与 block", c3[0]?.resolveLink === "/resume?target=t1&block=blk1", c3[0]?.resolveLink);
  check("8c · 标题带上是哪份简历", c3[0]?.title.startsWith("C 端 AI 应用 · 基线："), c3[0]?.title);

  const c4 = await run(c4NeverSay, base);
  check("9a · C4 从 G2 汇总", c4.length === 1 && c4[0].title.includes("创业"));

  const c5 = await run(c5Exclusive, base);
  check("10a · C5 从 G6 汇总", c5.length === 1);
  check("10b · 级别照抄门禁，不在这里改判", c5[0]?.level === "blocking", c5[0]?.level);
  check("10c · C5 跳转到方向策略", c5[0]?.resolveLink === "/targets/strategy?target=t1&section=strategy", c5[0]?.resolveLink);

  const all = [...c2, ...c3, ...c4, ...c5];
  check("7c · G4 不被汇总，留给 C1 出", all.every((i) => !i.title.includes("基本事实")));
  check("7d · pass 行不进问题列表", all.every((i) => i.title !== "通过"));
  check(
    "7e · 门禁行换 id 后指纹不变",
    (await run(c4NeverSay, { ...base, gateRows: base.gateRows.map((g) => ({ ...g, id: `${g.id}-new` })) }))[0]
      .fingerprint === c4[0].fingerprint,
  );
}

// ============ C9 ============
console.log("\n【C9 开发中且长期未更新】");
{
  const out = await run(c9Stale, ctx({
    atoms: [
      atom({ id: "a1", title: "知识宇宙", status: "in_dev", updatedAt: "2026-06-28T00:00:00Z" }),
      atom({ id: "a2", title: "刚动过的", status: "in_dev", updatedAt: "2026-08-20T00:00:00Z" }),
      atom({ id: "a3", title: "已上线的老项目", status: "shipped", updatedAt: "2024-01-01T00:00:00Z" }),
    ],
  }));
  check("11a · 65 天未更新的 in_dev 被检出", out.length === 1 && out[0].refIds[0] === "a1", `${out.length} 条`);
  check("11b · 提示级", out[0]?.level === "info");
  check("11c · 天数写进标题", out[0]?.title.includes("65 天"), out[0]?.title);
  check("11d · 60 天整不报，超过才报", daysSince("2026-07-03T00:00:00Z", NOW) === 60);
  check("11e · 跳转到经历并定位指标区", out[0]?.resolveLink === "/library?atom=a1&highlight=metrics");
}

// ============ C10 ============
console.log("\n【C10 实测指标没记口径】");
{
  const withGap = ctx({
    atoms: [
      atom({
        id: "a1",
        metrics: [
          metric({ id: "m1", name: "人效提升", method: null }),
          metric({ id: "m2", name: "留存", method: "  " }),
          metric({ id: "m3", name: "凑数的", method: "估算" }),
          metric({ id: "m4", name: "写全了的", method: "按周活跃算，对比上线前四周" }),
          metric({ id: "m5", name: "估算档", evidenceLevel: "estimated", method: null }),
        ],
      }),
    ],
  });
  const out = await run(c10Method, withGap);
  check("12a · 空 / 空白 / 太短的实测指标都检出", out.length === 3, `${out.length} 条`);
  check("12b · 提示级", out.every((i) => i.level === "info"));
  check("12c · 「估算」两个字不算口径", out.some((i) => i.title.includes("凑数的")));
  check("12d · 写全口径的不报", !out.some((i) => i.title.includes("写全了的")));
  check("12e · 非 measured 档不归 C10 管", !out.some((i) => i.title.includes("估算档")));
  check("12f · detail 说清面试官会问什么", out[0].detail.includes("分母是什么"));
  check("12g · 跳转带 metric id", out[0].resolveLink === "/library?atom=a1&metric=m1&highlight=metrics");
  check("12h · 指纹按 metric 稳定", out[0].fingerprint === "C10:m1");

  // 13 · 补上口径后重新扫描该项消失
  const fixed = await run(c10Method, ctx({
    atoms: [atom({ id: "a1", metrics: [metric({ id: "m1", method: "按周活跃用户算，对比上线前四周均值" })] })],
  }));
  check("13 · 补上 method 后该项消失", fixed.length === 0, `${fixed.length} 条`);
  check("12i · 边界：口径正好 5 字不报", !methodMissing(metric({ method: "周活跃口径" })));
  check("12j · 边界：口径 4 字仍报", methodMissing(metric({ method: "周活跃" })));
}

// ============ 报告组装 ============
console.log("\n【报告与状态条】");
{
  const ran = QUICK_CHECKS.map((c) => ({ code: c.code, label: c.label }));
  const mk = (code: string, level: HealthIssue["level"], fp: string): HealthIssue => ({
    code,
    level,
    title: `${code} 的问题`,
    detail: "",
    refIds: [],
    resolveLink: "/health",
    fingerprint: fp,
  });

  const r1 = buildReport([mk("C1", "blocking", "f1"), mk("C4", "blocking", "f2"), mk("C9", "info", "f3"), mk("C10", "info", "f4"), mk("C5", "warning", "f5")], [], ran);
  check("27a · 阻断计数", r1.blockingCount === 2);
  check("27b · 小问题计数含警告与提示", r1.minorCount === 3);
  const b1 = bannerOf(r1);
  check("27c · 红底文案", b1.kind === "blocked" && b1.headline === "有 2 处必须解决，简历生成已经暂停");
  check("27d · 副行带小问题数", b1.sub === "另外还有 3 处小问题，建议一起看看");

  const r2 = buildReport([mk("C9", "info", "f3")], [], ran);
  check("27e · 只有小问题时是橙底文案", bannerOf(r2).kind === "minor" && bannerOf(r2).headline === "1 处小问题，建议看看");

  const r3 = buildReport([], [], ran);
  check("28a · 全通过", bannerOf(r3).kind === "clear" && bannerOf(r3).headline === "一切正常，可以放心投");
  check("28b · 通过项列出全部跑过的检查", r3.passed.length === QUICK_CHECKS.length, `${r3.passed.length}`);

  const r4 = buildReport([mk("C9", "info", "f3"), mk("C10", "info", "f4")], [{ fingerprint: "f3", reason: "这项目确实停了" }], ran);
  check("31a · 忽略的不计入小问题数", r4.minorCount === 1);
  check("31b · 忽略的进「已忽略」分组", r4.ignored.length === 1 && r4.ignored[0].ignoreReason === "这项目确实停了");
  check("31c · 被忽略的 code 若还有别的问题，不算通过项", !r4.passed.some((p) => p.code === "C10"));
  check("31d · 整类都被忽略时算通过项", r4.passed.some((p) => p.code === "C9"));

  const r5 = buildReport([mk("C1", "blocking", "f9")], [{ fingerprint: "f9", reason: "我不想管" }], ran);
  check("32 · 阻断级即使库里有忽略记录也不认", r5.blockingCount === 1 && r5.ignored.length === 0);

  check("33 · 通过项按登记顺序", r3.passed[0].code === "C1" && r3.passed[0].label === "基本事实没有待定项");
}

console.log(`\n${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
