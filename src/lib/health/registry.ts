// =============================================================
// 检查项登记
//
// 快扫与深扫分开列：快扫全是数据库查询与文本比对，零 LLM 调用，
// 必须在进页面时瞬时完成（《Step 8》§十-4）。深扫要调模型，只能手动触发。
// =============================================================

import type { HealthCheck } from "./types";
import { c1Facts } from "./c1-facts";
import { c2Skills, c3Wording, c4NeverSay, c5Exclusive } from "./c2-c5-gate";
import { c9Stale } from "./c9-stale";
import { c10Method } from "./c10-method";

/** 快扫。顺序即体检页「通过项」里的展示顺序。 */
export const QUICK_CHECKS: HealthCheck[] = [
  c1Facts,
  c2Skills,
  c3Wording,
  c4NeverSay,
  c5Exclusive,
  c9Stale,
  c10Method,
];

/** 深扫。C8 在切片 8.4 接进来。 */
export const DEEP_CHECKS: HealthCheck[] = [];

export const ALL_CHECKS = [...QUICK_CHECKS, ...DEEP_CHECKS];

export function checkByCode(code: string): HealthCheck | undefined {
  return ALL_CHECKS.find((c) => c.code === code);
}
