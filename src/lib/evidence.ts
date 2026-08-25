// =============================================================
// Proofly · 证明度为什么是这一档
// 这里的分支必须跟 01_extensions_and_helpers.sql 里 recompute_atom_evidence()
// 一一对应。推导在数据库里做，解释在这里做——两边一旦走岔，用户看到的
// 就是一句骗人的话，比不解释更糟。
// =============================================================

import { EVIDENCE_LABEL, STATUS_LABEL } from "@/lib/domain";
import type { AtomMetric } from "@/lib/queries/atoms";
import type { AtomStatus, EvidenceLevel } from "@/types/database";

export type EvidenceExplain = { title: string; lines: string[] };

// measured > estimated > designed_only，与 SQL 里的 bool_or 顺序一致
function strongest(metrics: AtomMetric[]): { level: EvidenceLevel; name: string } | null {
  for (const level of ["measured", "estimated", "designed_only"] as const) {
    const hit = metrics.find((m) => m.evidence_level === level);
    if (hit) return { level, name: hit.name };
  }
  return null;
}

export function explainEvidence(
  level: EvidenceLevel,
  status: AtomStatus,
  metrics: AtomMetric[],
): EvidenceExplain {
  const outcomes = metrics.filter((m) => m.kind === "outcome");
  const outputs = metrics.filter((m) => m.kind === "output");
  const best = strongest(outcomes);

  const lines: string[] = [];

  if (best?.level === "measured") {
    lines.push(`结果指标里有实测的：「${best.name}」。`);
    lines.push("这是最高一档。把它删掉或者降级，才会往下掉。");
  } else if (best?.level === "estimated") {
    lines.push(`结果指标里最强的一条是估算的：「${best.name}」。`);
    lines.push("换成实测数据之后会自动升级。");
  } else if (best?.level === "designed_only") {
    lines.push("结果指标都还是设计阶段的预期值，没有真实数据。");
    lines.push("补一条估算或者实测的，证明度就会往上走。");
  } else if (status === "design_done" || status === "in_dev") {
    lines.push(`这条经历没有结果类指标，状态是「${STATUS_LABEL[status]}」。`);
    lines.push("有了实测的结果数据之后会自动升级。");
  } else {
    lines.push(`这条经历没有结果类指标，状态是「${STATUS_LABEL[status]}」。`);
    lines.push("补一条结果指标，证明度就会跟着变。");
  }

  // 只在真有交付物指标时才说这句——用户正是在这时候会觉得「我明明填了指标」。
  if (outputs.length > 0) {
    lines.push(
      `交付物类指标不参与推导——这条有 ${outputs.length} 条交付物指标，` +
        "交付了东西不等于产生了效果。",
    );
  }

  return { title: `为什么是「${EVIDENCE_LABEL[level]}」`, lines };
}

// 技能证据强度的判定说明。这条是固定规则，不随单条技能变。
export const STRENGTH_EXPLAIN: EvidenceExplain = {
  title: "强 / 弱怎么判定",
  lines: [
    "关联到任意一条「实测」经历 → 强",
    "有关联但都不是实测 → 弱",
    "没有任何关联 → 无（这种技能不会出现在简历技能栏里）",
  ],
};
