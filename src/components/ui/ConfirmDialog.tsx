"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * 危险操作的二次确认壳。
 *
 * 抽出来是因为已经有两份几乎一样的实现（删方向、删档案条目），第三份
 * 要加在删 JD 上。三份手抄的结果是它们已经开始不一样了 —— 一份按 Esc
 * 关得掉，另一份关不掉；同一个动作在不同页面上行为不同，那是 bug，
 * 不是风格。
 *
 * 壳只管三件事：怎么关、按钮怎么排、什么时候不许按。要删的是什么、
 * 会带走什么，由调用方作为 children 传进来 —— 那部分每处都不一样，
 * 硬塞进壳里只会变成一堆开关。
 */
export function ConfirmDialog({
  title,
  ariaLabel,
  children,
  error,
  /** 牵连范围还没查回来时为 false：这一步存在的意义就是让人看完再决定。 */
  ready = true,
  busy = false,
  cancelLabel = "取消",
  confirmLabel = "确认删除",
  busyLabel = "删除中…",
  onClose,
  onConfirm,
}: {
  title: React.ReactNode;
  ariaLabel: string;
  children: React.ReactNode;
  error?: string | null;
  ready?: boolean;
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  busyLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // 正在删的时候不许 Esc 关掉：请求已经发出去了，关掉窗口只是让人
  // 看不见结果，删还是照删。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={() => {
        if (!busy) onClose();
      }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-card"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <div className="px-6 py-5">
          <h2 className="text-[15.5px] font-semibold leading-snug">{title}</h2>
          <div className="mt-2.5 space-y-1.5 text-[13.5px]" style={{ color: "var(--slate)" }}>
            {children}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-3.5"
          style={{ borderTop: "1px solid var(--line-soft)" }}
        >
          {error && (
            <span className="mr-auto text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={!ready || busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 牵连数字在正文里要突出来 —— 那句话的重量全在数字上。 */
export function Emphasis({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-semibold" style={{ color: "var(--ink)" }}>
      {children}
    </strong>
  );
}
