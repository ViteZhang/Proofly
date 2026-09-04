"use client";

// =============================================================
// Proofly · 消费记录（交互方案 4.1 区块三）
//
// 两条硬要求：
//
// 1. **失败退回必须显示。** 这是「失败不扣分」这个承诺的可见证据 ——
//    用户能亲眼看到它被执行，比任何声明都有效。不许为了流水好看
//    而隐藏。
// 2. **不展示 token 数与实际成本。** 那是内部核算用的；用户需要知道
//    的是扣了多少分，不是我们花了多少钱。
//
// 永久免费的动作默认折叠：不折叠的话，一次体检快扫就能把真正花过钱
// 的那几行挤到看不见的地方。开关放在标题旁边，想看随时能看。
// =============================================================

import { useState, useTransition } from "react";

import { loadLedger } from "@/app/app/account/ledger-actions";
import type { LedgerRow } from "@/lib/queries/billing";

function when(at: string): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function amountOf(r: LedgerRow): { text: string; color: string } {
  switch (r.kind) {
    case "spend":
      return { text: `−${r.amount}`, color: "var(--ink)" };
    case "refund":
      return { text: `退回 +${r.amount}`, color: "var(--caution, #8A5A00)" };
    case "grant":
      return { text: `+${r.amount}`, color: "var(--proof)" };
    default:
      return { text: "免费", color: "var(--proof)" };
  }
}

export function LedgerTable({ initial }: { initial: LedgerRow[] }) {
  const [rows, setRows] = useState(initial);
  const [includeFree, setIncludeFree] = useState(false);
  const [done, setDone] = useState(initial.length < 30);
  const [busy, start] = useTransition();

  function toggleFree(next: boolean) {
    setIncludeFree(next);
    start(async () => {
      const r = await loadLedger(null, next);
      setRows(r);
      setDone(r.length < 30);
    });
  }

  function more() {
    const last = rows[rows.length - 1];
    if (!last) return;
    start(async () => {
      const r = await loadLedger(last.at, includeFree);
      setRows((prev) => [...prev, ...r]);
      if (r.length < 30) setDone(true);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        还没有记录。用过一次付费动作之后，这里会逐条列出来。
      </p>
    );
  }

  return (
    <>
      <label className="mb-2.5 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--slate)" }}>
        <input
          type="checkbox"
          checked={includeFree}
          onChange={(e) => toggleFree(e.target.checked)}
          disabled={busy}
        />
        显示免费动作
      </label>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr style={{ color: "var(--mute)" }}>
            <th className="pb-2 text-left text-[11.5px] font-medium">时间</th>
            <th className="pb-2 text-left text-[11.5px] font-medium">动作</th>
            <th className="pb-2 text-right text-[11.5px] font-medium">变动</th>
            <th className="pb-2 pl-4 text-left text-[11.5px] font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const a = amountOf(r);
            return (
              <tr key={r.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td className="py-2.5 whitespace-nowrap" style={{ color: "var(--slate)" }}>
                  {when(r.at)}
                </td>
                <td className="py-2.5">{r.label}</td>
                <td
                  className="py-2.5 text-right font-display font-semibold whitespace-nowrap"
                  style={{ color: a.color }}
                >
                  {a.text}
                </td>
                <td className="py-2.5 pl-4 text-[11.5px]" style={{ color: "var(--mute)" }}>
                  {r.note ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!done && (
        <button
          type="button"
          onClick={more}
          disabled={busy}
          className="mt-3 rounded-btn px-3 py-1.5 text-[12.5px]"
          style={{ border: "1px solid var(--line)" }}
        >
          {busy ? "读取中…" : "加载更多"}
        </button>
      )}
    </>
  );
}
