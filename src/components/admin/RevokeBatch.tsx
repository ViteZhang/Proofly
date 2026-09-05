"use client";

// =============================================================
// Proofly · 整批作废（方案 8.2 二）
//
// 不可逆操作要求打字确认。这不是多此一举 —— 它是唯一能拦住「点错了」
// 的机制。数据库里也验一遍：只在弹窗里做的硬要求是一句自我要求。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { revokeBatch } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/billing/Modal";

export function RevokeBatch({
  batchId,
  batchName,
  liveCodes,
  redeemedCount,
}: {
  batchId: string;
  batchName: string;
  /** 还没作废、还能被兑的码有几张 */
  liveCodes: number;
  redeemedCount: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const r = await revokeBatch(batchId, reason, typed);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 flex-none items-center rounded-btn px-4 text-[13.5px] font-medium text-white"
        style={{ background: "var(--danger)" }}
      >
        整批作废
      </button>

      {open && (
        <Modal
          title="整批作废"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                取消
              </Button>
              <button
                disabled={busy || reason.trim() === "" || typed.trim() !== batchName}
                onClick={run}
                className="inline-flex h-9 items-center rounded-btn px-4 text-[14px] font-medium text-white disabled:pointer-events-none disabled:opacity-50"
                style={{ background: "var(--danger)" }}
              >
                {busy ? "作废中…" : "作废整批"}
              </button>
            </>
          }
        >
          <div
            className="mb-4 rounded-btn px-4 py-3.5 text-[12.5px] leading-relaxed"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            <b>作废不可恢复。</b>该批次 {liveCodes} 张还能被兑的码将立刻失效
            {redeemedCount > 0 && <>，已核销的 {redeemedCount} 笔积分不受影响、不会被追回</>}。
          </div>

          <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: "var(--slate)" }}>
            作废理由 <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            autoFocus
            className={INPUT}
            placeholder="为什么要作废这一批"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <label
            className="mt-3.5 mb-1.5 block text-[11.5px] font-medium"
            style={{ color: "var(--slate)" }}
          >
            输入批次名以确认 <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            className={INPUT}
            placeholder={batchName}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--mute)" }}>
            不可逆操作要求打字确认，不是多此一举——它是唯一能拦住「点错了」的机制。
          </p>

          {error && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

const INPUT =
  "w-full rounded-btn border border-[var(--line)] bg-[var(--card)] px-3.5 py-2.5 outline-none focus:border-[var(--ink)]";
