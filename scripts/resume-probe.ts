// =============================================================
// Proofly · 选材与渲染探针
//
//   pnpm resume:probe
//
// 覆盖《Step 6》验收 9–13（选材）与导出渲染。不连库、不调模型 ——
// 选材是确定性的，那它就该能脱离模型单独验证。
// 门禁那一组在 pnpm gate:test 里。
// =============================================================

import {
  compareCandidates,
  resolveSelection,
  selectSkills,
  matchesPhrase,
  type SelectableAtom,
  type SelectableSkill,
} from "../src/lib/resume/select";
import { renderMarkdown, exportFilename, groupBySection } from "../src/lib/resume/markdown";
import {
  applyDeltas,
  deltaRatio,
  farOff,
  overThreshold,
  parseDeltas,
  type Delta,
  type DeltaBlock,
} from "../src/lib/resume/delta";
import { containment, refExists, unusedContent, type SourceAtom } from "../src/lib/resume/unused";
import { detectSignals, signatureOf, REPEAT_THRESHOLD } from "../src/lib/resume/evolution";
import type { EvidenceLevel, RenderWeight } from "../src/types/database";

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

function atom(
  id: string,
  weight: RenderWeight,
  evidence: EvidenceLevel = "designed_only",
  group: string | null = null,
  periodEnd: string | null = "2024-01-01",
  sortOrder = 0,
): SelectableAtom {
  return {
    id,
    title: `经历 ${id}`,
    evidenceLevel: evidence,
    periodStart: "2022-01-01",
    periodEnd,
    renderWeight: weight,
    exclusiveGroup: group,
    sortOrder,
  };
}

console.log("\n【选材 · render_weight】");
{
  const { selected, tradeoffs } = resolveSelection([
    atom("a", "expand"),
    atom("b", "omit"),
    atom("c", "one_line"),
  ]);
  check("验收 9｜omit 的经历不出现", !selected.some((a) => a.id === "b"));
  check(
    "验收 9｜omit 的经历进「本版取舍」并说明原因",
    tradeoffs.some((t) => t.kind === "omit" && t.atomId === "b" && t.detail.includes("省略")),
  );
  check("非 omit 的都还在", selected.length === 2);
}

console.log("\n【选材 · 互斥消解】");
{
  // 第一级：render_weight
  const { selected, tradeoffs } = resolveSelection([
    atom("a", "brief", "measured", "AI 产品"),
    atom("b", "expand", "absent", "AI 产品"),
  ]);
  check("验收 11｜同组两条非 omit → 只出现一条", selected.length === 1);
  check("验收 11｜render_weight 是第一优先级，expand 胜出", selected[0].id === "b");
  check(
    "落选原因说的是哪一级规则",
    tradeoffs.some((t) => t.kind === "exclusive" && t.detail.includes("展开权重")),
  );
}
{
  // 第二级：evidence_level
  const { selected, tradeoffs } = resolveSelection([
    atom("a", "brief", "absent", "AI 产品"),
    atom("b", "brief", "estimated", "AI 产品"),
  ]);
  check("权重相同 → 比证明度，estimated 胜过 absent", selected[0].id === "b");
  check(
    "落选原因指向证明度",
    tradeoffs.some((t) => t.detail.includes("证明度更高")),
  );
}
{
  // 第三级：period_end，null 视为最近
  const { selected } = resolveSelection([
    atom("a", "brief", "measured", "AI 产品", "2025-06-01"),
    atom("b", "brief", "measured", "AI 产品", null),
  ]);
  check("权重与证明度都相同 → 比时间，null（至今）视为最近", selected[0].id === "b");
}
{
  const { selected } = resolveSelection([
    atom("a", "brief", "measured", "AI 产品", "2023-01-01"),
    atom("b", "brief", "measured", "AI 产品", "2025-01-01"),
  ]);
  check("时间更近的胜出", selected[0].id === "b");
}
{
  // 三项全平 → 用 sort_order 兜底，结果必须稳定
  const a = atom("a", "brief", "measured", "AI 产品", "2024-01-01", 1);
  const b = atom("b", "brief", "measured", "AI 产品", "2024-01-01", 0);
  const one = resolveSelection([a, b]).selected[0].id;
  const two = resolveSelection([b, a]).selected[0].id;
  check("三项全平 → 结果与输入顺序无关（稳定）", one === two && one === "b");
}
{
  // 验收 12：同两条经历在另一方向未设互斥
  const { selected } = resolveSelection([
    atom("a", "brief", "measured", null),
    atom("b", "brief", "measured", null),
  ]);
  check("验收 12｜另一方向未设互斥 → 两条都出现", selected.length === 2);
}
{
  // omit 必须先出局，不能参与互斥竞争
  const { selected } = resolveSelection([
    atom("a", "omit", "measured", "AI 产品"),
    atom("b", "one_line", "absent", "AI 产品"),
  ]);
  check(
    "omit 的经历不参与互斥竞争（否则它赢了会导致两条都不出现）",
    selected.length === 1 && selected[0].id === "b",
  );
}
{
  const { selected } = resolveSelection([
    atom("a", "expand", "measured", "组一"),
    atom("b", "brief", "measured", "组一"),
    atom("c", "expand", "measured", "组二"),
    atom("d", "brief", "measured", "组二"),
    atom("e", "brief", "measured", null),
  ]);
  check("多个互斥组各自消解，互不影响", selected.length === 3);
}
{
  const order = resolveSelection([
    atom("x", "brief"),
    atom("y", "brief"),
    atom("z", "brief"),
  ]).selected.map((a) => a.id);
  check("互斥消解只做减法，不改变经历列表的既有顺序", order.join(",") === "x,y,z");
}

console.log("\n【选材 · 比较函数】");
{
  check(
    "expand 排在 brief 前",
    compareCandidates(atom("a", "expand"), atom("b", "brief")) < 0,
  );
  check(
    "measured 排在 designed_only 前",
    compareCandidates(atom("a", "brief", "measured"), atom("b", "brief", "designed_only")) < 0,
  );
}

console.log("\n【技能栏】");
{
  const skills: SelectableSkill[] = [
    { id: "1", label: "RAG", strength: "none", category: null },
    { id: "2", label: "产品设计", strength: "weak", category: null },
    { id: "3", label: "AI 助手", strength: "strong", category: null },
    { id: "4", label: "数据分析", strength: "strong", category: null },
  ];
  const { kept, tradeoffs } = selectSkills(skills, ["熟悉 数据分析 工具链"]);
  check("验收 8｜evidence_strength = none 的标签不进技能栏", !kept.some((s) => s.label === "RAG"));
  check(
    "验收 8｜被过滤的标签写进「本版取舍」",
    tradeoffs.some((t) => t.kind === "skill" && t.title === "RAG"),
  );
  check("与 JD 原词有匹配的排在最前", kept[0].label === "数据分析");
  check("其余按 evidence_strength 排，strong 在 weak 前", kept[1].label === "AI 助手");
  check("短标签不参与原词匹配（否则「AI」会命中一切）", !matchesPhrase("A", ["AI 助手"]));
}

console.log("\n【导出渲染】");
{
  const md = renderMarkdown({
    name: "张昭",
    contact: ["a@b.com", "北京"],
    headline: "AI 产品经理，做过两个 0→1。",
    blocks: [
      {
        section: "个人项目",
        title: "知识宇宙",
        meta: "2022.02 – 至今",
        summary: "",
        bullets: ["设计三层记忆系统", "产出 4 份设计文档"],
      },
      {
        section: "个人项目",
        title: "AI 成长陪伴",
        meta: "2023.01 – 2024.03",
        summary: "一行概述，无 bullet。",
        bullets: [],
      },
      {
        section: "工作经历",
        title: "某公司 · 产品经理",
        meta: "2019.04 – 2021.08",
        summary: "",
        bullets: ["负责业务中台"],
      },
    ],
    skills: ["AI 助手", "数据分析"],
  });
  check("同一 section 只出现一次标题", (md.match(/^## 个人项目$/gm) ?? []).length === 1);
  check("两个 section 都在", md.includes("## 工作经历"));
  check("bullet 是标准的「- 」，不是伪造的圆点符号", md.includes("- 设计三层记忆系统"));
  check("ATS：正文里没有表格", !md.includes("|"));
  check("一行概述的块没有 bullet", md.includes("一行概述，无 bullet。"));
  check("技能栏在最后", md.trimEnd().endsWith("AI 助手、数据分析"));
  check("姓名在第一行", md.startsWith("# 张昭"));
  check("联系方式紧跟姓名", md.split("\n")[1] === "a@b.com · 北京");
}
{
  const f = exportFilename("张昭", "C 端 AI 产品经理", "md");
  check("导出文件名是 {姓名}-{岗位}-{日期}.md", /^张昭-C端AI产品经理-\d{8}\.md$/.test(f), f);
  check("文件名里的路径分隔符被清掉", !exportFilename("a/b", "c:d", "pdf").includes("/"));
}

console.log("\n【section 归拢】");
{
  const bs = [
    { id: "a", section: "工作经历" },
    { id: "b", section: "个人项目" },
    { id: "c", section: "工作经历" },
    { id: "d", section: "教育背景" },
    { id: "e", section: "个人项目" },
  ];
  const g = groupBySection(bs).map((x) => x.id).join("");
  check("同 section 的块排在一起", g === "acbed", g);
  check("section 之间按第一次出现的先后", groupBySection(bs)[0].section === "工作经历");
  check("组内相对顺序不变", g.indexOf("a") < g.indexOf("c") && g.indexOf("b") < g.indexOf("e"));

  const md = renderMarkdown({
    name: "张三", contact: [], headline: "",
    blocks: bs.map((x) => ({ section: x.section, title: x.id, meta: "", summary: "", bullets: [] })),
    skills: [],
  });
  check("导出里每个 section 标题只出现一次", (md.match(/^## 工作经历$/gm) ?? []).length === 1);
}

console.log("\n【未被基线使用的内容】");
{
  const atom: SourceAtom = {
    id: "a1",
    title: "知识宇宙",
    evidenceLevel: "estimated",
    actions: [
      "将用 AI 学习重构为五层对象模型，设计阅读中划词问 AI 交互",
      "自主设计由北极星指标、活跃层、价值层和商业层组成的三层驱动指标体系",
    ],
    metrics: [
      { name: "内测用户", kind: "output", value: "50 人", evidenceLevel: "measured" },
    ],
  };
  const blockText = ["将用 AI 学习重构为五层对象模型，设计阅读中划词问 AI 交互，建立四层提示词架构"];
  const out = unusedContent([atom], blockText);
  check("已经写进基线的 action 不再列为「未使用」", !out[0].unused_actions.some((a) => a.includes("五层对象模型")));
  check("没写进去的 action 会被列出来", out[0].unused_actions.some((a) => a.includes("北极星指标")));
  check("没写进去的 metric 会被列出来", out[0].unused_metrics.length === 1);
  check("包含度是不对称的：短句在长文里 > 长文在短句里",
    containment("北极星指标", "自主设计由北极星指标组成的体系") >
    containment("自主设计由北极星指标组成的体系", "北极星指标"));

  check("验收 21｜source_ref 逐字能在来源经历里找到 → 放行",
    refExists("自主设计由北极星指标、活跃层、价值层和商业层组成的三层驱动指标体系", atom));
  check("验收 21｜改了几个字的 source_ref 仍能对上",
    refExists("自主设计由北极星指标、活跃层和商业层组成的三层指标体系", atom));
  check("验收 21｜编造的 source_ref → 拦下",
    !refExists("将日活从 3 万提升到 12 万，留存提升 40%", atom));
  check("空 source_ref → 拦下", !refExists("", atom));
}

console.log("\n【差异应用】");
{
  const blocks: DeltaBlock[] = [
    { id: "b1", section: "个人项目", title: "知识宇宙", meta: "", summary: "", bullets: ["设计 AI 模块的记忆结构"] },
    { id: "b2", section: "个人项目", title: "Proofly", meta: "", summary: "", bullets: ["独立完成全栈交付", "设计门禁"] },
    { id: "b3", section: "工作经历", title: "润泽园", meta: "", summary: "", bullets: ["规划五大模块"] },
  ];
  const d = (o: Partial<Delta>): Delta => ({
    id: "d", type: "bullet_add", targetBlockId: "b1", before: "", after: "", reason: "",
    sourceAtomId: "", sourceRef: "", accepted: true, ...o,
  });

  let r = applyDeltas(blocks, "定位段", [d({ type: "keyword_align", targetBlockId: "b1", before: "AI 模块", after: "AI 助手" })]);
  check("keyword_align 替换命中的文本", r.blocks[0].bullets[0].includes("AI 助手"));
  check("keyword_align 只算它真的改到的块", r.affected.size === 1 && r.affected.has("b1"));

  r = applyDeltas(blocks, "定位段", [d({ type: "keyword_align", targetBlockId: "b1", before: "不存在的词", after: "X" })]);
  check("没改到任何东西的 keyword_align 不计入受影响", r.affected.size === 0);

  r = applyDeltas(blocks, "定位段", [d({ type: "bullet_add", targetBlockId: "b2", after: "新增一条" })]);
  check("bullet_add 加在目标块末尾", r.blocks[1].bullets.length === 3);

  r = applyDeltas(blocks, "定位段", [d({ type: "bullet_drop", targetBlockId: "b2", before: "设计门禁" })]);
  check("bullet_drop 删掉匹配的那条", r.blocks[1].bullets.length === 1 && !r.blocks[1].bullets.includes("设计门禁"));

  r = applyDeltas(blocks, "定位段", [d({ type: "headline_tweak", after: "新的定位段" })]);
  check("headline_tweak 换掉定位段", r.headline === "新的定位段");
  check("headline 不算块", deltaRatio(r.affected, 3) === 0);

  r = applyDeltas(blocks, "定位段", [d({ type: "reorder", targetBlockId: "b3", after: "移到第 1 位" })]);
  check("reorder 读得出名次时真的搬", r.blocks[0].id === "b3");

  const manual = [d({ type: "reorder", targetBlockId: "b3", after: "往前放一点" })];
  r = applyDeltas(blocks, "定位段", manual);
  check("reorder 读不出名次时不乱搬，标成手动", r.blocks[0].id === "b1" && manual[0].manual === true);

  r = applyDeltas(blocks, "定位段", [d({ targetBlockId: "b1", accepted: false, after: "被拒绝的" })]);
  check("验收 26｜拒绝掉的 delta 不参与渲染", r.blocks[0].bullets.length === 1 && r.affected.size === 0);

  r = applyDeltas(blocks, "定位段", [
    d({ targetBlockId: "b1", after: "x" }),
    d({ targetBlockId: "b2", after: "y" }),
  ]);
  check("delta_ratio = 受影响块数 ÷ 基线总块数", Math.abs(deltaRatio(r.affected, 3) - 2 / 3) < 1e-9);
}

console.log("\n【三档与「差得比较远」】");
{
  check("< 0.2 不提示", !overThreshold(0.15));
  check("0.2–0.4 不提示", !overThreshold(0.35));
  check("正好 0.4 不提示（> 0.4 才提示）", !overThreshold(0.4));
  check("> 0.4 提示", overThreshold(0.42));
  check("对不上的要求过半 → 也提示新建方向", farOff(10, 14));
  check("对不上的要求不过半 → 不提示", !farOff(4, 14));
  check("没有要求时不提示", !farOff(0, 0));
}

console.log("\n【deltas 解析】");
{
  check("坏数据降级为空", parseDeltas("不是数组" as never).length === 0);
  check("不认识的 type 直接丢掉", parseDeltas([{ type: "rewrite_everything" }] as never).length === 0);
  const one = parseDeltas([{ type: "bullet_add", targetBlockId: "b1", after: "x" }] as never);
  check("accepted 缺省视为 true", one.length === 1 && one[0].accepted === true);
  const off = parseDeltas([{ type: "bullet_add", accepted: false }] as never);
  check("accepted: false 保留", off[0].accepted === false);
}

console.log("\n【重复 delta 检测】");
{
  const mk = (o: Partial<Delta>): Delta => ({
    id: "d", type: "bullet_add", targetBlockId: "b1", before: "", after: "", reason: "",
    sourceAtomId: "", sourceRef: "", accepted: true, ...o,
  });
  const add = mk({ type: "bullet_add", sourceAtomId: "a1", sourceRef: "设计三层记忆系统", after: "设计三层记忆系统" });
  const drop = mk({ type: "bullet_drop", targetBlockId: "b7", before: "业务中台 7 环节数字化" });
  const align = mk({ type: "keyword_align", before: "AI 模块", after: "AI 助手" });

  check("同一条 bullet_add 的签名稳定", signatureOf(add) === signatureOf({ ...add, id: "x", reason: "别的理由" }));
  check("改了来源引用就是另一条", signatureOf(add) !== signatureOf({ ...add, sourceRef: "别的内容" }));
  check("reorder 不参与检测", signatureOf(mk({ type: "reorder" })) === null);
  check("headline_tweak 不参与检测", signatureOf(mk({ type: "headline_tweak" })) === null);
  check("没写来源的 bullet_add 不参与检测", signatureOf(mk({ type: "bullet_add", sourceAtomId: "" })) === null);

  const three = [
    { id: "v1", deltas: [add] },
    { id: "v2", deltas: [add] },
    { id: "v3", deltas: [add] },
  ];
  check("验收 28｜连续 3 份版本加入同一条 → 触发「并进基线」",
    detectSignals(three, new Set()).some((s) => s.kind === "merge_add" && s.acceptLabel === "并进基线"));
  check("提示文案里带出现次数", detectSignals(three, new Set())[0].copy.includes("3 份版本"));

  check("只出现 2 次不提示", detectSignals(three.slice(0, 2), new Set()).length === 0);
  check("门槛就是 3", REPEAT_THRESHOLD === 3);

  const dup = [{ id: "v1", deltas: [add, { ...add, id: "d2" }] }, { id: "v2", deltas: [add] }, { id: "v3", deltas: [add] }];
  check("同一份版本里重复只算一次（这里仍是 3 份 → 触发）", detectSignals(dup, new Set()).length === 1);
  const dup2 = [{ id: "v1", deltas: [add, { ...add, id: "d2" }, { ...add, id: "d3" }] }];
  check("一份版本里加三遍不算三次", detectSignals(dup2, new Set()).length === 0);

  check("被拒绝过的签名不再出现", detectSignals(three, new Set([signatureOf(add)!])).length === 0);
  check("已拒绝的 delta 不计数", detectSignals(three.map((v) => ({ ...v, deltas: [{ ...add, accepted: false }] })), new Set()).length === 0);

  const drops = [1, 2, 3].map((i) => ({ id: `v${i}`, deltas: [drop] }));
  const ds = detectSignals(drops, new Set(), { blockTitle: () => "业务中台 7 环节数字化" });
  check("验收 29｜连续 3 份删掉同一块 → 触发「从基线移除」",
    ds.length === 1 && ds[0].kind === "remove_block" && ds[0].acceptLabel === "从基线移除");
  check("移除提示用的是块标题", ds[0].copy.includes("业务中台"));

  const aligns = [1, 2, 3].map((i) => ({ id: `v${i}`, deltas: [align] }));
  const as_ = detectSignals(aligns, new Set());
  check("验收 30｜连续 3 次同样的关键词对齐 → 触发「改基线用词」",
    as_.length === 1 && as_[0].kind === "align_wording" && as_[0].acceptLabel === "改基线");
  check("对齐提示带上原词与新词", as_[0].copy.includes("AI 模块") && as_[0].copy.includes("AI 助手"));

  const many = [1, 2, 3, 4].map((i) => ({ id: `v${i}`, deltas: [add, drop, align] }));
  check("三种可以同时触发", detectSignals(many, new Set()).length === 3);
  check("出现次数多的排前面", detectSignals(
    [{ id: "v1", deltas: [add, drop] }, { id: "v2", deltas: [add, drop] },
     { id: "v3", deltas: [add, drop] }, { id: "v4", deltas: [add] }],
    new Set(),
  )[0].kind === "merge_add");

  const six = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `v${i}`, deltas: i <= 3 ? [] : [add] }));
  check("只看最近 5 份：第 6 份里的那次不算", detectSignals(six, new Set()).length === 0);
}

console.log(`\n${fail === 0 ? "全部通过" : "有失败"}：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
