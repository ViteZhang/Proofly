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
import {
  authoritativeYears,
  c6FactDrift,
  labelledValue,
  rulesAgainstDisclosure,
  scanSource,
  statedCities,
  statedYears,
  textSources,
} from "../src/lib/health/c6-fact-drift";
import {
  appearancesByAtom,
  c7CrossTarget,
  conflictingNumbers,
  normalizeNumber,
  verbStrength,
} from "../src/lib/health/c7-cross-target";
import {
  EXCERPT_LIMIT,
  MIN_SOURCES,
  atomsToScan,
  buildConflictIssues,
  levelOfSeverity,
  sourceExcerptsJson,
  usable,
} from "../src/lib/health/c8-conflict";
import { CONFLICT_SYSTEM, conflictUser } from "../src/lib/llm/health-prompts";
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
    skills: [{ id: "s9", label: "Multi-Agent 编排", evidenceStrength: "none", atomIds: ["a7"] }],
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
  check("7b · C2 跳到挂了这个技能的经历", c2[0]?.resolveLink === "/library?atom=a7&highlight=skills", c2[0]?.resolveLink);

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

// ============ C6 ============
console.log("\n【C6 文本产物与事实台账对不上】");
{
  const fact = (key: string, value: string | null, label: string, rule: string | null = null) => ({
    id: `f-${key}`,
    key,
    label,
    value,
    status: "RESOLVED" as const,
    conflicts: [],
    disclosureRule: rule,
  });

  const facts = [
    fact("years_of_experience", "10 年", "工作年限"),
    fact("location", "北京", "常驻地"),
    fact("name", "张昭", "姓名"),
    fact("phone", "13800138000", "手机"),
    fact("email", "zhang@example.com", "邮箱"),
    fact("entity_disclosure", "北京润泽园科技有限公司", "主体披露口径", "不主动披露公司主体，只写行业"),
  ];

  const src = (over: Partial<Parameters<typeof scanSource>[1]>) => ({
    kind: "baseline" as const,
    id: "b1",
    where: "C 端 AI 应用 · 基线",
    text: "",
    resolveLink: "/resume?target=t1",
    ...over,
  });

  // 验收 1 · 年限：台账 10 年，简历写 8 年互联网 PM
  const y = scanSource(ctx({ facts }), src({ text: "8 年互联网 PM，主导过三个 0 到 1 的项目。" }));
  check("1a · 年限不符被检出", y.length === 1, `${y.length} 条`);
  check("1b · 简历产物里是阻断级", y[0]?.level === "blocking");
  check("1c · 两边的数都写进标题", y[0]?.title.includes("8 年") && y[0]?.title.includes("10 年"), y[0]?.title);

  check("1d · ±1 之内不报", scanSource(ctx({ facts }), src({ text: "9 年产品经验" })).length === 0);
  check("1e · 差 2 年就报", scanSource(ctx({ facts }), src({ text: "8 年产品经验" })).length === 1);
  check("1f · 「项目做了 2 年，产品上线」不是资历", statedYears("项目做了 2 年，产品上线") .length === 0);
  check("1g · 「10 年从业」正常识别", statedYears("10 年从业经历").includes(10));
  check("1h · 台账值带单位也能取数", authoritativeYears("10 年") === 10);

  // 验收 2 · 常驻地：台账北京，经历 situation 里写常驻新加坡
  const loc = scanSource(
    ctx({ facts }),
    src({ kind: "atom", id: "a1", where: "经历「知识宇宙」", text: "常驻新加坡，远程协作。", resolveLink: "/library?atom=a1" }),
  );
  check("2a · 常驻地不符被检出", loc.length === 1, `${loc.length} 条`);
  check("2b · 经历字段是警告级，不是阻断", loc[0]?.level === "warning", loc[0]?.level);
  check("2c · 跳转到那条经历", loc[0]?.resolveLink === "/library?atom=a1");
  check("2d · 裸城市名不报", statedCities("北京大学毕业，上海分公司做过项目").length === 0);
  check("2e · 带标记词才认", statedCities("常驻新加坡").join() === "新加坡");
  check("2f · base 在 也认", statedCities("base 在杭州").join() === "杭州");
  check("2g · 与权威值一致的位置不报", scanSource(ctx({ facts }), src({ text: "常驻北京" })).length === 0);

  // 验收 4 · 主体披露
  const ent = scanSource(ctx({ facts }), src({ text: "任职于北京润泽园科技有限公司，负责 AI 方向。" }));
  check("4a · 不主动披露时出现主体全称被检出", ent.length === 1, `${ent.length} 条`);
  check("4b · 阻断级", ent[0]?.level === "blocking");
  check("4c · detail 里写清规则原文", ent[0]?.detail.includes("不主动披露公司主体"));
  check(
    "4d · 规则没说不披露就不报",
    scanSource(
      ctx({ facts: [fact("entity_disclosure", "北京润泽园科技有限公司", "主体披露口径", "可以写全称")] }),
      src({ text: "任职于北京润泽园科技有限公司" }),
    ).length === 0,
  );
  check("4e · 规则识别", rulesAgainstDisclosure("不主动披露") && !rulesAgainstDisclosure("随便写"));

  // 手机 / 邮箱
  const ph = scanSource(ctx({ facts }), src({ text: "联系方式 13900139000，邮箱 old@example.com" }));
  check("2h · 手机与邮箱不符各报一条", ph.length === 2, `${ph.length} 条`);
  check("2i · 与权威值一致的联系方式不报", scanSource(ctx({ facts }), src({ text: "13800138000 zhang@example.com" })).length === 0);

  // 姓名与其余 key：只认明确标注
  check("2j · 「姓名：李四」被检出", scanSource(ctx({ facts }), src({ text: "姓名：李四" })).length === 1);
  check("2k · 自由文本里的人名不猜", scanSource(ctx({ facts }), src({ text: "和李四一起做的这个项目" })).length === 0);
  check("2l · 标注解析", labelledValue("姓名：李四，手机：x", "姓名") === "李四");

  // 源文档降级
  const doc = scanSource(
    ctx({ facts }),
    src({ kind: "doc", id: "d1", where: "源材料《旧简历.pdf》", text: "常驻上海", resolveLink: "/import" }),
  );
  check("2m · 源文档统一降为警告", doc[0]?.level === "warning");
  check("2n · 源文档文案说清改不改都行", doc[0]?.detail.includes("改不改都行"), doc[0]?.detail.slice(-60));

  // 扫描范围
  const wide = textSources(
    ctx({
      resumes: [
        { kind: "baseline", id: "b1", targetId: "t1", targetName: "T", label: "T · 基线", renderedMd: "# x", blocks: [] },
        { kind: "version", id: "v1", targetId: "t1", targetName: "T", label: "T · 星岚", renderedMd: "# y", blocks: [] },
      ],
      atoms: [atom({ id: "a1", situation: "背景", task: "目标", actions: ["做了事"] })],
      sourceDocs: [{ id: "d1", filename: "旧简历.pdf", parsedText: "正文", ingestedAt: null }],
      interviewOutlines: [{ id: "q1", atomId: "a1", text: "先说背景" }],
    }),
  );
  check(
    "2o · 五类产物都在扫描范围内",
    new Set(wide.map((w) => w.kind)).size === 5,
    wide.map((w) => w.kind).join(),
  );
  check("2p · 没有正文的产物不进列表", textSources(ctx({ atoms: [atom({ id: "a9" })] })).length === 0);

  const viaCheck = await run(c6FactDrift, ctx({ facts, atoms: [atom({ id: "a1", situation: "常驻新加坡" })] }));
  check("2q · 走 HealthCheck 接口也一致", viaCheck.length === 1 && viaCheck[0].code === "C6");
  check("2r · 指纹按 key + 产物稳定", viaCheck[0].fingerprint === "C6:location:atom:a1");
}

// ============ C7 ============
console.log("\n【C7 跨方向简历一致性】");
{
  const resume = (
    id: string,
    targetId: string,
    label: string,
    blocks: { id: string; atomId: string | null; renderedText: string | null }[],
  ) => ({ kind: "baseline" as const, id, targetId, targetName: label, label, renderedMd: null, blocks });

  const two = (textA: string, textB: string) =>
    ctx({
      atoms: [atom({ id: "a1", title: "AI 成长陪伴助手" })],
      resumes: [
        resume("b1", "t1", "C 端 AI 应用 · 基线", [{ id: "k1", atomId: "a1", renderedText: textA }]),
        resume("b2", "t2", "AI Agent 平台 · 基线", [{ id: "k2", atomId: "a1", renderedText: textB }]),
      ],
    });

  // 验收 15 · 主导 vs 参与 → 检出，阻断
  const v = await run(c7CrossTarget, two(
    "主导 AI 模块从 0 到 1，设计 Multi-Agent 意图路由架构",
    "参与 AI 模块规划，协助设计意图路由方案",
  ));
  check("15a · 动词跨级被检出", v.length === 1, `${v.length} 条`);
  check("15b · 阻断级", v[0]?.level === "blocking");
  check("15c · 强度差写清楚", v[0]?.detail.includes("强度差 2 级"), v[0]?.detail.slice(-80));

  // 验收 16 · 主导 vs 负责 → 不报（同级）
  check(
    "16 · 同级替换不报",
    (await run(c7CrossTarget, two("主导 AI 模块从 0 到 1", "负责 AI 模块从 0 到 1"))).length === 0,
  );

  // 验收 17 · 75% vs 70% → 检出
  const n = await run(c7CrossTarget, two("主导 AI 模块，人效提升 75%", "主导 AI 模块，人效提升 70%"));
  check("17a · 数字不一致被检出", n.length === 1, `${n.length} 条`);
  check("17b · 两个数都写进 detail", n[0]?.detail.includes("75") && n[0]?.detail.includes("70"));
  check("17c · 阻断级", n[0]?.level === "blocking");

  // 验收 18 · expand 三个数字 vs brief 一个 → 不报
  check(
    "18 · 只比对同时出现的数字",
    (await run(c7CrossTarget, two(
      "主导 AI 模块，人效提升 75%，团队 12 人，迭代 8 次",
      "主导 AI 模块，人效提升 75%",
    ))).length === 0,
  );
  check(
    "18b · 共同单位里有一个对得上就不算冲突",
    conflictingNumbers("提升 75%，留存 5%", "提升 75%").length === 0,
  );
  check(
    "18c · 共同单位全对不上才报",
    conflictingNumbers("提升 75%", "提升 70%").length === 1,
  );

  // 验收 19 · detail 列出两处原文
  check("19a · detail 含 A 方向原文", v[0]?.detail.includes("主导 AI 模块从 0 到 1，设计 Multi-Agent 意图路由架构"));
  check("19b · detail 含 B 方向原文", v[0]?.detail.includes("参与 AI 模块规划，协助设计意图路由方案"));
  check("19c · 两处都标了是哪个方向", v[0]?.detail.includes("C 端 AI 应用 · 基线") && v[0]?.detail.includes("AI Agent 平台 · 基线"));

  // 验收 30 · 跳转能同时看到两个方向
  check("30 · 跳转带 compare", v[0]?.resolveLink === "/resume?target=t1&block=k1&compare=t2", v[0]?.resolveLink);

  // 边界
  check("15d · 取最先出现的动词，不是最强的", verbStrength("参与 AI 模块规划，协助设计意图路由方案")?.verb === "参与");
  check("15d2 · 开头就是最强动词时照取", verbStrength("主导并参与了设计")?.verb === "主导");
  check("15e · 没有职责动词就不判", verbStrength("AI 模块从 0 到 1") === null);
  check("18d · 裸数字不参与比对", conflictingNumbers("迭代 8 次做了 3 版", "迭代 8 次做了 5 版").length === 0);
  check("18e · 归一化去空格与全角", normalizeNumber(" 75 ％") === "75%");
  check(
    "15f · 同一方向的基线与投递版本不比",
    (await run(c7CrossTarget, ctx({
      atoms: [atom({ id: "a1" })],
      resumes: [
        resume("b1", "t1", "C 端 · 基线", [{ id: "k1", atomId: "a1", renderedText: "主导 AI 模块" }]),
        { ...resume("v1", "t1", "C 端 · 星岚", [{ id: "k2", atomId: "a1", renderedText: "参与 AI 模块" }]), kind: "version" as const },
      ],
    }))).length === 0,
  );
  check(
    "15g · 只在一个方向出现的经历不比",
    (await run(c7CrossTarget, ctx({
      atoms: [atom({ id: "a1" })],
      resumes: [resume("b1", "t1", "C 端 · 基线", [{ id: "k1", atomId: "a1", renderedText: "主导 AI 模块" }])],
    }))).length === 0,
  );
  check(
    "15h · 同一份简历里同一经历的多块只取第一块",
    appearancesByAtom(ctx({
      resumes: [resume("b1", "t1", "C 端 · 基线", [
        { id: "k1", atomId: "a1", renderedText: "主导" },
        { id: "k2", atomId: "a1", renderedText: "参与" },
      ])],
    })).get("a1")?.length === 1,
  );
  check("15i · 指纹按经历 + 两个方向稳定", v[0]?.fingerprint === "C7:verb:a1:t1:t2");
}

// ============ C8 ============
console.log("\n【C8 语义冲突深扫】");
{
  // 验收 24 · 只关联 1 个源文档的经历跳过
  const c = ctx({
    atoms: [
      atom({ id: "a1", title: "知识宇宙", sourceDocIds: ["d1", "d2"] }),
      atom({ id: "a2", title: "单一来源的", sourceDocIds: ["d1"] }),
      atom({ id: "a3", title: "没有来源的", sourceDocIds: [] }),
    ],
    sourceDocs: [
      { id: "d1", filename: "项目全景档案.md", parsedText: "用的是通义千问", ingestedAt: "2026-01-01T00:00:00Z" },
      { id: "d2", filename: "简历项目档案.md", parsedText: "接的 OpenAI", ingestedAt: "2026-05-01T00:00:00Z" },
    ],
  });
  const scan = atomsToScan(c);
  check("24a · 只有多来源的经历才扫", scan.length === 1 && scan[0].id === "a1", scan.map((a) => a.id).join());
  check("24b · 门槛是 2 份", MIN_SOURCES === 2);

  // 上传时间必须进输入：它是「进展还是矛盾」的唯一依据
  const ex = sourceExcerptsJson(c, scan[0]);
  check("21a · 源材料片段带上传时间", ex.includes("2026-01-01") && ex.includes("2026-05-01"));
  check("21b · 片段带文档名", ex.includes("项目全景档案.md"));
  check("21c · 超长正文被截断", sourceExcerptsJson(
    ctx({ sourceDocs: [{ id: "d1", filename: "x", parsedText: "啊".repeat(9000), ingestedAt: null }] }),
    atom({ sourceDocIds: ["d1"] }),
  ).length < EXCERPT_LIMIT * 2);

  // 验收 20 · high → 警告
  const a1 = c.atoms[0];
  const high = buildConflictIssues(a1, [{
    subject: "知识宇宙所用的大模型",
    severity: "high",
    statements: [
      { source: "项目全景档案.md", claim: "用的是通义千问" },
      { source: "简历项目档案.md", claim: "接的 OpenAI" },
    ],
    why_conflict: "同一个技术选型两种说法",
    suggested_action: "回想一下实际用的是哪个，改掉另一处",
  }]);
  check("20a · high 归警告级", high.issues[0]?.level === "warning", high.issues[0]?.level);
  check("20b · 两处说法都列出来", high.issues[0]?.detail.includes("通义千问") && high.issues[0]?.detail.includes("OpenAI"));
  check("20c · 带来源文档名", high.issues[0]?.detail.includes("项目全景档案.md"));
  check("20d · 给了建议", high.issues[0]?.detail.includes("建议："));
  check("20e · 文案承认可能误报", high.issues[0]?.detail.includes("可能有误报"));
  check("20f · 跳转到那条经历", high.issues[0]?.resolveLink === "/library?atom=a1");
  check("20g · 指纹按经历 + 主题稳定", high.issues[0]?.fingerprint === "C8:a1:知识宇宙所用的大模型");

  // 验收 25 · C8 不产生阻断
  const levels = ["high", "HIGH", " high ", "medium", "low", "乱写的"].map(levelOfSeverity);
  check("25a · 任何严重度都不是阻断", levels.every((l) => l !== "blocking"), levels.join());
  check("25b · medium / low 归提示", levelOfSeverity("medium") === "info" && levelOfSeverity("low") === "info");
  check("25c · 大小写与空格不影响 high 的判定", levelOfSeverity(" HIGH ") === "warning");
  check("25d · 认不出的严重度按提示走，不按警告", levelOfSeverity("严重") === "info");

  // 只给一处说法的「矛盾」没法核对
  const one = buildConflictIssues(a1, [{
    subject: "某件事", severity: "high",
    statements: [{ source: "A", claim: "只有这一处" }],
    why_conflict: "", suggested_action: "",
  }]);
  check("20h · 只给一处说法的丢弃", one.issues.length === 0 && one.dropped.length === 1);
  check("20i · 丢弃时说清为什么", one.dropped[0].includes("没法核对"));
  check("20j · usable 认两处非空说法", usable({
    subject: "x", severity: "high",
    statements: [{ source: "", claim: "a" }, { source: "", claim: "b" }],
    why_conflict: "", suggested_action: "",
  }));
  check("20k · 空说法不算数", !usable({
    subject: "x", severity: "high",
    statements: [{ source: "", claim: "a" }, { source: "", claim: "  " }],
    why_conflict: "", suggested_action: "",
  }));

  // 验收 21 22 23 交给模型判 —— 这里只守住「提示词逐字落码」这条底线。
  // 第四节全文 1038 字节，改一个字这里就红。
  check("C8-p1 · System 提示词长度与第四节原文一致", CONFLICT_SYSTEM.length === 1038, `${CONFLICT_SYSTEM.length}`);
  check("C8-p2 · 误报代价那一段在", CONFLICT_SYSTEM.includes("**拿不准就不报。**"));
  check("C8-p3 · 时间推移不算矛盾那一条在", CONFLICT_SYSTEM.includes("这是进展不是矛盾"));
  check("C8-p4 · 「最后一条最容易误报」在", CONFLICT_SYSTEM.includes("**最后一条最容易误报。**"));
  check("C8-p5 · 不许凑数那一句在", CONFLICT_SYSTEM.includes("**不要为了显得有用而凑数。**"));
  check("C8-p6 · 详略与视角差异不算矛盾", CONFLICT_SYSTEM.includes("详略不同") && CONFLICT_SYSTEM.includes("视角不同"));
  const u = conflictUser({ atomJson: "A", sourceExcerptsJson: "B", resumeTextsJson: "C" });
  check("C8-p7 · User 三个占位都替换了", u.includes("A") && u.includes("B") && u.includes("C") && !u.includes("{{"));
  // 原文 208 字节，减去三个占位符本身（13 + 24 + 21），空变量代入后应是 150。
  const empty = conflictUser({ atomJson: "", sourceExcerptsJson: "", resumeTextsJson: "" });
  check("C8-p8 · User 模板与第四节原文逐字一致", empty.length === 150, `${empty.length}`);
  check("C8-p9 · 三段小字说明都在", ["每条含：文档名、上传时间、原文片段。", "每条含：所属求职方向、简历中的原文。"].every((x) => empty.includes(x)));
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
