"use client";

import { useState } from "react";
import type { PassedCheck } from "@/lib/health/report";

/**
 * 通过项默认折叠成一行。留着它不是为了占地方，是为了给「确实检查过了」
 * 的确定感 —— 一份什么都没报的报告，和一份根本没跑的报告，看起来一样。
 */
export function PassedList({ passed }: { passed: PassedCheck[] }) {
  const [open, setOpen] = useState(false);
  if (passed.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[13px] underline"
        style={{ color: "var(--mute)" }}
      >
        {passed.length} 项检查通过{open ? " ▴" : " ▾"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-[12.5px]" style={{ color: "var(--slate)" }}>
          {passed.map((p) => (
            <li key={p.code}>
              <span style={{ color: "var(--proof)" }}>✓</span> {p.label}
              <span className="ml-1.5" style={{ color: "var(--mute)" }}>
                {p.code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
