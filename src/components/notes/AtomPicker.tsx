"use client";

// 「更新某个项目」的经历选择器。选中后把项目名带进输入框，
// 让 Stage B 有个明确的 subject_hint——省掉一轮「你说的是哪个项目」。

import { useState } from "react";

import { STATUS_LABEL } from "@/lib/domain";
import type { AtomStatus } from "@/types/database";

export type PickerAtom = { id: string; title: string; org: string; status: string };

export function AtomPicker({
  atoms,
  onPick,
  onClose,
}: {
  atoms: PickerAtom[];
  onPick: (a: PickerAtom) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const hit = atoms.filter((a) =>
    `${a.title}${a.org}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div
      className="mt-3 rounded-card border p-2.5"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜经历名或组织…"
          className="min-w-0 flex-1 rounded-btn border px-2.5 py-1.5 text-[13px] outline-none"
          style={{ borderColor: "var(--line)", color: "var(--ink)" }}
        />
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] underline"
          style={{ color: "var(--mute)" }}
        >
          关掉
        </button>
      </div>

      <div className="mt-2 max-h-[220px] overflow-y-auto">
        {hit.length === 0 ? (
          <p className="px-1 py-2 text-[13px]" style={{ color: "var(--mute)" }}>
            没有匹配的经历。
          </p>
        ) : (
          hit.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a)}
              className="block w-full rounded-btn px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--line-soft)]"
              style={{ color: "var(--ink)" }}
            >
              {a.title}
              <span className="ml-2 text-[12px]" style={{ color: "var(--mute)" }}>
                {a.org === "" ? "" : `${a.org} · `}
                {STATUS_LABEL[a.status as AtomStatus] ?? a.status}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
