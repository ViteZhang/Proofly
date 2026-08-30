// =============================================================
// Proofly · 行动规划探针
//
//   pnpm planning:probe
//
// 覆盖《Step 5 方案》第五节验收 8–17、37，外加边界。
// 不连库、不调模型 —— impact 由代码算，那就该能脱离模型单独验证。
// =============================================================

import {
  ACTION_EASE_ORDER,
  ACTION_FOR_GAP,
  BUILD_EVIDENCE_COVERAGE_AFTER,
  BUILD_EVIDENCE_EV_AFTER,
  GAP_RESOLVED_THRESHOLD,
  IMPACT_IS_ESTIMATED_NOTE,
  LEARN_COVERAGE_AFTER,
  LEARN_EV_AFTER,
  LEARN_MIN_HOURS,
  MAX_GAPS_IN,
  MAX_TASKS_OUT,
  REWRITE_NARRATIVE_RECOVERY,
} from "../src/lib/planning/config";
import { computeImpact, sumImpact, type GapState } from "../src/lib/planning/impact";
import {
  findDuplicate,
  requirementOverlap,
  titleSimilarity,
} from "../src/lib/planning/dedupe";
import { priorityOf, sortTasks, type SortableTask } from "../src/lib/planning/sort";
import { planSchema } from "../src/lib/planning/schema";
import { PLAN_SYSTEM, planUser } from "../src/lib/llm/task-prompts";
import { COVERAGE, EVIDENCE } from "../src/lib/scoring/config";

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

function near(a: number, b: number, tol = 0.005): boolean {
  return Math.abs(a - b) <= tol;
}

// =============================================================
console.log("\n验收 8 · collect_data 手工按公式算一遍");
// =============================================================

// 方案 5.2 给的示例：weight 3、coverage 0.6、ev 0.6→1.0、Σweight 28 → 2.57
const g1: GapState = {
  weight: 3,
  coverage: 0.6,
  evidenceMultiplier: 0.6,
  sumWeight: 28,
  scoreLoss: 0,
};
const b1 = computeImpact("collect_data", g1);
const hand1 = ((3 * 0.6 * (1.0 - 0.6)) / 28) * 100;
check(
  `impact = 3 × 0.6 × (1.0 − 0.6) / 28 × 100 = ${hand1.toFixed(4)} → ${b1.result}`,
  near(b1.result, 2.57),
  JSON.stringify(b1),
);
check("与方案 5.2 示例 impact_basis 的 result 2.57 一致", b1.result === 2.57);

// =============================================================
console.log("\n验收 9 · structural 的 impact 等于 score_loss × 0.3");
// =============================================================

const b2 = computeImpact("rewrite_narrative", {
  weight: 3,
  coverage: 0.3,
  evidenceMultiplier: 1.0,
  sumWeight: 28,
  scoreLoss: 10,
});
check(`10 × 0.3 = ${b2.result}`, b2.result === 3, JSON.stringify(b2));
check("系数就是 REWRITE_NARRATIVE_RECOVERY，没有硬编码", REWRITE_NARRATIVE_RECOVERY === 0.3);
check("basis 里记了 recovery 与 score_loss", b2.recovery === 0.3 && b2.score_loss === 10);
check(
  "界面标注文案与方案 §1.2 原文一致",
  IMPACT_IS_ESTIMATED_NOTE ===
    "结构性差距补不上，改叙事只能挽回部分印象分，这个数字是估算的",
  IMPACT_IS_ESTIMATED_NOTE,
);

// =============================================================
console.log("\n验收 10 · impact_basis 记录完整计算依据");
// =============================================================

check(
  "collect_data 的 basis 含 formula/weight/coverage/ev前/ev后/Σweight/result",
  b1.formula === "collect_data" &&
    b1.weight === 3 &&
    b1.coverage === 0.6 &&
    b1.ev_mult_before === 0.6 &&
    b1.ev_mult_after === 1.0 &&
    b1.sum_weight === 28 &&
    typeof b1.result === "number",
  JSON.stringify(b1),
);

const b3 = computeImpact("build_evidence", {
  weight: 3,
  coverage: 0,
  evidenceMultiplier: 0,
  sumWeight: 28,
  scoreLoss: 8,
});
const hand3 = ((3 * (0.6 * 0.6 - 0)) / 28) * 100;
check(
  `build_evidence：3 × (0.6×0.6 − 0) / 28 × 100 = ${hand3.toFixed(4)} → ${b3.result}`,
  near(b3.result, 3.86),
  JSON.stringify(b3),
);
check(
  "0.6 / 0.6 取自 scoring/config，不是重写的数字",
  BUILD_EVIDENCE_COVERAGE_AFTER === COVERAGE.partial &&
    BUILD_EVIDENCE_EV_AFTER === EVIDENCE.designed_only,
);

const b4 = computeImpact("learn", {
  weight: 3,
  coverage: 0.3,
  evidenceMultiplier: 0.4,
  sumWeight: 28,
  scoreLoss: 5,
});
const hand4 = ((3 * (0.3 * 0.6 - 0.3 * 0.4)) / 28) * 100;
check(
  `learn：3 × (0.3×0.6 − 0.3×0.4) / 28 × 100 = ${hand4.toFixed(4)} → ${b4.result}`,
  near(b4.result, 0.64),
  JSON.stringify(b4),
);
check(
  "learn 的估计值比 build_evidence 更保守",
  LEARN_COVERAGE_AFTER * LEARN_EV_AFTER <
    BUILD_EVIDENCE_COVERAGE_AFTER * BUILD_EVIDENCE_EV_AFTER,
);

// 负数钳到 0，原始值留痕
const b5 = computeImpact("learn", {
  weight: 3,
  coverage: 1.0,
  evidenceMultiplier: 1.0,
  sumWeight: 28,
  scoreLoss: 0,
});
check(
  "公式算出负数时钳到 0，并把原始值记进 raw_result",
  b5.result === 0 && typeof b5.raw_result === "number" && b5.raw_result < 0,
  JSON.stringify(b5),
);

check("Σweight 为 0 时不炸也不返回 NaN", computeImpact("collect_data", {
  weight: 3, coverage: 0.6, evidenceMultiplier: 0.6, sumWeight: 0, scoreLoss: 0,
}).result === 0);

// =============================================================
console.log("\n验收 11 · 一条任务关联两个方向，impact 分别计算不共用");
// =============================================================

// 同一条任务补两个方向的缺口：两个方向的 JD 长度不同（Σweight 不同），
// impact 必须各算各的。
const cImpactA = computeImpact("collect_data", {
  weight: 3, coverage: 0.6, evidenceMultiplier: 0.6, sumWeight: 28, scoreLoss: 0,
});
const cImpactB = computeImpact("collect_data", {
  weight: 3, coverage: 0.6, evidenceMultiplier: 0.6, sumWeight: 14, scoreLoss: 0,
});
check(
  `Σweight 28 → ${cImpactA.result}，Σweight 14 → ${cImpactB.result}，正好两倍`,
  near(cImpactB.result, cImpactA.result * 2, 0.02),
);
check("两条 basis 各自记着自己的 sum_weight", cImpactA.sum_weight === 28 && cImpactB.sum_weight === 14);

// =============================================================
console.log("\n验收 12 · 忽略一个关联缺口后总 impact 正确减少");
// =============================================================

const all = [cImpactA, b3, b4];
const total = sumImpact(all);
const afterDismiss = sumImpact([cImpactA, b4]);
check(
  `三条 ${total} → 忽略掉 ${b3.result} 那条 = ${afterDismiss}`,
  near(afterDismiss, total - b3.result),
);
check("总和就是各条之和，没有二次加权", near(total, cImpactA.result + b3.result + b4.result));

// =============================================================
console.log("\n验收 13–14 · 排序");
// =============================================================

function t(
  id: string,
  totalImpact: number,
  estimatedHours: number,
  pinned = false,
  actionType = "collect_data",
): SortableTask {
  return { id, pinned, totalImpact, estimatedHours, actionType, createdAt: "2026-01-01" };
}

// A 服务 2 方向合计 17、20h；B 服务 1 方向 9、20h → A 在前
const ab = sortTasks([t("B", 9, 20), t("A", 17, 20)]);
check(
  `A(17/20h) 排在 B(9/20h) 前：${ab.map((x) => x.id).join(" ")}`,
  ab[0].id === "A",
);

// C impact 4 / 2h = 2.0；D impact 11 / 20h = 0.55 → C 在前
const cd = sortTasks([t("D", 11, 20), t("C", 4, 2)]);
check(
  `C(priority ${priorityOf(t("C", 4, 2)).toFixed(2)}) 排在 D(${priorityOf(t("D", 11, 20)).toFixed(2)}) 前：${cd.map((x) => x.id).join(" ")}`,
  cd[0].id === "C",
);

// =============================================================
console.log("\n验收 15 · 方向之间没有权重系数");
// =============================================================

const sortSrc = (await import("node:fs")).readFileSync("src/lib/planning/sort.ts", "utf8");
const impactSrc = (await import("node:fs")).readFileSync("src/lib/planning/impact.ts", "utf8");
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const codeOnly = stripComments(sortSrc) + stripComments(impactSrc);
const forbidden = ["sort_order", "sortOrder", "targetWeight", "target_weight", "isPrimary", "primaryTarget"];
const found = forbidden.filter((w) => codeOnly.includes(w));
check(
  "排序与 impact 的代码里不出现方向权重／主方向字样",
  found.length === 0,
  found.join(" / "),
);
// 真跑一遍：方向顺序变了，任务顺序不变。
const order1 = sortTasks([t("X", 10, 5), t("Y", 4, 5), t("Z", 20, 5)]).map((x) => x.id);
const order2 = sortTasks([t("Z", 20, 5), t("X", 10, 5), t("Y", 4, 5)]).map((x) => x.id);
check(`输入顺序打乱后结果一致：${order1.join(" ")}`, order1.join() === order2.join());

// =============================================================
console.log("\n验收 16 · 置顶永远在最前");
// =============================================================

const pinned = sortTasks([t("high", 100, 1), t("pin", 0, 40, true)]);
check(
  `impact 为 0 的置顶任务仍排第一：${pinned.map((x) => x.id).join(" ")}`,
  pinned[0].id === "pin",
);
const pinnedHours = sortTasks([t("high", 100, 1), t("pin", 0, 40, true)], "hours");
check("换成按工时排序，置顶依然在最前", pinnedHours[0].id === "pin");

// =============================================================
console.log("\n验收 37 · 手动任务不填 impact → priority 0，排最后但可置顶");
// =============================================================

const manual = sortTasks([t("m", 0, 4), t("a", 6, 4)]);
check(`priority 0 的排在最后：${manual.map((x) => x.id).join(" ")}`, manual[1].id === "m");
check("priority 就是 0，不是 NaN", priorityOf(t("m", 0, 4)) === 0);
check("工时为 0 也不会除零", Number.isFinite(priorityOf(t("m", 5, 0))));
const manualPinned = sortTasks([t("a", 6, 4), t("m", 0, 4, true)]);
check("置顶之后照样排最前", manualPinned[0].id === "m");

// =============================================================
console.log("\n验收 7 · 重新生成时的去重");
// =============================================================

const existing = [
  {
    id: "task-1",
    title: "给知识宇宙的检索模块做一版召回率评测",
    requirementTexts: ["建立 AI 功能的效果评估体系", "有 LLM 效果评测经验"],
  },
  {
    id: "task-2",
    title: "重写「没有千万级 DAU 经历」的应答口径",
    requirementTexts: ["有千万级 DAU 产品的从业经历"],
  },
];

// 标题几乎一样 → 命中
const d1 = findDuplicate(
  { title: "给知识宇宙的检索模块做一版召回率评测", requirementTexts: [] },
  existing,
);
check("标题完全相同 → 判为同一条", d1?.existingId === "task-1", JSON.stringify(d1));

// 标题被用户改过，但补的还是同一批要求 → 仍命中（gap_id 已经全变了）
const d2 = findDuplicate(
  {
    title: "搭一套召回评测（第二版）",
    requirementTexts: ["建立 AI 功能的效果评估体系", "有 LLM 效果评测经验"],
  },
  existing,
);
check(
  "标题变了但底层要求重合 → 仍判为同一条（重新评估后 gap_id 会全变）",
  d2?.existingId === "task-1",
  JSON.stringify(d2),
);

// 完全无关 → 不命中
const d3 = findDuplicate(
  { title: "招募 50 个内测用户跑满两周", requirementTexts: ["有 C 端增长经验"] },
  existing,
);
check("无关的新任务 → 不判为重复", d3 === null, JSON.stringify(d3));

check(
  `标题相似度：同题 ${titleSimilarity("做一版召回率评测", "做一版召回率评测").toFixed(2)}，异题 ${titleSimilarity("做一版召回率评测", "招募内测用户").toFixed(2)}`,
  near(titleSimilarity("做一版召回率评测", "做一版召回率评测"), 1) &&
    titleSimilarity("做一版召回率评测", "招募内测用户") < 0.3,
);
check(
  "标题里的标点空格不影响判定",
  near(titleSimilarity("给知识宇宙做 eval 体系", "给知识宇宙，做 EVAL 体系！"), 1),
);
check(
  "要求重合度按较小集合算：一条任务补的缺口变少了也认得出",
  requirementOverlap(["a"], ["a", "b", "c"]) === 1,
);
check("两边都空时重合度是 0，不是 1", requirementOverlap([], []) === 0);

// =============================================================
console.log("\n验收 6 · learn 类工时下限");
// =============================================================

check(`LEARN_MIN_HOURS = ${LEARN_MIN_HOURS}，不低于 30`, LEARN_MIN_HOURS >= 30);

// =============================================================
console.log("\n验收 5 · 数量控制");
// =============================================================

check(`一次最多生成 ${MAX_TASKS_OUT} 条`, MAX_TASKS_OUT === 10);
check(`最多送 ${MAX_GAPS_IN} 条缺口进模型`, MAX_GAPS_IN === 25);
check(
  "schema 收下超额的任务而不是整次失败（截断在代码里做）",
  planSchema.safeParse({
    tasks: Array.from({ length: 12 }, (_, i) => ({
      title: `t${i}`,
      action_type: "learn",
      estimated_hours: 40,
      gap_ids: [],
    })),
    dropped_gap_ids: [],
  }).success,
);
check(
  "schema 把模型多给的 impact 剥掉，不让它进代码",
  (() => {
    const r = planSchema.safeParse({
      tasks: [
        { title: "t", action_type: "learn", estimated_hours: 40, gap_ids: [], impact: 99 },
      ],
      dropped_gap_ids: [],
    });
    return r.success && !("impact" in r.data.tasks[0]);
  })(),
);
check(
  "action_type 不在四类里 → 整条被拒",
  !planSchema.safeParse({
    tasks: [{ title: "t", action_type: "读书", estimated_hours: 1, gap_ids: [] }],
    dropped_gap_ids: [],
  }).success,
);

// =============================================================
console.log("\n缺口类型 → 行动类型的对应表（方案 §二）");
// =============================================================

check("weak_evidence → collect_data", ACTION_FOR_GAP.weak_evidence === "collect_data");
check("no_evidence → build_evidence", ACTION_FOR_GAP.no_evidence === "build_evidence");
check("no_capability → learn", ACTION_FOR_GAP.no_capability === "learn");
check("structural → rewrite_narrative", ACTION_FOR_GAP.structural === "rewrite_narrative");
check(
  "难易顺序 collect_data > build_evidence > rewrite_narrative > learn",
  ACTION_EASE_ORDER.join() === "collect_data,build_evidence,rewrite_narrative,learn",
);
check(
  `缺口关闭门槛 = partial × designed_only = ${GAP_RESOLVED_THRESHOLD.toFixed(2)}，正好是造证据类做完能到的水平`,
  near(GAP_RESOLVED_THRESHOLD, BUILD_EVIDENCE_COVERAGE_AFTER * BUILD_EVIDENCE_EV_AFTER),
);

// =============================================================
console.log("\n提示词逐字落地（方案 §二）");
// =============================================================

check(`PLAN_SYSTEM 长度 ${PLAN_SYSTEM.length}`, PLAN_SYSTEM.length === 1981);
check(
  "System 里保留了「任务必须具体到能直接开工」",
  PLAN_SYSTEM.includes("**任务必须具体到能直接开工。**"),
);
check(
  "System 里保留了 learn 类工时下限那一句",
  PLAN_SYSTEM.includes("**learn 类任务的工时不要低于 30 小时。**"),
);
check("System 里没有 impact 字段", !PLAN_SYSTEM.includes('"impact"'));
const u = planUser({ gapsJson: "G", anchorAtomsJson: "A", skillsJson: "S" });
check(
  "User 三个占位都被替换",
  u.includes("G") && u.includes("A") && u.includes("S") && !u.includes("{{"),
);

// =============================================================
console.log("\n验收 18–20 · 全局视图");
// =============================================================

const { isGlobalPath } = await import("../src/lib/nav");
check("/actions 判为全局页 → 方向选择器置灰", isGlobalPath("/actions"));
check("/actions/xxx 子路由同样是全局页", isGlobalPath("/actions/whatever"));
check("/targets 仍是方向作用域页", !isGlobalPath("/targets"));

const viewSrc = (await import("node:fs")).readFileSync(
  "src/components/actions/ActionsView.tsx",
  "utf8",
);
const viewCode = stripComments(viewSrc);
check("页面顶部有「全局 · 所有方向共用」标记", viewCode.includes("全局 · 所有方向共用"));
check("每条行动显示「服务 N 个方向」", viewCode.includes("服务 {t.targetCount} 个方向"));
check(
  "各方向 impact 分别列出，不是只给总和",
  viewCode.includes("PerTargetImpact") && viewCode.includes("byTarget.set"),
);
check(
  "读取层不接受方向参数（全局清单不能按方向过滤）",
  !stripComments(
    (await import("node:fs")).readFileSync("src/lib/queries/tasks.ts", "utf8"),
  ).includes("eq(\"target_id\""),
);
check(
  "改叙事类旁边挂了估算说明",
  viewCode.includes("IMPACT_IS_ESTIMATED_NOTE") && viewCode.includes('rewrite_narrative"'),
);

// =============================================================
console.log("\n类型标记配色（S7）");
// =============================================================

const { ACTION_COPY, EMPTY_COPY } = await import("../src/lib/planning/labels");
check("取数 · 绿", ACTION_COPY.collect_data.label === "取数" && ACTION_COPY.collect_data.fg === "var(--proof)");
check("造证据 · 紫", ACTION_COPY.build_evidence.label === "造证据" && ACTION_COPY.build_evidence.fg === "var(--ai)");
check("改叙事 · 橙", ACTION_COPY.rewrite_narrative.label === "改叙事" && ACTION_COPY.rewrite_narrative.fg === "var(--warn)");
check("学技能 · 灰", ACTION_COPY.learn.label === "学技能" && ACTION_COPY.learn.fg === "var(--slate)");
check(
  "空状态文案与方案 5.3 原文一致",
  EMPTY_COPY === "还没有行动。先去评估一份 JD，我会告诉你差在哪。",
  EMPTY_COPY,
);
check(
  "界面文案用「行动」不用「任务」",
  !viewCode.includes("任务") || viewCode.split("任务").length - 1 === 0,
  "ActionsView 里还留着「任务」两个字",
);

// =============================================================
console.log("\n5.4 · 手动管理");
// =============================================================

const fs2 = await import("node:fs");
const taskActionsSrc = stripComments(
  fs2.readFileSync("src/app/(app)/actions/task-actions.ts", "utf8"),
);
check(
  "手动新增的 source 置为 manual",
  taskActionsSrc.includes('source: "manual"'),
);
check(
  "手动任务的 impact 也走 computeImpact，没有手填入口",
  taskActionsSrc.includes("computeImpact(ACTION_FOR_GAP[g.gapType]") &&
    !taskActionsSrc.includes("impact: z.number"),
);
check(
  "编辑后打 edited 标记，source 不变",
  taskActionsSrc.includes("edited: true") &&
    !taskActionsSrc.includes('source: "ai_generated"'),
);
check("放弃写 status = dropped", taskActionsSrc.includes('status: "dropped"'));
check(
  "忽略缺口写 gaps.dismissed_at 并摘掉关联行",
  taskActionsSrc.includes("dismissed_at: new Date().toISOString()") &&
    taskActionsSrc.includes('.delete().eq("gap_id", gapId)'),
);
check(
  "手填工时也受 learn 下限约束",
  taskActionsSrc.includes("Math.max(LEARN_MIN_HOURS, h)"),
);

const planSrc = stripComments(
  fs2.readFileSync("src/app/(app)/actions/plan-actions.ts", "utf8"),
);
check(
  "重新生成命中去重时只碰 updated_at，不覆盖标题／说明／工时",
  /async function touchTask[\s\S]*?\.update\(\{\s*updated_at:[^}]*\}\)/.test(planSrc),
);

check(
  "界面上标出失去关联方向的行动（验收 38）",
  viewCode.includes("已失去关联方向"),
);
check(
  "详情就地展开，不跳页（用 aria-expanded，没有指向详情页的 Link）",
  viewCode.includes("aria-expanded={open}") &&
    !/<Link\s+href="\/actions\//.test(viewCode),
);
check(
  "放弃有二次确认",
  viewCode.includes("confirmDrop") && viewCode.includes("确认放弃"),
);
check(
  "关联缺口全被忽略时问一句要不要一并放弃",
  viewCode.includes("关联缺口都被忽略了，要一并放弃吗"),
);

// =============================================================
console.log("\n验收 22–28 · 回流");
// =============================================================

const reflowView = stripComments(
  fs2.readFileSync("src/components/actions/ReflowPanel.tsx", "utf8"),
);
const reflowSrc = stripComments(
  fs2.readFileSync("src/app/(app)/actions/reflow-actions.ts", "utf8"),
);

check(
  "勾选复选框弹回流面板，不直接标记完成",
  viewCode.includes("setReflow(true)") && viewCode.includes("<ReflowPanel"),
);
check(
  "「只标记完成」是文字按钮，「生成经历并完成」是主按钮",
  /<button[\s\S]{0,400}只标记完成/.test(reflowView) &&
    /<Button[^>]*>\s*\{busy \? "处理中…" : "生成经历并完成"\}/.test(reflowView),
);
check(
  "两个入口都在：上传交付物 / 直接描述",
  reflowView.includes("上传交付物") && reflowView.includes("直接描述"),
);
check(
  "直接描述走 Step 3 的 Stage B/C（runRecord）",
  reflowSrc.includes("runRecord(") && reflowSrc.includes("taskContext: ctx"),
);
check(
  "上传交付物走 Step 2 的导入链路，带上行动 id",
  reflowView.includes("/import?task=$"),
);
check(
  "入库后写 produces_atom_id、status=done、completed_at、actual_hours",
  reflowSrc.includes("produces_atom_id: atomId") &&
    reflowSrc.includes('status: "done"') &&
    reflowSrc.includes("completed_at: new Date().toISOString()") &&
    reflowSrc.includes("actual_hours: hours"),
);
check(
  "只标记完成时 produces_atom_id 为 null，不伪造一条经历",
  reflowSrc.includes("return completeTaskWithAtom(taskId, null, actualHours)"),
);
check(
  "回流中途关掉：只有确认入库才标完成，卡片摆出来那一步不动任务状态",
  !/setCards\([\s\S]{0,200}markDone/.test(reflowView) &&
    reflowSrc.includes("const res = await commitCard(draftId, choice);"),
);
check(
  "自动完成可改回待办",
  reflowSrc.includes("export async function reopenTask") &&
    viewCode.includes("改回待办"),
);

// 验收 26：挂靠项目置顶 + user 附加一句
const pipelineSrc = stripComments(fs2.readFileSync("src/lib/chat/pipeline.ts", "utf8"));
check(
  "挂靠项目被顶到 Stage C 候选第一位（召回没捞到也补进来）",
  pipelineSrc.includes("pinAnchor(atoms, v.taskContext?.anchorAtomId") &&
    pipelineSrc.includes("[pinned, ...atoms]"),
);
check(
  "提示词本身不改，只在 user 末尾附一句来源说明",
  pipelineSrc.includes("taskContextLine(v.taskContext") &&
    pipelineSrc.includes("这段内容来自一项针对『${ctx.taskTitle}』的工作"),
);
check(
  "编造出来的 target_atom_id 仍然会被挡掉（候选集含置顶那条）",
  pipelineSrc.includes("new Set(ranked.map((a) => a.id))"),
);

// =============================================================
console.log("\n验收 29–34 · 连带影响与重评");
// =============================================================

const { STEP5_KINDS } = await import("../src/lib/ripple/types");
check(
  "策略层两个 kind 补齐",
  STEP5_KINDS.join() === "match_score_change,task_auto_complete",
);

const rippleListSrc = stripComments(
  fs2.readFileSync("src/components/notes/RippleList.tsx", "utf8"),
);
check(
  "match_score_change 渲染成「C 端 68 → 79」，不是「某个求职方向」",
  rippleListSrc.includes("${e.targetName || \"某个求职方向\"} 匹配度"),
);
check(
  "task_auto_complete 有渲染分支",
  rippleListSrc.includes('case "task_auto_complete"'),
);

const reassessSrc = stripComments(
  fs2.readFileSync("src/lib/planning/reassess.ts", "utf8"),
);
const reassessActions = stripComments(
  fs2.readFileSync("src/app/(app)/actions/reassess-actions.ts", "utf8"),
);
check(
  "只重评受影响的评估（results 里命中了本次变更的经历）",
  reassessSrc.includes("r.matchedAtomIds.some((x) => ids.has(x))"),
);
check(
  "重评挂在 after() 里，不阻塞入库确认",
  reassessActions.includes("after(async () => {") &&
    reassessActions.includes("import { after } from \"next/server\";"),
);
check(
  "一份挂了不影响另外几份，也不回滚已入库的数据",
  /try \{[\s\S]{0,120}reassessOne\(jd\)[\s\S]{0,200}catch/.test(reassessActions) &&
    !reassessActions.includes("rollback") &&
    !reassessActions.includes("undoCard"),
);
check(
  "轮询判据是「有没有更新的一次评估」，不是时间戳",
  reassessActions.includes("latest.id === jd.assessmentId"),
);
check(
  "缺口关闭与自动完成只在全部跑完之后结算一次",
  /if \(pending === 0\) \{[\s\S]{0,200}closeResolvedGaps/.test(reassessActions),
);
check(
  `缺口关闭门槛用 GAP_RESOLVED_THRESHOLD（${GAP_RESOLVED_THRESHOLD.toFixed(2)}），不是硬编码`,
  reassessSrc.includes("level >= GAP_RESOLVED_THRESHOLD"),
);
check(
  "resolved_at 与 dismissed_at 分开：补上了 ≠ 不打算补",
  reassessSrc.includes("resolved_at: new Date().toISOString()") &&
    reassessSrc.includes('.is("dismissed_at", null)'),
);
check(
  "自动完成不编工时（actual_hours 留空），并标 auto_completed",
  reassessSrc.includes("actual_hours: null") && reassessSrc.includes("auto_completed: true"),
);
check(
  "没有关联缺口的行动不会被自动完成",
  reassessSrc.includes("if (mine.length === 0) continue;"),
);

const noticeSrc = stripComments(
  fs2.readFileSync("src/components/actions/ReassessNotice.tsx", "utf8"),
);
check(
  "界面说「正在重新评估 N 份 JD…」，不是转圈",
  noticeSrc.includes("正在重新评估 {pending} 份 JD…"),
);
check(
  "重评失败显示「重新评估失败，可重试」，并说明已入库的不受影响",
  noticeSrc.includes("重新评估失败，") &&
    noticeSrc.includes("可重试") &&
    noticeSrc.includes("已经入库的经历不受影响"),
);
check(
  "随手记入库也会触发重评（不只是任务回流）",
  stripComments(
    fs2.readFileSync("src/app/(app)/notes/commit-actions.ts", "utf8"),
  ).includes("await startReassess([atomId])"),
);

// =============================================================
console.log("\n验收 21、39 · 联动收尾");
// =============================================================

const homeSrc = stripComments(fs2.readFileSync("src/app/(app)/page.tsx", "utf8"));
check(
  "首页「今天做什么」取 priority 最高的三条，用的是同一个 sortTasks",
  homeSrc.includes("sortTasks(") && homeSrc.includes(".slice(0, 3)"),
  "两处排序不一致的话首页就在骗人",
);
check(
  "首页也把各方向 impact 分别列出，不给总和",
  homeSrc.includes("function perTargetLine"),
);
check(
  "首页概览卡加了「待办行动 N 条 · 预计 M 小时」",
  homeSrc.includes('label="待办行动"') && homeSrc.includes("预计 ${board.totalHours} 小时"),
);
check(
  "「今天做什么」点进去带 ?task=，落到具体那一条",
  homeSrc.includes("/actions?task=${t.id}"),
);

check(
  "行动清单读 ?task= 并高亮＋展开",
  viewCode.includes('useSearchParams().get("task")') &&
    viewCode.includes("useState(highlighted)") &&
    viewCode.includes('outline: highlighted ? "2px solid var(--ink)"'),
);

const assessSrc = stripComments(
  fs2.readFileSync("src/components/targets/AssessPanel.tsx", "utf8"),
);
check(
  "Step 4 的「→ Step 5 会在这里生成对应行动」占位换成了真跳转",
  !assessSrc.includes("Step 5 会在这里生成对应行动") &&
    assessSrc.includes("→ 已生成行动「{link.title}」"),
);
check(
  "还没生成行动时说清楚下一步，不是留一句占位",
  assessSrc.includes("还没有对应行动，去行动清单生成一次"),
);
check(
  "已放弃／已忽略的行动不往回指",
  stripComments(fs2.readFileSync("src/lib/queries/tasks.ts", "utf8")).includes(
    'if (t.status === "dropped" || t.dismissed_at) continue;',
  ),
);

const sidebarSrc = stripComments(
  fs2.readFileSync("src/components/layout/Sidebar.tsx", "utf8"),
);
check(
  "侧栏「行动清单」徽标接真实待办数，0 时不显示",
  sidebarSrc.includes('item.href === "/actions" && todoCount > 0'),
);
check(
  "徽标数与清单同一个口径（排除已完成／已放弃／已忽略）",
  stripComments(fs2.readFileSync("src/lib/queries/tasks.ts", "utf8")).includes(
    'countOpenTasks',
  ) &&
    /countOpenTasks[\s\S]{0,400}\.is\("dismissed_at", null\)[\s\S]{0,120}\.in\("status", \["todo", "doing"\]\)/.test(
      fs2.readFileSync("src/lib/queries/tasks.ts", "utf8"),
    ),
);

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
