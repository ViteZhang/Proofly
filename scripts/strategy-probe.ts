// =============================================================
// Proofly · 经历 × 方向策略的判定探针
//
//   pnpm strategy:probe
//
// 覆盖《Step 4 方案》第七节验收 7、8、10、11，外加几条边界。
// 不连库、不调模型。
//
// 盯的是两条写错了也不会报错的规则：
//   · 没配过的经历必须按默认值处理，且不能在库里凭空生出记录；
//   · 互斥组的作用域只在单一方向内。
// 第二条尤其阴险 —— 分组时少带一个 targetId，A 方向的互斥就会漏到
// B 方向，界面照样能跑，只有到 Step 6 生成简历时才发现少了一条经历。
// =============================================================

import {
  conflictNotice,
  DEFAULT_RENDER_WEIGHT,
  findConflicts,
  mergeStrategies,
  normalizeGroup,
  RENDER_WEIGHT_ORDER,
  type Strategy,
  type StrategyRow,
} from "../src/lib/targets/strategy";

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

const A1 = "atom-1";
const A2 = "atom-2";
const A3 = "atom-3";
const TA = "target-A";
const TB = "target-B";

function s(
  atomId: string,
  targetId: string,
  renderWeight: Strategy["renderWeight"],
  exclusiveGroup: string | null,
): Strategy {
  return { atomId, targetId, renderWeight, exclusiveGroup, configured: true };
}

console.log("\n验收 7、8 · 懒加载与默认值");
{
  const merged = mergeStrategies([A1, A2], [TA, TB], []);
  check("一条记录都没有时，网格照样补齐", merged.length === 4);
  check(
    "没配过的一律是「简写」",
    merged.every((m) => m.renderWeight === DEFAULT_RENDER_WEIGHT),
  );
  check("默认值就是 brief", DEFAULT_RENDER_WEIGHT === "brief");
  check("没配过的一律标记 configured=false", merged.every((m) => !m.configured));
  check("没配过的互斥组是 null，不是空串", merged.every((m) => m.exclusiveGroup === null));
}
{
  const rows: StrategyRow[] = [
    { atom_id: A1, target_id: TA, render_weight: "expand", exclusive_group: "job_assistant" },
  ];
  const merged = mergeStrategies([A1, A2], [TA, TB], rows);
  const configured = merged.filter((m) => m.configured);
  check("只有那一条被标为已配置", configured.length === 1);
  check(
    "已配置的那条用库里的值",
    configured[0]?.renderWeight === "expand" && configured[0]?.exclusiveGroup === "job_assistant",
  );
  check(
    "同一条经历在另一个方向下仍是默认值",
    merged.find((m) => m.atomId === A1 && m.targetId === TB)?.renderWeight === "brief",
  );
}
{
  const rows: StrategyRow[] = [
    { atom_id: A1, target_id: TA, render_weight: "brief", exclusive_group: "   " },
  ];
  const merged = mergeStrategies([A1], [TA], rows);
  check("库里存了一串空格，读出来是 null", merged[0]?.exclusiveGroup === null);
  check("normalizeGroup 把空串收成 null", normalizeGroup("") === null && normalizeGroup("  ") === null);
  check("normalizeGroup 会去掉首尾空格", normalizeGroup("  组A  ") === "组A");
}

console.log("\n验收 10 · 互斥组的作用域只在单一方向内");
{
  // A 方向给两条经历设同一组，B 方向两条都不设
  const strategies = [
    s(A1, TA, "expand", "job_assistant"),
    s(A2, TA, "brief", "job_assistant"),
    s(A1, TB, "expand", null),
    s(A2, TB, "brief", null),
  ];
  const conflicts = findConflicts(strategies);
  check("A 方向撞车", conflicts.some((c) => c.targetId === TA));
  check("B 方向不撞车", !conflicts.some((c) => c.targetId === TB));
  check("总共只有一处撞车", conflicts.length === 1);
}
{
  // 更阴的一种：两个方向都用了同一个组名，但 B 方向只有一条经历在组里
  const strategies = [
    s(A1, TA, "expand", "同名组"),
    s(A2, TA, "brief", "同名组"),
    s(A1, TB, "expand", "同名组"),
    s(A2, TB, "brief", null),
  ];
  const conflicts = findConflicts(strategies);
  check(
    "组名相同但分属两个方向，只算 A 方向撞车",
    conflicts.length === 1 && conflicts[0]?.targetId === TA,
    JSON.stringify(conflicts),
  );
}
{
  // 反过来：同两条经历在 B 方向互斥、A 方向不互斥，也得成立
  const strategies = [
    s(A1, TA, "expand", null),
    s(A2, TA, "brief", null),
    s(A1, TB, "expand", "只在B生效"),
    s(A2, TB, "brief", "只在B生效"),
  ];
  const conflicts = findConflicts(strategies);
  check(
    "反过来配也对：只有 B 方向撞车",
    conflicts.length === 1 && conflicts[0]?.targetId === TB,
  );
}

console.log("\n验收 11 · 撞车的判定门槛");
{
  check(
    "同组只有一条 → 不算撞车",
    findConflicts([s(A1, TA, "expand", "g")]).length === 0,
  );
  check(
    "同组两条都非 omit → 撞车",
    findConflicts([s(A1, TA, "expand", "g"), s(A2, TA, "brief", "g")]).length === 1,
  );
  check(
    "同组两条但其中一条选了「省略」→ 不算撞车",
    findConflicts([s(A1, TA, "expand", "g"), s(A2, TA, "omit", "g")]).length === 0,
  );
  const three = findConflicts([
    s(A1, TA, "expand", "g"),
    s(A2, TA, "brief", "g"),
    s(A3, TA, "one_line", "g"),
  ]);
  check("同组三条 → 撞车，且三条都列出来", three.length === 1 && three[0]?.atomIds.length === 3);
  check(
    "同组三条里省略掉一条 → 还剩两条，仍撞车",
    findConflicts([
      s(A1, TA, "expand", "g"),
      s(A2, TA, "brief", "g"),
      s(A3, TA, "omit", "g"),
    ])[0]?.atomIds.length === 2,
  );
  check(
    "没分组的经历再多也不撞车",
    findConflicts([s(A1, TA, "expand", null), s(A2, TA, "expand", null)]).length === 0,
  );
  check(
    "不同组不撞车",
    findConflicts([s(A1, TA, "expand", "g1"), s(A2, TA, "expand", "g2")]).length === 0,
  );
}

console.log("\n文案与档位");
check("展开程度四档，顺序从重到轻", RENDER_WEIGHT_ORDER.join(",") === "expand,brief,one_line,omit");
check(
  "两条撞车时的提示与方案原文一致",
  conflictNotice(2) === "这组里有 2 条经历会同时出现，简历生成时需要二选一",
  conflictNotice(2),
);
check("三条撞车时说三条，不硬写 2", conflictNotice(3).includes("3 条"));

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
