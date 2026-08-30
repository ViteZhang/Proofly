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

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
