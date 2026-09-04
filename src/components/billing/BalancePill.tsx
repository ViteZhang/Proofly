"use client";

// =============================================================
// Proofly · 顶栏余额（交互方案 2.1）
//
// 三条克制：
// - 余额充足时它只是一个安静的数字，不做任何强调
// - 低于 30 分变橙，并在展开面板顶部提示一次 —— 用「够做什么」表达，
//   不用数字吓人
// - **随手记页面不挂它**。维护动作在用户眼里价值感极低，只要余额数字
//   在视野里，他就会犹豫要不要记这一条，哪怕那本来就免费
// =============================================================

import { useEffect, useRef, useState } from "react";

import { CreditGlyph } from "./CreditGlyph";

export type BalanceProps = {
  available: number;
  low: boolean;
  zero: boolean;
  purchased: number;
  granted: number;
  grantExpiresAt: string | null;
  freeChatLeft: number;
  freeChatLimit: number;
};

export function BalancePill(p: BalanceProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const tone = p.zero
    ? { color: "var(--danger)", background: "var(--danger-soft)" }
    : p.low
      ? { color: "var(--caution, #8A5A00)", background: "var(--caution-soft, #FFF4E5)" }
      : {};

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[13px] font-medium"
        style={tone}
        aria-label={`余额 ${p.available} 分`}
      >
        <CreditGlyph />
        <span className="font-display font-semibold">{p.available}</span> 分
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-[280px] rounded-card p-4 shadow-lg"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          {p.low && !p.zero && (
            <p className="mb-2.5 text-[12.5px]" style={{ color: "var(--caution, #8A5A00)" }}>
              快用完了，够生成 1 版简历。
            </p>
          )}
          {p.zero && (
            <p className="mb-2.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
              分用完了。体检、简历评分、行动排序这些不受影响。
            </p>
          )}

          <div className="mb-3 flex items-center gap-2 font-display text-[30px] font-semibold tracking-tight">
            <CreditGlyph size={15} />
            {p.available}
          </div>

          <Row label="购买的" value={p.purchased} note="永不过期" />
          <Row
            label="赠送的"
            value={p.granted}
            note={
              p.grantExpiresAt
                ? `${new Date(p.grantExpiresAt).toLocaleDateString("zh-CN")} 到期`
                : "永不过期"
            }
          />

          <div
            className="mt-2 flex justify-between pt-2.5 text-[12.5px]"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <span>本月免费对话</span>
            <span style={{ color: "var(--mute)" }}>
              还剩 {p.freeChatLeft} / {p.freeChatLimit} 次
            </span>
          </div>

          {/* 先扣快过期的，这一点要说出来，否则用户会觉得乱扣 */}
          {p.granted > 0 && p.grantExpiresAt && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
              用的时候会先扣快过期的。
            </p>
          )}

          {/*
            交互方案 2.1 这里还有「消费记录」「充值」两个入口。
            那两个页面是 C3 的交付物，现在放链接只会 404 —— 等页面有了
            再挂上，别用一个坏链接换一个看起来完整的面板。
          */}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div
      className="flex justify-between py-1.5 text-[12.5px]"
      style={{ borderBottom: "1px solid var(--line-soft)" }}
    >
      <span>{label}</span>
      <span>
        <b className="font-display">{value}</b> ·{" "}
        <span style={{ color: "var(--mute)", fontSize: "11.5px" }}>{note}</span>
      </span>
    </div>
  );
}
