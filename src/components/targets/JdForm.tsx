"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createJd } from "@/app/app/targets/jd-actions";

// 「＋ 添加 JD」展开的表单。四个字段：公司、岗位、正文、来源链接（选填）。
export function JdForm({
  targetId,
  onClose,
  onCreated,
}: {
  targetId: string;
  onClose: () => void;
  onCreated: (jdId: string) => void;
}) {
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await createJd(targetId, { company, roleTitle, rawText, sourceUrl });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated(res.data.id);
    });
  }

  return (
    <div
      className="mt-3 rounded-card px-5 py-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="公司">
          <input
            autoFocus
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="某某科技"
            className={INPUT}
            style={INPUT_STYLE}
          />
        </Field>
        <Field label="岗位名称">
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="AI 产品经理"
            className={INPUT}
            style={INPUT_STYLE}
          />
        </Field>
      </div>

      <Field label="JD 全文" hint="原样贴进来，不用整理">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={10}
          placeholder="岗位职责&#10;1. ...&#10;&#10;任职资格&#10;1. ..."
          className={`${INPUT} resize-y leading-relaxed`}
          style={INPUT_STYLE}
        />
      </Field>

      <Field label="来源链接" hint="选填">
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://"
          className={INPUT}
          style={INPUT_STYLE}
        />
      </Field>

      <div className="mt-4 flex items-center justify-end gap-2">
        {error && (
          <span className="mr-auto text-[12.5px]" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={onClose} disabled={working}>
          取消
        </Button>
        <Button size="sm" onClick={submit} disabled={working}>
          {working ? "保存中…" : "保存并解析"}
        </Button>
      </div>
    </div>
  );
}

const INPUT =
  "mt-1.5 w-full rounded-btn px-2.5 py-1.5 text-[13.5px] " +
  "focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink";

const INPUT_STYLE = {
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
    <label className="mt-3 block first:mt-0">
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
