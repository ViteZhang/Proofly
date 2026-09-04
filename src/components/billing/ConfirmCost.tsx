"use client";

// =============================================================
// Proofly · 付费动作的二次确认（交互方案 3.1）
//
// **只对 10 分及以上的动作做。** 5 分以下反复确认会很烦，直接执行
// 加完成提示即可 —— 确认框本身也是一种成本。
// =============================================================

import { CONFIRM_THRESHOLD } from "@/config/plan";
import { Button } from "@/components/ui/Button";

import { Modal } from "./Modal";

export function needsConfirm(credits: number): boolean {
  return credits >= CONFIRM_THRESHOLD;
}

export function ConfirmCost({
  title,
  credits,
  balance,
  note,
  onCancel,
  onConfirm,
  pending,
}: {
  title: string;
  credits: number;
  balance: number;
  /** 「大概需要 5–10 分钟，可以先去做别的」这类补充。 */
  note?: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "正在开始…" : "开始"}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
        会消耗 <b className="font-display">{credits}</b> 分，余额{" "}
        <b className="font-display">{balance}</b> →{" "}
        <b className="font-display">{Math.max(balance - credits, 0)}</b>。
      </p>
      {note && (
        <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
          {note}
        </p>
      )}
    </Modal>
  );
}
