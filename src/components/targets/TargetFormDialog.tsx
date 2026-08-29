"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  createTarget,
  updateTarget,
  type TargetInput,
} from "@/app/(app)/targets/actions";

export type TargetDraft = {
  id: string | null; // null = 新建
  name: string;
  direction: string;
  narrative: string;
};

export function TargetFormDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: TargetDraft;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [direction, setDirection] = useState(draft.direction);
  const [narrative, setNarrative] = useState(draft.narrative);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    setError(null);
    const input: TargetInput = { name, direction, narrative };
    start(async () => {
      const res = draft.id
        ? await updateTarget(draft.id, input)
        : await createTarget(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved(draft.id ?? (res.data as { id: string }).id);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? "编辑求职方向" : "新建求职方向"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <h2 className="text-[15.5px] font-semibold">
          {draft.id ? "编辑求职方向" : "新建求职方向"}
        </h2>

        <Field label="方向名称">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="C 端 AI 应用"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field label="方向类型" hint="选填">
          <input
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="产品经理 / 增长 / 平台"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field label="主线故事" hint="选填，简历和面试都会围着它讲">
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={4}
            placeholder="从教育产品转到 AI 应用，擅长把模型能力做成用户真的会用的功能。"
            className={`${inputClass} resize-y leading-relaxed`}
            style={inputStyle}
          />
        </Field>

        <div className="mt-5 flex items-center justify-end gap-2">
          {error && (
            <span className="mr-auto text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={working}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={working}>
            {working ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-btn px-2.5 py-1.5 text-[13.5px] " +
  "focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink";

const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
} as const;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[12.5px] font-medium" style={{ color: "var(--slate)" }}>
        {label}
        {hint && (
          <span className="ml-1.5 font-normal" style={{ color: "var(--mute)" }}>
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
