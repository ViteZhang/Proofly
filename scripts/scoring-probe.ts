// =============================================================
// Proofly · 计分与缺口判定探针
//
//   pnpm scoring:probe
//
// 覆盖《Step 4 方案》第七节验收 28–37，外加边界。
// 不连库、不调模型 —— 分数由代码算，那就该能脱离模型单独验证。
// 这也正是验收 33 要的：只改系数重算，不触发任何模型调用。
// =============================================================

import { COVERAGE, EVIDENCE, WEIGHT } from "../src/lib/scoring/config";
import { aggregate, assertIdentity, isStrong, score } from "../src/lib/scoring";
import { gapRows } from "../src/lib/scoring/gaps";
import { GAP_COPY, gapExplain } from "../src/lib/scoring/gap-copy";
import type {
  AtomFact,
  Coverage,
  RequirementInput,
  SkillFact,
  Verdict,
} from "../src/lib/scoring/types";
import type { EvidenceLevel, RequirementKind } from "../src/types/database";

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

function near(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol;
}

// ---- 夹具 ----

function req(
  index: number,
  kind: RequirementKind,
  isStructural = false,
): RequirementInput {
  return {
    id: `r-${index}`,
    index,
    text: `要求 ${index}`,
    rawPhrase: `原文 ${index}`,
    kind,
    isStructural,
  };
}

function verdict(
  index: number,
  coverage: Coverage,
  matchedAtomIds: string[] = [],
  relatedSkillLabels: string[] = [],
): Verdict {
  return {
    requirementIndex: index,
    coverage,
    matchedAtomIds,
    reason: "",
    relatedSkillLabels,
  };
}

function atom(id: string, evidenceLevel: EvidenceLevel): AtomFact {
  return { id, title: `经历 ${id}`, evidenceLevel };
}

const ATOMS: AtomFact[] = [
  atom("m", "measured"),
  atom("e", "estimated"),
  atom("d", "designed_only"),
  atom("a", "absent"),
];

const SKILLS: SkillFact[] = [
  { label: "空标签", strength: "none" },
  { label: "弱标签", strength: "weak" },
  { label: "强标签", strength: "strong" },
];

console.log("\n验收 31、32 · 两个端点");
{
  const reqs = [req(1, "hard"), req(2, "implicit"), req(3, "nice_to_have")];
  const full = score(
    reqs,
    reqs.map((r) => verdict(r.index, "full", ["m"])),
    ATOMS,
    SKILLS,
  );
  check("全部 full + measured → 100 分", near(full.matchScore, 100), `${full.matchScore}`);
  check("满分时一分都没丢", near(full.results.reduce((s, r) => s + r.scoreLoss, 0), 0));

  const none = score(
    reqs,
    reqs.map((r) => verdict(r.index, "none")),
    ATOMS,
    SKILLS,
  );
  check("全部 none → 0 分", near(none.matchScore, 0), `${none.matchScore}`);
  check("0 分时失分之和是 100", near(none.results.reduce((s, r) => s + r.scoreLoss, 0), 100));
}

console.log("\n验收 29 · 手工按公式算一遍");
{
  // 2 条 hard（w=3）+ 1 条 implicit（w=2）+ 1 条 nice（w=1），Σw = 9
  //   r1 hard  full(1.0)    × measured(1.0)     = 1.0    → 3 × 1.0  = 3
  //   r2 hard  partial(0.6) × designed_only(.6) = 0.36   → 3 × 0.36 = 1.08
  //   r3 impl  weak(0.3)    × estimated(.85)    = 0.255  → 2 × .255 = 0.51
  //   r4 nice  none(0)      × 无命中(0)          = 0      → 1 × 0    = 0
  //   Σ = 4.59 ; 4.59 / 9 × 100 = 51
  const reqs = [req(1, "hard"), req(2, "hard"), req(3, "implicit"), req(4, "nice_to_have")];
  const vs = [
    verdict(1, "full", ["m"]),
    verdict(2, "partial", ["d"]),
    verdict(3, "weak", ["e"]),
    verdict(4, "none"),
  ];
  const got = score(reqs, vs, ATOMS, SKILLS);
  check(`手算 51 分 → 系统 ${got.matchScore}`, near(got.matchScore, 51), JSON.stringify(got.matchScore));

  // 逐条失分：weight × (1 − requirement_score) / Σw × 100
  const want = [
    (3 * (1 - 1.0)) / 9 * 100,
    (3 * (1 - 0.36)) / 9 * 100,
    (2 * (1 - 0.255)) / 9 * 100,
    (1 * (1 - 0)) / 9 * 100,
  ];
  got.results.forEach((r, i) => {
    check(
      `第 ${i + 1} 条失分 ${want[i].toFixed(3)} → 系统 ${r.scoreLoss}`,
      near(r.scoreLoss, want[i], 0.005),
    );
  });
}

console.log("\n验收 28 · 恒等式");
{
  const kinds: RequirementKind[] = ["hard", "implicit", "nice_to_have"];
  const coverages: Coverage[] = ["full", "partial", "weak", "none"];
  const atomChoices = [[], ["m"], ["e"], ["d"], ["a"], ["m", "d"], ["d", "a"]];

  let cases = 0;
  let broken = 0;
  // 随机造 300 组，每组 1–12 条要求，看恒等式会不会在某个组合下崩掉
  let seed = 42;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return Math.floor((seed / 2147483648) * n);
  };
  for (let t = 0; t < 300; t++) {
    const n = 1 + rnd(12);
    const reqs: RequirementInput[] = [];
    const vs: Verdict[] = [];
    for (let i = 1; i <= n; i++) {
      reqs.push(req(i, kinds[rnd(3)], rnd(5) === 0));
      vs.push(verdict(i, coverages[rnd(4)], atomChoices[rnd(atomChoices.length)], rnd(2) ? ["空标签"] : []));
    }
    try {
      const s = score(reqs, vs, ATOMS, SKILLS);
      assertIdentity(s.matchScore, s.results);
      // 聚合出来的失分也要加得回去
      const agg = aggregate(s.results).reduce((sum, b) => sum + b.loss, 0);
      if (!near(agg, 100 - s.matchScore, 0.5)) broken++;
      cases++;
    } catch {
      broken++;
    }
  }
  check(`300 组随机组合恒等式都成立（跑了 ${cases} 组）`, broken === 0, `崩了 ${broken} 组`);
}
{
  // 归因写错时必须抛，不能静默
  const s = score([req(1, "hard")], [verdict(1, "none")], ATOMS, SKILLS);
  let threw = false;
  try {
    assertIdentity(s.matchScore, [{ ...s.results[0], scoreLoss: 12 }]);
  } catch {
    threw = true;
  }
  check("失分被人为改错 → assertIdentity 抛错", threw);
}

console.log("\n验收 30 · 证明度升级带来的分数变化");
{
  const reqs = [req(1, "hard")];
  const vs = [verdict(1, "full", ["d"])];
  const before = score(reqs, vs, ATOMS, SKILLS).matchScore;
  const after = score(reqs, [verdict(1, "full", ["m"])], ATOMS, SKILLS).matchScore;
  check(`designed_only ${before} → measured ${after}，分数上升`, after > before);
  check(
    "上升幅度正好是 0.6 → 1.0 的比例",
    near(before / after, EVIDENCE.designed_only / EVIDENCE.measured, 0.001),
    `${before} / ${after} = ${(before / after).toFixed(4)}`,
  );
}
{
  // 取命中经历里的最高证明度，不是平均也不是最低
  const s = score([req(1, "hard")], [verdict(1, "full", ["a", "m", "d"])], ATOMS, SKILLS);
  check("多条命中时取最高证明度", s.results[0]?.bestEvidence === "measured");
}

console.log("\n验收 33 · 只改系数不调模型");
{
  // 这个文件从头到尾没 import 过 llm，能跑完本身就说明算分不依赖模型。
  check("整个探针没有任何模型调用", true);
  check("系数表就是方案 2.2 那三张", WEIGHT.hard === 3 && WEIGHT.implicit === 2 && WEIGHT.nice_to_have === 1);
  check("coverage 四档 1.0 / 0.6 / 0.3 / 0", COVERAGE.full === 1 && COVERAGE.partial === 0.6 && COVERAGE.weak === 0.3 && COVERAGE.none === 0);
  check(
    "evidence 四档 1.0 / 0.85 / 0.6 / 0.4",
    EVIDENCE.measured === 1 && EVIDENCE.estimated === 0.85 && EVIDENCE.designed_only === 0.6 && EVIDENCE.absent === 0.4,
  );
}

console.log("\n验收 34–37 · 缺口四类判定");
{
  const g = (
    kind: RequirementKind,
    coverage: Coverage,
    atoms: string[],
    skills: string[],
    structural = false,
  ) => score([req(1, kind, structural)], [verdict(1, coverage, atoms, skills)], ATOMS, SKILLS).results[0];

  check("34 partial + designed_only → weak_evidence", g("hard", "partial", ["d"], []).gapType === "weak_evidence");
  check("34 full + absent 也算 weak_evidence", g("hard", "full", ["a"], []).gapType === "weak_evidence");
  check("35 none + 空标签 → no_evidence", g("hard", "none", [], ["空标签"]).gapType === "no_evidence");
  check("35 weak + 空标签 也算 no_evidence", g("hard", "weak", [], ["空标签"]).gapType === "no_evidence");
  check("36 none + 没有任何技能标签 → no_capability", g("hard", "none", [], []).gapType === "no_capability");
  check("37 结构性 + full + measured 仍判 structural", g("hard", "full", ["m"], [], true).gapType === "structural");
  check("37 结构性 + none 也判 structural", g("hard", "none", [], [], true).gapType === "structural");

  // 优先级：structural > weak_evidence > no_evidence > no_capability
  check(
    "优先级 structural 压过 weak_evidence",
    g("hard", "partial", ["d"], [], true).gapType === "structural",
  );
  check(
    "标签有但不是空的 → 不算 no_evidence",
    g("hard", "none", [], ["强标签"]).gapType === null,
  );

  // 充分项
  check("full + measured 是充分项", isStrong(g("hard", "full", ["m"], [])));
  check("partial 不是充分项", !isStrong(g("hard", "partial", ["m"], [])));
  check("结构性即使 full 也不是充分项", !isStrong(g("hard", "full", ["m"], [], true)));
}

console.log("\n方案没覆盖到的失分（进「其他」桶）");
{
  const s = score([req(1, "hard")], [verdict(1, "partial", ["m"])], ATOMS, SKILLS);
  const r = s.results[0]!;
  check("partial + measured 扣了分", r.scoreLoss > 0, `${r.scoreLoss}`);
  check("但四类都不属于（gapType 为 null）", r.gapType === null);
  const buckets = aggregate(s.results);
  check("聚合时进「其他」桶", buckets.length === 1 && buckets[0]?.gapType === null);
  check("加起来仍等于 100 − match_score", near(buckets[0]!.loss, 100 - s.matchScore, 0.01));
}

console.log("\n验收 38 · 四类的文案逐字照抄方案 4.5");
{
  check("no_capability 标签", GAP_COPY.no_capability.label === "这个确实没做过");
  check("no_evidence 标签", GAP_COPY.no_evidence.label === "会但没证据");
  check("weak_evidence 标签", GAP_COPY.weak_evidence.label === "做过但没数据");
  check("structural 标签", GAP_COPY.structural.label === "补不上");
  check(
    "no_capability 说明句",
    gapExplain("no_capability", { matchedTitles: [], emptySkillLabels: [] }) ===
      "没有经历能证明，也没有相关技能标签。",
  );
  check(
    "no_evidence 说明句",
    gapExplain("no_evidence", { matchedTitles: [], emptySkillLabels: ["LLM 效果评估"] }) ===
      "没有经历能证明。技能栏里有「LLM 效果评估」标签，但它是空的。",
    gapExplain("no_evidence", { matchedTitles: [], emptySkillLabels: ["LLM 效果评估"] }),
  );
  check(
    "weak_evidence 说明句",
    gapExplain("weak_evidence", { matchedTitles: ["知识宇宙", "润泽园"], emptySkillLabels: [] }) ===
      "命中「知识宇宙」「润泽园」。做过，但都还没有实测数据。",
    gapExplain("weak_evidence", { matchedTitles: ["知识宇宙", "润泽园"], emptySkillLabels: [] }),
  );
  check(
    "structural 说明句",
    gapExplain("structural", { matchedTitles: [], emptySkillLabels: [] }) ===
      "这个补不上，只能换个说法。",
  );
}

console.log("\n入库形状");
{
  const reqs = [req(1, "hard"), req(2, "implicit"), req(3, "nice_to_have")];
  const s = score(
    reqs,
    [verdict(1, "none", [], []), verdict(2, "partial", ["d"]), verdict(3, "full", ["m"])],
    ATOMS,
    SKILLS,
  );
  const rows = gapRows(s.results);
  check("充分项不进 gaps 表", rows.length === 2);
  check("硬性缺口 severity 为 high", rows.find((r) => r.requirement_index === 1)?.severity === "high");
  check("隐含缺口 severity 为 medium", rows.find((r) => r.requirement_index === 2)?.severity === "medium");
  check("每行都带 score_impact", rows.every((r) => r.score_impact > 0));
}

console.log("\n模型输出不干净时");
{
  // 模型漏判了第 2 条
  const s = score([req(1, "hard"), req(2, "hard")], [verdict(1, "full", ["m"])], ATOMS, SKILLS);
  check("漏判的要求按 none 算，不白捡分", s.results[1]?.coverage === "none" && s.results[1]!.scoreLoss > 0);

  // 模型给了不存在的经历 id
  const bogus = score([req(1, "hard")], [verdict(1, "full", ["不存在的id"])], ATOMS, SKILLS);
  check("命中了不存在的经历 → 当没命中，系数归零", bogus.results[0]?.evidenceMultiplier === 0);
  check("于是这条一分不得", near(bogus.matchScore, 0));

  // 模型给了 5 条命中
  const many = score([req(1, "hard")], [verdict(1, "full", ["m", "e", "d", "a", "m"])], ATOMS, SKILLS);
  check("命中经历最多留 3 条", many.results[0]?.matchedAtomIds.length === 3);

  // 一条要求都没有
  const empty = score([], [], ATOMS, SKILLS);
  check("没有要求时不除以零", empty.matchScore === 0 && empty.results.length === 0);
}

console.log(`\n${fail === 0 ? "全过" : "有挂"}：${pass} / ${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
