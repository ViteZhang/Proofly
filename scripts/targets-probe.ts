// =============================================================
// Proofly · 求职方向的选中与平权探针
//
//   pnpm targets:probe
//
// 覆盖《Step 4 方案》第七节验收 1、2、3、4、6。
// 不连库、不调模型：?target= 的收敛规则和「哪些页面置灰」是纯函数，
// 平权则是源码层面的约束 —— 这两类东西都会在后面几片被顺手改坏，
// 得有个跑得起来的东西盯着。
// =============================================================

import { readFileSync } from "node:fs";
import { isGlobalPath } from "../src/lib/nav";
import { resolveTarget } from "../src/lib/targets/shape";

// 注释里写「不要加星标」是好事，不该被当成违规。扫描前先把注释剥掉，
// 剩下的才是真正会渲染到界面上的东西。
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

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

const A = { id: "11111111-1111-1111-1111-111111111111", name: "C 端 AI 应用" };
const B = { id: "22222222-2222-2222-2222-222222222222", name: "AI Agent 平台" };
const C = { id: "33333333-3333-3333-3333-333333333333", name: "增长产品" };
const THREE = [A, B, C];

console.log("\n验收 3 · ?target= 的收敛");
check("传了有效 id → 选中它", resolveTarget(THREE, B.id)?.id === B.id);
check("没传 → 退回第一个", resolveTarget(THREE, undefined)?.id === A.id);
check("传了不存在的 id → 退回第一个，不报错", resolveTarget(THREE, "not-a-real-id")?.id === A.id);
check("传了空串 → 退回第一个", resolveTarget(THREE, "")?.id === A.id);
check(
  "同名参数出现两次（?target=a&target=b）→ 取第一个",
  resolveTarget(THREE, [C.id, B.id])?.id === C.id,
);

console.log("\n验收 6 · 删光所有方向");
check("一个方向都没有 → 返回 null，不抛异常", resolveTarget([], A.id) === null);
check("一个都没有且没传参数 → 也是 null", resolveTarget([], undefined) === null);

console.log("\n验收 4 · 方向选择器在哪些页面置灰");
const GLOBAL = ["/", "/library", "/import", "/notes", "/actions", "/health", "/facts"];
const SCOPED = ["/targets", "/resume", "/interview"];
for (const p of GLOBAL) check(`${p} 是全局视图 → 置灰`, isGlobalPath(p) === true);
for (const p of SCOPED) check(`${p} 是方向视图 → 可选`, isGlobalPath(p) === false);
check("子路由 /import/review/xxx 也算全局", isGlobalPath("/import/review/abc") === true);
check("批量配置页 /targets/strategy 属于方向视图", isGlobalPath("/targets/strategy") === false);
check("别把 /targetsomething 当成方向页", isGlobalPath("/targetsomething") === true);

console.log("\n验收 1、2 · 平权（源码层面）");
const view = readFileSync(new URL("../src/components/targets/TargetsView.tsx", import.meta.url), "utf8");

// 所有卡片必须共用同一份尺寸与底色。多出第二份常量，就是主次的开始。
check(
  "卡片样式只有一份常量",
  view.split("const CARD_CLASS").length === 2 && view.split("const CARD_STYLE").length === 2,
);
check("卡片渲染直接用这份常量", view.includes("className={CARD_CLASS}"));

// 选中态只允许改 outline —— 改字重或底色都会让选中卡片「看起来更重要」。
const cardFn = view.slice(view.indexOf("function TargetCardButton"), view.indexOf("function SelectedPanel"));
const styleBranch = cardFn.slice(cardFn.indexOf("style={"), cardFn.indexOf("<div className=\"truncate"));
check("选中态只加 outline，不改背景与字重", styleBranch.includes("outline") && !styleBranch.includes("fontWeight"));
check(
  "卡片样式不按分数或名次分支",
  !cardFn.includes("matchScore >") && !cardFn.includes("index ===") && !cardFn.includes("rank"),
);

// 界面上不许出现任何暗示主次的入口。
const viewCode = stripComments(view);
const FORBIDDEN = ["主方向", "置顶", "星标", "★", "⭐", "设为主", "pinned", "isPrimary", "primaryTarget"];
for (const word of FORBIDDEN) {
  check(`界面上没有「${word}」`, !viewCode.includes(word));
}

// 写操作层同样不能有「设为主方向」这种接口。
const actions = stripComments(
  readFileSync(new URL("../src/app/(app)/targets/actions.ts", import.meta.url), "utf8"),
);
check(
  "写操作里没有设主方向的接口",
  !actions.includes("setPrimary") && !actions.includes("主方向") && !actions.includes("pin"),
);

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
