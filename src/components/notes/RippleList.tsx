"use client";

// =============================================================
// Proofly · 连带影响的渲染
//
// 按 kind 分支。六个 kind 全在这里，包括 Step 5 才有数据的两个——
// 到那时候只需要往下面加数据，不用回来改结构。
//
// 每一行都是「读出来的事实」，不是推算：
// 证明度那两行的数字来自入库前后各读一次数据库，中间隔着触发器。
// =============================================================

import { EVIDENCE_LABEL, STRENGTH_LABEL } from "@/lib/domain";
import type { RippleEffect } from "@/lib/ripple/types";
import type { EvidenceLevel, EvidenceStrength } from "@/types/database";

export function RippleList({
  effects,
  titles = {},
}: {
  effects: RippleEffect[];
  /** atomId → 标题。同一条经历自己的卡上用不着，跨条时才需要。 */
  titles?: Record<string, string>;
}) {
  if (effects.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-[12px]" style={{ color: "var(--mute)" }}>
        会连带影响
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {effects.map((e, i) => (
          <li key={i} className="text-[13px]" style={{ color: "var(--ai)" }}>
            · {line(e, titles)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function line(e: RippleEffect, titles: Record<string, string>): string {
  switch (e.kind) {
    case "proof_change": {
      const who = titles[e.atomId];
      const head = who === undefined ? "这条经历的证明度" : `「${who}」的证明度`;
      return `${head}：${evidence(e.from)} → ${evidence(e.to)}`;
    }

    case "global_proof_change":
      return `全库证明度：${e.from}% → ${e.to}%`;

    case "pending_resolved":
      return `待补数据「${e.metricName}」落地了`;

    case "skill_strength_change":
      return `技能「${e.label}」的证据强度：${strength(e.from)} → ${strength(e.to)}`;

    // ↓ Step 5 才会有数据。分支现在就留好，那时候只补数据不动结构。
    case "match_score_change":
      return `与某个求职方向的匹配度：${e.from} → ${e.to}`;

    case "task_auto_complete":
      return `行动清单里的「${e.title}」自动完成了`;
  }
}

function evidence(v: string): string {
  return EVIDENCE_LABEL[v as EvidenceLevel] ?? v;
}

function strength(v: string): string {
  return STRENGTH_LABEL[v as EvidenceStrength] ?? v;
}
