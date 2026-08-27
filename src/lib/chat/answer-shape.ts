// =============================================================
// Proofly · QUERY 回答的形状与模板
//
// 与 query-answer.ts 分开，理由同 queries/draft-shape.ts：
// query-answer.ts 会经 @/lib/supabase/server 拉进 next/headers，
// 一旦拉进来，这段模板就再也没法脱离 Next 单独验证了。
// 而这里每一个字都会原样出现在用户眼前，它必须能被单独跑一遍。
//
// 本文件不认识数据库，只认识「查出来的行」。
// =============================================================

import {
  EVIDENCE_LABEL,
  METRIC_KIND_LABEL,
  STATUS_LABEL,
  parsePendingMetrics,
} from "@/lib/domain";
import type { AtomStatus, EvidenceLevel, Json, MetricKind } from "@/types/database";

export const PENDING_SHOWN = 3;
// 一条经历实测有 8 条指标，全铺开就是一堵墙，没人读得下去。
// 条数说真话（「已有 8 条指标」），名字只列前几个，跟待补项一个规矩。
export const METRICS_SHOWN = 3;

export type AnswerMetric = { name: string; value: string; kindLabel: string };

export type AnswerAtom = {
  atomId: string;
  title: string;
  statusLabel: string;
  evidenceLabel: string;
  metrics: AnswerMetric[];
  pendingNames: string[];
  pendingTotal: number;
  daysSinceUpdate: number | null;
};

export type QueryAnswer =
  | { kind: "atoms"; atoms: AnswerAtom[]; degraded: boolean }
  | {
      kind: "overview";
      total: number;
      byEvidence: { label: string; n: number }[];
      pendingAtoms: number;
      pendingItems: number;
    }
  | { kind: "empty" };

export type AtomRow = {
  id: string;
  title: string;
  status: string;
  evidence_level: string;
  pending_metrics: Json;
  updated_at: string | null;
};

export type MetricRow = {
  atom_id: string;
  name: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  delta: string | null;
};

/** 查出来的行 → 回答用的结构。order 是召回顺序，即相似度顺序，不能被 in() 打乱。 */
export function toAnswerAtoms(
  order: string[],
  rows: AtomRow[],
  metrics: MetricRow[],
  now = Date.now(),
): AnswerAtom[] {
  const byAtom = new Map<string, AnswerMetric[]>();
  for (const m of metrics) {
    const list = byAtom.get(m.atom_id) ?? [];
    list.push({
      name: m.name,
      value: metricValue(m),
      kindLabel: METRIC_KIND_LABEL[m.kind as MetricKind] ?? "",
    });
    byAtom.set(m.atom_id, list);
  }

  // 只列前几条时，先列结果指标：一条经历有 6 个交付物 + 2 个结果指标，
  // 按原顺序截断就会把「有没有真效果」这一半整个藏起来。
  for (const list of byAtom.values()) {
    list.sort((a, b) => rank(a.kindLabel) - rank(b.kindLabel));
  }

  const byId = new Map(rows.map((r) => [r.id, r]));

  return order
    .map((id) => byId.get(id))
    .filter((r): r is AtomRow => r !== undefined)
    .map((r) => {
      const pending = parsePendingMetrics(r.pending_metrics).map((p) => p.name);
      return {
        atomId: r.id,
        title: r.title,
        statusLabel: STATUS_LABEL[r.status as AtomStatus] ?? r.status,
        evidenceLabel: EVIDENCE_LABEL[r.evidence_level as EvidenceLevel] ?? r.evidence_level,
        metrics: byAtom.get(r.id) ?? [],
        pendingNames: pending.slice(0, PENDING_SHOWN),
        pendingTotal: pending.length,
        daysSinceUpdate: daysSince(r.updated_at, now),
      };
    });
}

function rank(kindLabel: string): number {
  return kindLabel === METRIC_KIND_LABEL.outcome ? 0 : 1;
}

// ---- 模板 ----

export function renderQueryAnswer(a: QueryAnswer): string {
  if (a.kind === "empty") {
    return "没找到相关的经历。你可以去经历库看看，或者告诉我更具体的名字。";
  }

  if (a.kind === "overview") {
    if (a.total === 0) return "经历库还是空的。传一份文档，或者直接跟我说一件事。";
    const dist = a.byEvidence.map((x) => `${x.label} ${x.n} 条`).join("、");
    const head = `经历库里一共 ${a.total} 条经历：${dist}。`;
    if (a.pendingAtoms === 0) return head;
    return `${head}\n其中 ${a.pendingAtoms} 条还有数据没填，一共 ${a.pendingItems} 项。`;
  }

  const head = a.degraded ? "向量召回没跑起来，下面是按字面匹配到的：\n\n" : "";
  return head + a.atoms.map(atomBlock).join("\n\n");
}

function atomBlock(a: AnswerAtom): string {
  const lines: string[] = [`「${a.title}」现在是${a.statusLabel}，证明度${a.evidenceLabel}。`];

  if (a.metrics.length === 0) {
    lines.push("还没有任何指标。");
  } else {
    const shown = a.metrics
      .slice(0, METRICS_SHOWN)
      .map((m) => `${m.name}${m.value === "" ? "" : ` ${m.value}`}（${m.kindLabel}）`)
      .join("、");
    const tail = a.metrics.length > METRICS_SHOWN ? "…" : "";
    lines.push(`已有 ${a.metrics.length} 条指标：${shown}${tail}`);
  }

  if (a.pendingTotal > 0) {
    const tail = a.pendingTotal > a.pendingNames.length ? "…" : "";
    lines.push(`还有 ${a.pendingTotal} 项数据没填：${a.pendingNames.join("、")}${tail}`);
  }

  if (a.daysSinceUpdate !== null) {
    lines.push(
      a.daysSinceUpdate === 0
        ? "今天刚更新过。"
        : a.daysSinceUpdate === 1
          ? "上次更新是昨天。"
          : `上次更新是 ${a.daysSinceUpdate} 天前。`,
    );
  }

  return lines.join("\n");
}

function metricValue(m: Pick<MetricRow, "from_value" | "to_value" | "delta">): string {
  if (m.from_value && m.to_value) {
    const base = `${m.from_value} → ${m.to_value}`;
    return m.delta ? `${base}（${m.delta}）` : base;
  }
  return m.delta ?? m.to_value ?? m.from_value ?? "";
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}
