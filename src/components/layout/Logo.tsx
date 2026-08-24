// Proofly 品牌标记：P + 证明绿对勾。P 用 currentColor（随所在文字色，
// 深色侧栏为白、浅色页面为 ink），对勾用 --proof → --proof-mid 渐变。

export function LogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="proofly-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--proof)" />
          <stop offset="1" stopColor="var(--proof-mid)" />
        </linearGradient>
      </defs>
      <path
        d="M22 50 L22 15 L34 15 A10 10 0 0 1 34 35 L22 35"
        fill="none"
        stroke="currentColor"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 26 L29 33 L43 17"
        fill="none"
        stroke="url(#proofly-grad)"
        strokeWidth={6.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 标记 + 文字组合。
export function Logo({
  markSize = 22,
  textClassName = "text-[18px]",
}: {
  markSize?: number;
  textClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={markSize} />
      <span className={`font-display font-semibold tracking-tight ${textClassName}`}>
        Proofly
      </span>
    </span>
  );
}
