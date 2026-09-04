"use client";

// =============================================================
// Proofly · 「这个改动你已经做了三次了」
//
// 同一个改动在多份版本里反复出现，说明基线漏了东西，而不是这些 JD
// 特殊。提示只出现一次 —— 做完选择就记进 baseline_evolution_log，
// 一条被拒绝过的建议每次生成都弹一遍，比不提示更烦。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { resolveSignal } from "@/app/app/resume/evolution-actions";
import type { Signal } from "@/lib/resume/evolution";

export function EvolutionBanner({
  baselineId,
  signals,
}: {
  baselineId: string;
  signals: Signal[];
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Signal | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const shown = signals.filter((s) => !hidden.has(s.signature));
  if (shown.length === 0 && !note) return null;

  function resolve(s: Signal, accept: boolean) {
    setError(null);
    setConfirm(null);
    start(async () => {
      const r = await resolveSignal(baselineId, s.signature, accept);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setHidden((prev) => new Set([...prev, s.signature]));
      if (r.data.applied) {
        setNote(
          `已并进基线。基线退回未锁定，通读一遍再锁。${
            r.data.recalculated > 0 ? `已重算 ${r.data.recalculated} 份草稿的差异。` : ""
          }已投递的版本不受影响。`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2" style={{ maxWidth: 720 }}>
      {shown.map((s) => (
        <div
          key={s.signature}
          className="flex items-start gap-3 rounded-card px-4 py-3"
          style={{ background: "var(--proof-soft)", border: "1px solid var(--proof-mid)" }}
        >
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed">{s.copy}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => setConfirm(s)}>
              {s.acceptLabel}
            </Button>
            <button
              type="button"
              disabled={busy}
              onClick={() => resolve(s, false)}
              className="text-[12.5px] hover:underline disabled:opacity-50"
              style={{ color: "var(--mute)" }}
            >
              {s.rejectLabel}
            </button>
            <button
              type="button"
              aria-label="关闭这条提示"
              onClick={() => setHidden((prev) => new Set([...prev, s.signature]))}
              className="text-[13px]"
              style={{ color: "var(--mute)" }}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {note && (
        <p className="text-[12.5px]" style={{ color: "var(--proof)" }}>
          {note}
        </p>
      )}
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(12,14,20,0.4)" }}
          onClick={() => setConfirm(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={confirm.acceptLabel}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[460px] rounded-card px-6 py-5"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
          >
            <h2 className="text-[15.5px] font-semibold">{confirm.acceptLabel}？</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              基线一改，锁定就失效了 —— 改完要重新通读并锁定。已投递的版本不受影响，
              未投递的草稿会自动重算差异，处数通常会少一处。
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Button size="sm" disabled={busy} onClick={() => resolve(confirm, true)}>
                {busy ? "处理中…" : confirm.acceptLabel}
              </Button>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="text-[12.5px] hover:underline"
                style={{ color: "var(--mute)" }}
              >
                再想想
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
