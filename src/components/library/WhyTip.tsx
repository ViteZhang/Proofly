"use client";

import { useState } from "react";
import type { EvidenceExplain } from "@/lib/evidence";

// 派生字段旁边的「?」。hover 出，也能点开、能用键盘 Tab 到——
// 只做 hover 的话触屏和键盘用户就永远看不到解释。
export function WhyTip({ explain }: { explain: EvidenceExplain }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={explain.title}
        aria-expanded={open}
        className="flex h-[15px] w-[15px] items-center justify-center rounded-pill text-[10px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ border: "1px solid var(--line)", color: "var(--mute)" }}
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+7px)] z-30 w-[292px] -translate-x-1/2 rounded-btn px-3.5 py-3 text-left"
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-3)",
          }}
        >
          <span className="block text-[12.5px] font-semibold" style={{ color: "var(--ink)" }}>
            {explain.title}
          </span>
          {explain.lines.map((line) => (
            <span
              key={line}
              className="mt-1.5 block text-[12.5px] leading-[1.6]"
              style={{ color: "var(--slate)" }}
            >
              {line}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
