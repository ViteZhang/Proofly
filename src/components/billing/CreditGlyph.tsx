// =============================================================
// Proofly · 积分符号
//
// 一个空心六边形。**不用金币、钱袋、宝石这类消费暗示** —— 这是个
// 专业工具，不是游戏（交互方案 6.1）。
// =============================================================

export function CreditGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 22 24"
      width={size}
      height={Math.round((size * 24) / 22)}
      aria-hidden
      style={{ flex: "none", position: "relative", top: 1 }}
    >
      <path
        d="M11 1L20.5 6.5v11L11 23 1.5 17.5v-11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
    </svg>
  );
}
