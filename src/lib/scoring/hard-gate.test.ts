// =============================================================
// 硬门槛不参与打分的单测
//
// 恒等式（Σscore_loss = 100 − match_score）是这套算分唯一的自检。
// 新加一类「整条排除在加权之外」的要求最容易把它弄坏，所以单独钉一组。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, score } from "./index";
import type { AtomFact, RequirementInput, Verdict } from "./types";

const atom: AtomFact = { id: "a1", title: "AI 助手 0→1", evidenceLevel: "measured" };

function req(
  index: number,
  kind: RequirementInput["kind"],
  gate: RequirementInput["hardGate"] = null,
): RequirementInput {
  return {
    id: `r-${index}`,
    index,
    text: `要求 ${index}`,
    rawPhrase: null,
    kind,
    isStructural: false,
    mappedKind: gate ? "education" : "skill",
    hardGate: gate,
  };
}

const full = (index: number): Verdict => ({
  requirementIndex: index,
  coverage: "full",
  matchedAtomIds: ["a1"],
  reason: "",
  relatedSkillLabels: [],
});

test("满足的硬门槛不加分，也不改变别的要求的权重", () => {
  const withoutGate = score([req(1, "hard"), req(2, "hard")], [full(1), full(2)], [atom], []);
  const withGate = score(
    [req(1, "hard"), req(2, "hard"), req(3, "hard", { verdict: "met", detail: "" })],
    [full(1), full(2)],
    [atom],
    [],
  );
  assert.equal(withGate.matchScore, withoutGate.matchScore);
});

test("不满足的硬门槛不扣分 —— 一条三个月不会变的因素不该常驻压低分数", () => {
  const r = score(
    [req(1, "hard"), req(2, "hard", { verdict: "unmet", detail: "要硕士" })],
    [full(1)],
    [atom],
    [],
  );
  assert.equal(r.matchScore, 100);
  assert.equal(r.results.find((x) => x.requirementIndex === 2)?.scoreLoss, 0);
});

test("不满足的硬门槛产出 hard_disqualifier，判不了的什么都不产出", () => {
  const r = score(
    [
      req(1, "hard", { verdict: "unmet", detail: "" }),
      req(2, "hard", { verdict: "unknown", detail: "" }),
      req(3, "hard", { verdict: "met", detail: "" }),
    ],
    [],
    [],
    [],
  );
  assert.equal(r.results[0].gapType, "hard_disqualifier");
  // 「档案里还没填学历」不是缺口，是我们还不知道
  assert.equal(r.results[1].gapType, null);
  assert.equal(r.results[2].gapType, null);
});

test("硬门槛不进失分构成那张表", () => {
  const r = score(
    [req(1, "hard"), req(2, "hard", { verdict: "unmet", detail: "" })],
    [{ requirementIndex: 1, coverage: "none", matchedAtomIds: [], reason: "", relatedSkillLabels: [] }],
    [atom],
    [],
  );
  const buckets = aggregate(r.results);
  assert.equal(
    buckets.some((b) => b.gapType === "hard_disqualifier"),
    false,
  );
});

test("整份 JD 全是硬门槛时给 0 分，不是 NaN", () => {
  const r = score([req(1, "hard", { verdict: "unmet", detail: "" })], [], [], []);
  assert.equal(r.matchScore, 0);
  assert.ok(Number.isFinite(r.matchScore));
});

test("恒等式在混了硬门槛之后仍然成立", () => {
  // score() 内部会自检并抛错，这里再显式核一遍，免得哪天自检被摘掉
  const r = score(
    [
      req(1, "hard"),
      req(2, "implicit"),
      req(3, "hard", { verdict: "unmet", detail: "" }),
      req(4, "nice_to_have"),
    ],
    [full(1)],
    [atom],
    [],
  );
  const loss = r.results.reduce((s, x) => s + x.scoreLoss, 0);
  assert.ok(Math.abs(loss - (100 - r.matchScore)) < 0.01, `Σloss=${loss} score=${r.matchScore}`);
});
