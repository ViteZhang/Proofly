// =============================================================
// Proofly · 领域词汇与 jsonb 形状
// 数据库里 actions / pending_metrics / probes / conflict_log 都是无类型 jsonb，
// 读出来必须过一遍解析函数：坏数据降级为空，不让页面白屏。
// =============================================================

import type {
  AtomContext,
  AtomStatus,
  EvidenceLevel,
  EvidenceStrength,
  Json,
  MetricKind,
} from "@/types/database";

// ---- Server Action 统一返回类型 ----
// 约定：任何写操作都不抛异常，失败以 { ok: false, error } 返回可读中文。
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = null>(error: string): ActionResult<T> {
  return { ok: false, error };
}

// ---- jsonb 形状 ----

// atoms.pending_metrics：待补数据。id 只在前端做稳定 key 与删除定位用。
export type PendingMetric = { id: string; name: string; note: string | null };

// guards.probes：被追问时的问答要点
export type Probe = { q: string; a_outline: string };

// profile_facts.conflict_log：一处事实的多个来源取值
export type FactConflict = { value: string; source: string };

export function parseStringList(v: Json | null | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

export function parsePendingMetrics(v: Json | null | undefined): PendingMetric[] {
  if (!Array.isArray(v)) return [];
  const out: PendingMetric[] = [];
  for (const raw of v) {
    if (typeof raw === "string") {
      // 兼容早期只存名字的写法
      out.push({ id: raw, name: raw, note: null });
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json | undefined>;
    const name = typeof o.name === "string" ? o.name : null;
    if (!name) continue;
    out.push({
      id: typeof o.id === "string" ? o.id : name,
      name,
      note: typeof o.note === "string" ? o.note : null,
    });
  }
  return out;
}

export function parseProbes(v: Json | null | undefined): Probe[] {
  if (!Array.isArray(v)) return [];
  const out: Probe[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json | undefined>;
    if (typeof o.q !== "string" || o.q.trim() === "") continue;
    out.push({ q: o.q, a_outline: typeof o.a_outline === "string" ? o.a_outline : "" });
  }
  return out;
}

export function parseFactConflicts(v: Json | null | undefined): FactConflict[] {
  if (!Array.isArray(v)) return [];
  const out: FactConflict[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json | undefined>;
    if (typeof o.value !== "string") continue;
    out.push({ value: o.value, source: typeof o.source === "string" ? o.source : "" });
  }
  return out;
}

// ---- 证明度 ----
// 顺序即强弱，越靠前越强；筛选胶囊与图例都按这个顺序排。
export const EVIDENCE_ORDER: EvidenceLevel[] = [
  "measured",
  "estimated",
  "designed_only",
  "absent",
];

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  measured: "实测",
  estimated: "估算",
  designed_only: "仅设计",
  absent: "无证据",
};

// 树与图例里的四档标记
export const EVIDENCE_DOT: Record<EvidenceLevel, string> = {
  measured: "●",
  estimated: "◐",
  designed_only: "○",
  absent: "◌",
};

// 证明环百分比的档位权重。
// 待《交互设计方案 v1.1》S2 确认，1.7 接 Hero 时若有出入以方案为准。
export const EVIDENCE_WEIGHT: Record<EvidenceLevel, number> = {
  measured: 1,
  estimated: 0.6,
  designed_only: 0.3,
  absent: 0,
};

export const METRIC_KIND_LABEL: Record<MetricKind, string> = {
  outcome: "结果指标",
  output: "交付物",
};

export const STATUS_LABEL: Record<AtomStatus, string> = {
  concept: "构想",
  design_done: "设计完成",
  in_dev: "开发中",
  shipped: "已上线",
  sunset: "已下线",
};

export const CONTEXT_LABEL: Record<AtomContext, string> = {
  employment: "任职",
  side_project: "个人项目",
  volunteer: "志愿",
  community: "社区",
};

export const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  strong: "强",
  weak: "弱",
  none: "无",
};
