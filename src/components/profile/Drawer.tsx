"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 右侧抽屉。
 *
 * 教育 / 履历 / 证书三处编辑共用一个 —— 它们的字段数都在十个上下，
 * 行内编辑放不下，弹窗又会把下面的列表整个盖住，而用户改一条时经常要
 * 参照上一条的写法。
 */
export function Drawer({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // 打开时把焦点送进面板，键盘用户不用从页首一路 Tab 过来
    panel.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(12,14,20,0.34)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(470px,100%)] flex-col"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--line-soft)" }}
        >
          <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-btn px-2 py-1 text-[15px] transition-colors hover:bg-[var(--line-soft)]"
            style={{ color: "var(--slate)" }}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <div
          className="flex items-center gap-2 px-5 py-3.5"
          style={{ borderTop: "1px solid var(--line-soft)" }}
        >
          {footer}
        </div>
      </div>
    </>
  );
}

// ---- 表单零件 ----

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: "var(--slate)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[11.5px]" style={{ color: "var(--mute)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-btn px-3 py-2.5 text-[13.5px] outline-none transition-colors " +
  "focus:border-[var(--ink)] focus:ring-2 focus:ring-[rgba(12,14,20,0.06)]";

export const inputStyle = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
} as const;

/** 二选一。学历的「可查 / 不可查」、履历的全职实习都是这种形态。 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-btn p-1" style={{ background: "var(--bg)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className="flex-1 rounded-[8px] py-2 text-center text-[13px] transition-colors"
            style={
              on
                ? { background: "var(--card)", color: "var(--ink)", fontWeight: 500, boxShadow: "var(--shadow-1)" }
                : { color: "var(--slate)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
