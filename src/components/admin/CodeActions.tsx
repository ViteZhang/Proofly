"use client";

// =============================================================
// Proofly · 单码的停用与恢复（方案 8.2 二）
//
// 停用可逆、作废不可逆，两者在视觉上必须能一眼分开：停用是行内的
// 文字按钮，作废在页头且是红色实心按钮，还要打字确认。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { toggleCode } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/billing/Modal";

export function CodeActions({
  codeId,
  disabled,
}: {
  codeId: string;
  /** true = 当前是停用态，按钮是「恢复」 */
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(r: string | null) {
    setError(null);
    start(async () => {
      const res = await toggleCode(codeId, r);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAsking(false);
      setReason("");
      router.refresh();
    });
  }

  if (disabled) {
    return (
      <Button size="sm" variant="text" disabled={busy} onClick={() => run(null)}>
        {busy ? "…" : "恢复"}
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="text" disabled={busy} onClick={() => setAsking(true)}>
        停用
      </Button>
      {asking && (
        <Modal
          title="停用这张码"
          onClose={() => setAsking(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAsking(false)}>
                取消
              </Button>
              <Button disabled={busy || reason.trim() === ""} onClick={() => run(reason)}>
                {busy ? "停用中…" : "停用"}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
            停用后无法兑换，兑换页只会返回「这张码用不了」——不会说明它是不存在、被停用还是被作废。
            三种情况归并成一句，枚举者就分不出「猜错了」和「猜对了但被停了」。
          </p>
          <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: "var(--slate)" }}>
            停用理由 <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            autoFocus
            className="w-full rounded-btn border border-[var(--line)] bg-[var(--card)] px-3.5 py-2.5 outline-none focus:border-[var(--ink)]"
            placeholder="例如：发错人了"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--mute)" }}>
            必填。停用可逆，但理由是这次操作留下的唯一痕迹。
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
