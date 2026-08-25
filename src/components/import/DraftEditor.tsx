"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { CONTEXT_LABEL, EVIDENCE_LABEL, METRIC_KIND_LABEL, STATUS_LABEL } from "@/lib/domain";
import type { ExtractedAtom } from "@/lib/ingest/schema";
import type { AtomContext, AtomStatus } from "@/types/database";

// 「改一下」：卡片就地展开成编辑态，不跳页不弹窗。
// 只放抽取容易出错的字段——标题、归类、状态、周期、职责、行动、指标。
// evidence_level 在这里也是只读的：它由 metrics 派生，手填就破坏了整个证明度体系。

export function DraftEditor({
  atom,
  busy,
  onCancel,
  onSave,
}: {
  atom: ExtractedAtom;
  busy: boolean;
  onCancel: () => void;
  onSave: (next: ExtractedAtom) => void;
}) {
  const [v, setV] = useState<ExtractedAtom>(atom);

  const set = <K extends keyof ExtractedAtom>(k: K, value: ExtractedAtom[K]) =>
    setV((p) => ({ ...p, [k]: value }));

  return (
    <div className="space-y-3">
      <Field label="标题">
        <input
          aria-label="标题"
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="组织">
          <input
            aria-label="组织"
            value={v.org}
            onChange={(e) => set("org", e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="角色">
          <input
            aria-label="角色"
            value={v.role}
            onChange={(e) => set("role", e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="归类">
          <select
            aria-label="归类"
            value={v.context}
            onChange={(e) => set("context", e.target.value as AtomContext)}
            className={inputCls}
            style={inputStyle}
          >
            {(Object.keys(CONTEXT_LABEL) as AtomContext[]).map((k) => (
              <option key={k} value={k}>
                {CONTEXT_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状态">
          <select
            aria-label="状态"
            value={v.status}
            onChange={(e) => set("status", e.target.value as AtomStatus)}
            className={inputCls}
            style={inputStyle}
          >
            {(Object.keys(STATUS_LABEL) as AtomStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="开始">
          <input
            aria-label="开始"
            placeholder="2024-03"
            value={v.period_start ?? ""}
            onChange={(e) => set("period_start", e.target.value || null)}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="结束（空着表示至今）">
          <input
            aria-label="结束"
            placeholder="2025-02"
            value={v.period_end ?? ""}
            onChange={(e) => set("period_end", e.target.value || null)}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="职责">
        <input
          aria-label="职责"
          value={v.task}
          onChange={(e) => set("task", e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      <Field label="行动（一行一条）">
        <textarea
          aria-label="行动"
          rows={Math.min(8, Math.max(3, v.actions.length + 1))}
          value={v.actions.join("\n")}
          onChange={(e) =>
            set(
              "actions",
              e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
            )
          }
          className={`${inputCls} !h-auto py-2 leading-relaxed`}
          style={inputStyle}
        />
      </Field>

      {v.metrics.length > 0 && (
        <Field label="结果">
          <ul className="space-y-1.5">
            {v.metrics.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  aria-label={`指标名 ${i + 1}`}
                  value={m.name}
                  onChange={(e) =>
                    set(
                      "metrics",
                      v.metrics.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className={`${inputCls} flex-1`}
                  style={inputStyle}
                />
                <select
                  aria-label={`指标类型 ${i + 1}`}
                  value={m.kind}
                  onChange={(e) =>
                    set(
                      "metrics",
                      v.metrics.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value as "outcome" | "output" } : x,
                      ),
                    )
                  }
                  className={`${inputCls} w-[92px] shrink-0`}
                  style={inputStyle}
                >
                  <option value="outcome">{METRIC_KIND_LABEL.outcome}</option>
                  <option value="output">{METRIC_KIND_LABEL.output}</option>
                </select>
                <span
                  className="w-[64px] shrink-0 text-[12px]"
                  style={{ color: "var(--mute)" }}
                  title="证据等级由结果数据自己决定，改不了"
                >
                  {EVIDENCE_LABEL[m.evidence_level]}
                </span>
                <button
                  type="button"
                  onClick={() => set("metrics", v.metrics.filter((_, j) => j !== i))}
                  className="shrink-0 cursor-pointer text-[12.5px]"
                  style={{ color: "var(--mute)" }}
                >
                  删掉
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={busy || v.title.trim() === ""} onClick={() => onSave(v)}>
          存下这条
        </Button>
        <Button size="sm" variant="text" disabled={busy} onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

const inputCls = "block h-9 w-full rounded-btn px-2.5 text-[13.5px]";
const inputStyle = { background: "var(--card)", border: "1px solid var(--line)" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12px]" style={{ color: "var(--mute)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}
