// =============================================================
// Proofly · 两次快照做差
//
// 纯函数，不认识数据库——所以能脱离 Next 单独跑一遍。
// 界面上显示的证明度变化必须与数据库实际值一致（验收 29），
// 而「一致」这件事只有在这段逻辑能被单独喂数据验证时才谈得上。
// =============================================================

import type { AppliedChange, RippleEffect, RippleState } from "./types";

export function diffRipple(
  changes: AppliedChange[],
  before: RippleState,
  after: RippleState,
): RippleEffect[] {
  const out: RippleEffect[] = [];

  const beforeAtoms = new Map(before.atoms.map((a) => [a.atomId, a]));
  const afterAtoms = new Map(after.atoms.map((a) => [a.atomId, a]));

  for (const c of changes) {
    const b = beforeAtoms.get(c.atomId);
    const a = afterAtoms.get(c.atomId);
    if (a === undefined) continue;

    // 新建的经历没有「从 X 变成 Y」。它对全库证明度的影响由下面那条负责。
    if (c.created !== true && b !== undefined && b.evidenceLevel !== a.evidenceLevel) {
      out.push({
        kind: "proof_change",
        atomId: c.atomId,
        from: b.evidenceLevel,
        to: a.evidenceLevel,
      });
    }

    if (b === undefined) continue;

    // 待补项消解：从清单里消失，且这条经历这次确实多了指标。
    // 只看「消失」不够——用户手动删掉一项也会消失，那不叫落地。
    if (a.metricCount > b.metricCount) {
      const gone = b.pendingNames.filter((n) => !a.pendingNames.includes(n));
      for (const name of gone) {
        out.push({ kind: "pending_resolved", atomId: c.atomId, metricName: name });
      }
    }
  }

  // 技能证据强度：全量比对。
  // 只比「这次动过的经历关联的技能」是不够的——新建经历会带出此前不存在的
  // 技能行，它不在任何旧的关联里，却实实在在从无到有了。
  const beforeSkills = new Map(before.skills.map((s) => [s.skillId, s]));
  for (const s of after.skills) {
    const b = beforeSkills.get(s.skillId);
    const from = b?.strength ?? "none";
    if (from !== s.strength) {
      out.push({
        kind: "skill_strength_change",
        skillId: s.skillId,
        label: s.label,
        from,
        to: s.strength,
      });
    }
  }

  if (before.globalScore !== after.globalScore) {
    out.push({
      kind: "global_proof_change",
      from: before.globalScore,
      to: after.globalScore,
    });
  }

  return out;
}
