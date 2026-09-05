// =============================================================
// Proofly · 后台的通用件
//
// 沿用产品的色板与字体，但布局更密：后台是桌面场景，一屏能看多少行
// 比呼吸感重要。
// =============================================================

import Link from "next/link";

const TZ = "Asia/Shanghai";

/**
 * 时间的相对表达。
 *
 * 「今天 10:22」比「2026-09-04 10:22」好读，但只对最近三天成立 ——
 * 再往前「三天前」就不如日期精确了。
 */
export function when(iso: string): { main: string; sub?: string } {
  const d = new Date(iso);
  const day = (x: Date) =>
    new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, dateStyle: "short" }).format(x);
  const hm = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  const today = day(new Date());
  const yest = day(new Date(Date.now() - 86_400_000));
  if (day(d) === today) return { main: `今天 ${hm}`, sub: ago(d) };
  if (day(d) === yest) return { main: `昨天 ${hm}` };
  return {
    main: new Intl.DateTimeFormat("zh-CN", {
      timeZone: TZ,
      month: "2-digit",
      day: "2-digit",
    }).format(d) + ` ${hm}`,
  };
}

function ago(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  return `${Math.round(min / 60)} 小时前`;
}

/** 只要日期的场合：有效期、到期日 */
export function date(iso: string | null, fallback = "不限"): string {
  if (!iso) return fallback;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, dateStyle: "medium" }).format(
    new Date(iso),
  );
}

/** 距今还有几天。负数表示已经过了 */
export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function PageHead({
  title,
  desc,
  back,
  children,
}: {
  title: string;
  desc?: string;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {back && (
          <Link
            href={back.href}
            className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px]"
            style={{ color: "var(--slate)" }}
          >
            ← {back.label}
          </Link>
        )}
        <h1 className="font-display text-[25px] font-semibold tracking-tight">{title}</h1>
        {desc && (
          <p className="mt-1 max-w-[640px] text-[13.5px]" style={{ color: "var(--slate)" }}>
            {desc}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function Card({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card p-5 ${className}`}
      style={{ background: "var(--card)", boxShadow: "var(--shadow-1)" }}
    >
      {(title || right) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold">
            {title}
            {sub && (
              <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--mute)" }}>
                {sub}
              </span>
            )}
          </h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  value,
  unit,
  label,
  note,
  amber,
}: {
  value: React.ReactNode;
  unit?: string;
  label: string;
  note?: React.ReactNode;
  amber?: boolean;
}) {
  return (
    <div
      className="rounded-card px-[18px] py-4"
      style={
        amber
          ? { background: "var(--warn-soft)", border: "1px solid #f0dcb4" }
          : { background: "var(--card)", boxShadow: "var(--shadow-1)" }
      }
    >
      <div
        className="font-display text-[27px] leading-tight font-semibold tracking-tight"
        style={amber ? { color: "var(--caution)" } : undefined}
      >
        {value}
        {unit && (
          <span className="ml-1 text-[14px] font-medium" style={{ color: "var(--mute)" }}>
            {unit}
          </span>
        )}
      </div>
      <div
        className="mt-[3px] text-[12px]"
        style={{ color: amber ? "var(--caution)" : "var(--slate)" }}
      >
        {label}
      </div>
      {note && (
        <div
          className="mt-[7px] pt-[7px] text-[11px] leading-snug"
          style={{
            borderTop: `1px solid ${amber ? "#f0dcb4" : "var(--line-soft)"}`,
            color: amber ? "var(--caution)" : "var(--mute)",
            opacity: amber ? 0.82 : 1,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

const TAG_STYLE: Record<string, { background: string; color: string }> = {
  ok: { background: "var(--proof-soft)", color: "#0A8A63" },
  used: { background: "var(--line-soft)", color: "var(--slate)" },
  exp: { background: "#f3f4f7", color: "var(--mute)" },
  off: { background: "var(--warn-soft)", color: "var(--caution)" },
  rev: { background: "var(--danger-soft)", color: "var(--danger)" },
  ai: { background: "var(--ai-soft)", color: "#4A3BD6" },
};

export function Tag({
  tone = "used",
  children,
}: {
  tone?: keyof typeof TAG_STYLE;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-[3px] text-[11.5px] font-medium whitespace-nowrap"
      style={TAG_STYLE[tone]}
    >
      {children}
    </span>
  );
}

/** 表格横向溢出时自己滚，不让整页横向滚 */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 -mb-5 overflow-x-auto px-5 pb-1">{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-[13px]" style={{ color: "var(--mute)" }}>
      {children}
    </p>
  );
}

const PURPOSE_CHIPS: { value: string | null; label: string }[] = [
  { value: null, label: "全部" },
  { value: "internal_beta", label: "内测" },
  { value: "compensation", label: "补偿" },
  { value: "invite", label: "邀请" },
  { value: "self", label: "自用" },
  { value: "purchase", label: "付款" },
];

/**
 * 筛选条。
 *
 * 用 GET 表单 + 链接做，不用客户端状态：筛完的结果在地址栏里，能收藏、
 * 能发给自己、刷新不丢。后台一共这么几个筛选项，为它引一套客户端状态
 * 不划算。
 */
export function Filters({
  base,
  purpose,
  q,
  placeholder,
}: {
  base: string;
  purpose: string | null;
  q: string | null;
  placeholder: string;
}) {
  const href = (p: string | null) => {
    const s = new URLSearchParams();
    if (p) s.set("purpose", p);
    if (q) s.set("q", q);
    const qs = s.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
      {PURPOSE_CHIPS.map((c) => {
        const on = (c.value ?? null) === (purpose ?? null);
        return (
          <Link
            key={c.label}
            href={href(c.value)}
            className="rounded-pill px-3 py-[5px] text-[12.5px] transition-colors"
            style={
              on
                ? { background: "var(--ink)", color: "#fff", fontWeight: 500 }
                : {
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    color: "var(--slate)",
                  }
            }
          >
            {c.label}
          </Link>
        );
      })}
      <form action={base} className="ml-auto">
        {purpose && <input type="hidden" name="purpose" value={purpose} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={placeholder}
          className="min-w-[210px] rounded-btn px-3 py-[5px] text-[12.5px] outline-none"
          style={{ border: "1px solid var(--line)", background: "var(--card)" }}
        />
      </form>
    </div>
  );
}

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`pb-2.5 text-[11px] font-medium tracking-[.06em] whitespace-nowrap ${
        right ? "pr-0 text-right" : "pr-3 text-left"
      }`}
      style={{ color: "var(--mute)", borderBottom: "1px solid var(--line)" }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  top,
}: {
  children: React.ReactNode;
  right?: boolean;
  top?: boolean;
}) {
  return (
    <td
      className={`py-2.5 text-[13px] ${right ? "pr-0 text-right" : "pr-3"} ${
        top ? "align-top" : "align-middle"
      }`}
      style={{ borderBottom: "1px solid var(--line-soft)" }}
    >
      {children}
    </td>
  );
}

/** 码面用等宽感的 display 字体，字距略开 —— 它是要被手抄和念出来的 */
export function Code({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <span
      className="font-display text-[13px] tracking-wide"
      style={dim ? { color: "var(--mute)" } : { fontWeight: 500 }}
    >
      {children}
    </span>
  );
}
