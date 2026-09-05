"use client";

// =============================================================
// Proofly · 弹窗外壳
//
// 二次确认、余额不足、重生成收费提示都套它。
// Esc 关闭、点遮罩关闭 —— 计费相关的弹窗尤其不能困住人。
// =============================================================

import { useEffect } from "react";

export function Modal({
  title,
  onClose,
  children,
  footer,
  /** 码墙那种一次要摊开几十行的内容用它 */
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(12,14,20,.18)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${wide ? "max-w-[660px]" : "max-w-[400px]"} max-h-[88vh] overflow-y-auto rounded-card p-[22px] shadow-lg`}
        style={{ background: "var(--card)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h4 className="mb-2 text-[16px] font-semibold">{title}</h4>
        {children}
        {footer && <div className="mt-[18px] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
