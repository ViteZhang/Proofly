"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EVIDENCE_ORDER, METRIC_KIND_LABEL } from "@/lib/domain";
import type { ActionResult } from "@/lib/domain";
import type { AtomMetric } from "@/lib/queries/atoms";
import type { EvidenceLevel, MetricKind } from "@/types/database";

// 指标自己的证据等级。方案里这一栏写的是「无」，不是原子层面的「无证据」。
const EVIDENCE_FIELD_LABEL: Record<EvidenceLevel, string> = {
  measured: "实测",
  estimated: "估算",
  designed_only: "仅设计",
  absent: "无",
};

export type MetricValues = {
  name: string;
  kind: MetricKind;
  from_value: string;
  to_value: string;
  delta: string;
  evidence_level: EvidenceLevel;
  method: string;
};

export function MetricForm({
  initial,
  fixedName,
  busy,
  compact = false,
  submitLabel = "保存",
  onSubmit,
  onCancel,
}: {
  initial?: AtomMetric;
  fixedName?: string;
  busy: boolean;
  compact?: boolean;
  submitLabel?: string;
  onSubmit: (v: MetricValues) => Promise<ActionResult<unknown>>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<MetricValues>({
    name: fixedName ?? initial?.name ?? "",
    kind: initial?.kind ?? "outcome",
    from_value: initial?.from_value ?? "",
    to_value: initial?.to_value ?? "",
    delta: initial?.delta ?? "",
    evidence_level: initial?.evidence_level ?? "measured",
    method: initial?.method ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof MetricValues>(k: K, val: MetricValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  async function submit() {
    setError(null);
    const res = await onSubmit(v);
    if (!res.ok) setError(res.error);
  }

  return (
    <div
      className="rounded-btn p-3"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {fixedName ? (
        <div className="pb-2 text-[13.5px] font-medium">{fixedName}</div>
      ) : (
        <Row label="指标名">
          <input
            autoFocus
            aria-label="指标名"
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="比如「运营人效」"
            className={input}
            style={inputStyle}
          />
        </Row>
      )}

      {/* 数值：可以只填变化量 */}
      {compact ? (
        <Row label="数值">
          <input
            autoFocus
            aria-label="数值"
            value={v.delta}
            onChange={(e) => set("delta", e.target.value)}
            placeholder="35%"
            className={input}
            style={inputStyle}
          />
        </Row>
      ) : (
        <Row label="数值">
          <div className="flex items-center gap-1.5">
            <input
              aria-label="变化前"
              value={v.from_value}
              onChange={(e) => set("from_value", e.target.value)}
              placeholder="变化前"
              className={input}
              style={inputStyle}
            />
            <span className="shrink-0 text-[13px]" style={{ color: "var(--mute)" }}>
              →
            </span>
            <input
              aria-label="变化后"
              value={v.to_value}
              onChange={(e) => set("to_value", e.target.value)}
              placeholder="变化后"
              className={input}
              style={inputStyle}
            />
            <input
              aria-label="变化量"
              value={v.delta}
              onChange={(e) => set("delta", e.target.value)}
              placeholder="变化量"
              className={input}
              style={inputStyle}
            />
          </div>
        </Row>
      )}

      {/* kind：只有结果指标参与证明度推导，说明必须摆在选择器旁边 */}
      <Row label="类型">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["outcome", "output"] as MetricKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={v.kind === k}
              onClick={() => set("kind", k)}
              className="rounded-pill px-2.5 py-[3px] text-[12.5px] transition-colors"
              style={
                v.kind === k
                  ? { background: "var(--ink)", color: "#fff" }
                  : { border: "1px solid var(--line)", color: "var(--slate)" }
              }
            >
              {METRIC_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] leading-[1.6]" style={{ color: "var(--mute)" }}>
          结果指标 = 产生了什么效果（留存 +5%、人效 +75%）
          <br />
          交付物 = 做出了什么东西（4 份设计文档、20 条测试用例）
          <br />
          <strong className="font-semibold" style={{ color: "var(--slate)" }}>
            只有结果指标会提升证明度。
          </strong>
        </p>
      </Row>

      <Row label="证据">
        <div className="flex flex-wrap gap-1.5">
          {EVIDENCE_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={v.evidence_level === level}
              onClick={() => set("evidence_level", level)}
              className="rounded-pill px-2.5 py-[3px] text-[12.5px] transition-colors"
              style={
                v.evidence_level === level
                  ? { background: "var(--ink)", color: "#fff" }
                  : { border: "1px solid var(--line)", color: "var(--slate)" }
              }
            >
              {EVIDENCE_FIELD_LABEL[level]}
            </button>
          ))}
        </div>
      </Row>

      <Row label="口径">
        <textarea
          aria-label="口径"
          rows={compact ? 2 : 2}
          value={v.method}
          onChange={(e) => set("method", e.target.value)}
          className={`${input} h-auto py-1.5 leading-[1.6]`}
          style={inputStyle}
        />
        <p className="mt-1 text-[12px]" style={{ color: "var(--mute)" }}>
          填一下口径。面试官问「这 5% 怎么算的」时，这里就是你的答案。
        </p>
      </Row>

      <div className="mt-2.5 flex items-center gap-2">
        {error && (
          <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "保存中…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

const input =
  "h-8 w-full min-w-0 rounded-btn px-2 text-[13px] outline-none transition-colors focus:border-[var(--ink)]";

const inputStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pb-2.5">
      <div
        className="pb-1 text-[11.5px] font-medium"
        style={{ letterSpacing: "0.04em", color: "var(--mute)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
