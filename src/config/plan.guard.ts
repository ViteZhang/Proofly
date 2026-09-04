// =============================================================
// Proofly · 价目守卫
//
// 「每个动作的标价只会降、不会涨」这句承诺，靠的是这个文件。
//
// 为什么需要它：积分数字不变，购买力会变。文档解析从 15 分涨到
// 20 分，用户手里的 200 分就从 13 次缩水成 10 次 —— 这是实质
// 贬值，只是不体现在余额上。（技术方案 0.1）
//
// 下面的 PRICE_FLOOR_HISTORY 是历史最低价的快照，必须手写字面量。
// 想调价：只能往下改 ACTION_PRICES，然后把 floor 同步下调。想上调
// 任何一项 —— 来找人类确认，不要自己改这个文件。
//
// 检查在构建期跑（package.json 的 build 脚本），改高即构建失败。
// =============================================================

import { ACTION_PRICES, type ActionCode } from "./plan";

/**
 * 历史最低价。
 *
 * 注意：这里必须是手写的字面量，不能写成 `{ ...ACTION_PRICES }`。
 * 那样写守卫永远为真，等于没写 —— 它会跟着涨价一起涨。
 *
 * 新增动作不必先登记，第一次构建后把它的初值补进来即可（新动作
 * 不在 floor 里时守卫放行，见 checkPrices）。
 */
export const PRICE_FLOOR_HISTORY: Partial<Record<ActionCode, number>> = {
  doc_parse_base: 15,
  doc_parse_extra_seg: 3,
  doc_parse_scan_page: 1,
  chat_record: 0,
  chat_record_overage: 1,
  chat_smalltalk: 0,
  target_assess: 5,
  task_plan: 3,
  resume_baseline: 10,
  resume_delta: 8,
  resume_block: 2,
  interview_kit: 25,
  health_deep_scan: 5,
};

export type PriceViolation = {
  action: string;
  /** 历史最低价 */
  floor: number;
  /** 当前标价 */
  current: number;
};

/** 当前价目表里比历史最低价还高的项。空数组表示合规。 */
export function checkPrices(
  prices: Record<string, number> = ACTION_PRICES,
  floor: Record<string, number> = PRICE_FLOOR_HISTORY as Record<string, number>,
): PriceViolation[] {
  const out: PriceViolation[] = [];
  for (const [action, current] of Object.entries(prices)) {
    const f = floor[action];
    // 未登记的新动作放行：它的初值就是它的历史最低价。
    if (f === undefined) continue;
    if (current > f) out.push({ action, floor: f, current });
  }
  return out;
}

/** 还没进 floor 的新动作。构建时打一行提示，让人记得补登记。 */
export function findUnrecordedActions(
  prices: Record<string, number> = ACTION_PRICES,
  floor: Record<string, number> = PRICE_FLOOR_HISTORY as Record<string, number>,
): string[] {
  return Object.keys(prices).filter((k) => floor[k] === undefined);
}

/** 违规即抛。构建脚本与单测都调它。 */
export function assertPriceFloor(
  prices: Record<string, number> = ACTION_PRICES,
  floor: Record<string, number> = PRICE_FLOOR_HISTORY as Record<string, number>,
): void {
  const bad = checkPrices(prices, floor);
  if (bad.length === 0) return;
  const lines = bad.map(
    (v) => `  ${v.action}: ${v.floor} → ${v.current}（历史最低 ${v.floor}）`,
  );
  throw new Error(
    "标价只可下调，不可上调。以下动作涨价了：\n" +
      lines.join("\n") +
      "\n\n确需上调请找人类确认，不要自行修改 PRICE_FLOOR_HISTORY。",
  );
}
