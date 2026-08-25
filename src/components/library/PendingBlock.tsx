"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  addPendingMetric,
  promotePendingMetric,
  removePendingMetric,
  type EvidenceChange,
} from "@/app/(app)/library/actions";
import type { PendingMetric } from "@/lib/domain";
import { MetricForm, type MetricValues } from "./MetricForm";

/**
 * 待补数据。这是用户提升证明度最短的一条路：
 * 点胶囊 → 填 → 保存，两次点击就从「想起来还缺这个数」走到证明度重算。
 * 所以表单必须就地展开，不弹窗、不跳页。
 */
export function PendingBlock({
  atomId,
  items,
  onSaved,
}: {
  atomId: string;
  items: PendingMetric[];
  onSaved: (change: EvidenceChange) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 同 MetricsBlock：等新数据回来再收表单
  const [awaiting, setAwaiting] = useState(false);
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    if (awaiting) {
      setAwaiting(false);
      setOpen(null);
    }
  }
  const working = pending || awaiting;

  const current = items.find((p) => p.id === open) ?? null;

  function addItem() {
    setError(null);
    start(async () => {
      const res = await addPendingMetric(atomId, newName);
      if (res.ok) {
        setNewName("");
        setAdding(false);
      } else {
        setError(res.error);
      }
    });
  }

  function removeItem(id: string) {
    setError(null);
    start(async () => {
      const res = await removePendingMetric(atomId, id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <>
      {items.length === 0 && !adding && (
        <p className="mb-2 text-[13px]" style={{ color: "var(--mute)" }}>
          想到还缺哪个数，记在这里，回头补上就能提证明度。
        </p>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((p) => (
            <span
              key={p.id}
              className="group inline-flex items-center rounded-pill"
              style={{
                border: "1px dashed var(--line)",
                background: open === p.id ? "var(--line-soft)" : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(open === p.id ? null : p.id)}
                className="inline-flex items-center gap-1.5 rounded-pill py-[3px] pl-2.5 pr-1.5 text-[12.5px]"
                style={{ color: "var(--slate)" }}
              >
                {p.name}
                {/* hover 才浮出来，平时不占视觉重量 */}
                <span
                  className="rounded-pill px-1.5 py-[1px] text-[11px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  style={{ background: "var(--ink)", color: "#fff" }}
                >
                  填数据
                </span>
              </button>
              <button
                type="button"
                aria-label={`删掉待补项 ${p.name}`}
                onClick={() => removeItem(p.id)}
                disabled={working}
                className="rounded-pill px-1.5 py-[3px] text-[12px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30"
                style={{ color: "var(--mute)" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 就地展开的紧凑表单 */}
      {current && (
        <div className="mt-2">
          <MetricForm
            key={current.id}
            fixedName={current.name}
            compact
            busy={working}
            submitLabel="保存"
            onCancel={() => setOpen(null)}
            onSubmit={async (v) => {
              const res = await promote(current.id, v);
              return res;
            }}
          />
        </div>
      )}

      {adding ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            aria-label="待补数据项"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
              if (e.key === "Escape") {
                setAdding(false);
                setError(null);
              }
            }}
            placeholder="还缺哪个数？"
            className="h-8 w-[200px] rounded-btn px-2 text-[13px] outline-none focus:border-[var(--ink)]"
            style={{ background: "var(--card)", border: "1px solid var(--line)" }}
          />
          <Button size="sm" onClick={addItem} disabled={working}>
            添加
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
          >
            取消
          </Button>
        </div>
      ) : (
        <Button variant="text" size="sm" className="mt-1 px-0" onClick={() => setAdding(true)}>
          ＋ 加一项
        </Button>
      )}

      {error && (
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </>
  );

  function promote(pendingId: string, v: MetricValues) {
    return new Promise<{ ok: true; data: null } | { ok: false; error: string }>((resolve) => {
      start(async () => {
        const res = await promotePendingMetric({
          atom_id: atomId,
          pending_id: pendingId,
          name: v.name,
          kind: v.kind,
          from_value: v.from_value,
          to_value: v.to_value,
          delta: v.delta,
          evidence_level: v.evidence_level,
          method: v.method,
        });
        if (res.ok) {
          setAwaiting(true);
          onSaved(res.data.evidence);
          resolve({ ok: true, data: null });
        } else {
          resolve({ ok: false, error: res.error });
        }
      });
    });
  }
}
