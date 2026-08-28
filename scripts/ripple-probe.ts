// =============================================================
// Proofly · 连带影响做差的探针
//
//   pnpm ripple:probe
//
// 覆盖《Step 3 方案》第七节验收 25–28，外加三条边界。
// 用固定快照喂 diffRipple，不连库也不调模型——
// 这一段的唯一职责就是「两份快照进，一串事实出」，
// 它必须能被单独喂数据验证，否则「界面显示的与数据库一致」无从谈起。
// =============================================================

import { diffRipple } from "../src/lib/ripple/diff";
import { STEP5_KINDS } from "../src/lib/ripple/types";
import type { AppliedChange, RippleEffect, RippleState } from "../src/lib/ripple/types";

const ATOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_ATOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SKILL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const state = (over: Partial<RippleState>): RippleState => ({
  atoms: [],
  skills: [],
  globalScore: 46,
  ...over,
});

const atom = (over: Partial<RippleState["atoms"][number]> = {}) => ({
  atomId: ATOM,
  evidenceLevel: "designed_only",
  pendingNames: ["日活渗透率", "意图路由准确率"],
  metricCount: 1,
  ...over,
});

const skill = (strength: string) => ({ skillId: SKILL, label: "意图路由", strength });

type Case = {
  id: string;
  changes: AppliedChange[];
  before: RippleState;
  after: RippleState;
  want: (e: RippleEffect[]) => string | null;
};

const has = (kind: string, extra?: (e: RippleEffect) => boolean) => (es: RippleEffect[]) => {
  const hit = es.filter((e) => e.kind === kind && (extra === undefined || extra(e)));
  return hit.length > 0 ? null : `没有 ${kind}（实得 ${es.map((x) => x.kind).join("、") || "空"}）`;
};

const lacks = (kind: string) => (es: RippleEffect[]) =>
  es.some((e) => e.kind === kind) ? `不该有 ${kind}` : null;

const all = (...fns: ((e: RippleEffect[]) => string | null)[]) => (es: RippleEffect[]) =>
  fns.map((f) => f(es)).filter((x): x is string => x !== null).join("；") || null;

const CASES: Case[] = [
  {
    id: "验收 25 · 补一条 outcome 实测指标",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()] }),
    after: state({
      atoms: [atom({ evidenceLevel: "measured", metricCount: 2 })],
      globalScore: 54,
    }),
    want: all(
      has("proof_change", (e) => e.kind === "proof_change" && e.to === "measured"),
      has("global_proof_change", (e) => e.kind === "global_proof_change" && e.to === 54),
    ),
  },
  {
    id: "验收 26 · 填掉一个待补项",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()] }),
    after: state({
      atoms: [
        atom({
          evidenceLevel: "measured",
          pendingNames: ["意图路由准确率"],
          metricCount: 2,
        }),
      ],
      globalScore: 54,
    }),
    want: has(
      "pending_resolved",
      (e) => e.kind === "pending_resolved" && e.metricName === "日活渗透率",
    ),
  },
  {
    id: "验收 27 · 技能从弱变强",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()], skills: [skill("weak")] }),
    after: state({
      atoms: [atom({ evidenceLevel: "measured", metricCount: 2 })],
      skills: [skill("strong")],
      globalScore: 54,
    }),
    want: has(
      "skill_strength_change",
      (e) => e.kind === "skill_strength_change" && e.from === "weak" && e.to === "strong",
    ),
  },
  {
    id: "验收 28 · 补一条 output 指标，证明度不动",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()] }),
    after: state({ atoms: [atom({ metricCount: 2 })] }),
    want: all(lacks("proof_change"), lacks("global_proof_change")),
  },
  {
    id: "边界 · 新建的经历没有「从 X 变成 Y」",
    changes: [{ atomId: NEW_ATOM, created: true }],
    before: state({ atoms: [] }),
    after: state({
      atoms: [{ atomId: NEW_ATOM, evidenceLevel: "absent", pendingNames: [], metricCount: 0 }],
      globalScore: 42,
    }),
    want: all(
      lacks("proof_change"),
      has("global_proof_change", (e) => e.kind === "global_proof_change" && e.to === 42),
    ),
  },
  {
    id: "边界 · 待补项被删掉但没加指标，不算落地",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()] }),
    after: state({ atoms: [atom({ pendingNames: ["意图路由准确率"] })] }),
    want: lacks("pending_resolved"),
  },
  {
    id: "边界 · 新出现的技能从 none 起算",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()], skills: [] }),
    after: state({ atoms: [atom()], skills: [skill("weak")] }),
    want: has(
      "skill_strength_change",
      (e) => e.kind === "skill_strength_change" && e.from === "none" && e.to === "weak",
    ),
  },
  {
    id: "边界 · 什么都没变就不该有任何一条",
    changes: [{ atomId: ATOM }],
    before: state({ atoms: [atom()], skills: [skill("weak")] }),
    after: state({ atoms: [atom()], skills: [skill("weak")] }),
    want: (es) => (es.length === 0 ? null : `实得 ${es.length} 条`),
  },
];

let pass = 0;
for (const c of CASES) {
  const effects = diffRipple(c.changes, c.before, c.after);
  const bad = c.want(effects);

  // Step 5 的两个 kind 本步一个都不该出现
  const leaked = effects.filter((e) => (STEP5_KINDS as string[]).includes(e.kind));
  const step5 = leaked.length === 0 ? null : `混进了 Step 5 的 ${leaked.map((e) => e.kind).join("、")}`;

  const err = [bad, step5].filter((x): x is string => x !== null).join("；");
  if (err === "") pass++;
  console.log(`${err === "" ? "✓" : "✗"} ${c.id}${err === "" ? "" : `\n    ${err}`}`);
  if (err === "" && effects.length > 0) {
    console.log(`    ${effects.map((e) => e.kind).join("、")}`);
  }
}

console.log(`\n${pass} / ${CASES.length} 项通过`);
if (pass < CASES.length) process.exitCode = 1;
