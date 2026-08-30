// =============================================================
// Proofly · 求职方向的纯逻辑
// 不 import Next、不连库 —— 方向的选中规则要能被探针单独喂数据验证。
// =============================================================

export type TargetCard = {
  id: string;
  name: string;
  direction: string | null;
  narrative: string | null;
  jdCount: number;
  gapCount: number;
  // 该方向下最高分，没评估过是 null（显示「还没评估」，不显示 0——
  // 0 分和没测过是两回事）。
  matchScore: number | null;
};

/**
 * 把 URL 上的 ?target= 收敛成一个真实存在的方向。
 * 传了不存在的 id（换账号、方向被删、手敲的地址）就退回第一个，
 * 不让页面空着，也不报错。
 */
export function resolveTarget<T extends { id: string }>(
  targets: T[],
  raw: string | string[] | undefined | null,
): T | null {
  if (targets.length === 0) return null;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  return targets.find((t) => t.id === wanted) ?? targets[0];
}
