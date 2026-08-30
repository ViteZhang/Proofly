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
import { renderMarkdown, exportFilename } from "../src/lib/resume/markdown";
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

console.log(`\n${fail === 0 ? "全部通过" : "有失败"}：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
