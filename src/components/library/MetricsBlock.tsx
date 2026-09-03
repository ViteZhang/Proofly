"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  createMetric,
  deleteMetric,
  updateMetric,
  type EvidenceChange,
} from "@/app/app/library/actions";
import { EVIDENCE_LABEL, METRIC_KIND_LABEL } from "@/lib/domain";
import type { AtomMetric } from "@/lib/queries/atoms";
import { MetricForm, type MetricValues } from "./MetricForm";
import { ProofDot } from "./ProofDot";

export function MetricsBlock({
  atomId,
  metrics,
  notice,
  noticeKey,
  onSaved,
}: {
  atomId: string;
  metrics: AtomMetric[];
  notice: EvidenceChange | null;
  noticeKey: number;
  onSaved: (change: EvidenceChange) => void;
}) {
  // 面试题的「去补」带着 ?metric=<id> 过来，直接把那条指标展开成编辑态 ——
  // 缺的是口径，落到经历库门口还得自己找，等于没跳。
  const searchParams = useSearchParams();
  const wanted = searchParams.get("metric");
  const [open, setOpen] = useState<string | null>(
    wanted && metrics.some((m) => m.id === wanted) ? wanted : null,
  ); // 指标 id，或 "new"
  const jumpRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    jumpRef.current?.scrollIntoView({ block: "center" });
    // 只在挂载时跳一次：之后用户自己滚到哪就是哪。
  }, []);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 存成功之后不立刻收表单：要等服务端把新列表发回来，
  // 否则会闪一下旧数据。metrics 换了新数组就说明到了。
  const [awaiting, setAwaiting] = useState(false);
  const [seen, setSeen] = useState(metrics);
  if (seen !== metrics) {
    setSeen(metrics);
    if (awaiting) {
      setAwaiting(false);
      setOpen(null);
      setConfirming(null);
    }
  }
  const working = pending || awaiting;

  function run(
    action: () => Promise<{ ok: true; data: { evidence: EvidenceChange } } | { ok: false; error: string }>,
  ) {
    return new Promise<{ ok: boolean; error: string }>((resolve) => {
      start(async () => {
        const res = await action();
        if (res.ok) {
          setAwaiting(true);
          onSaved(res.data.evidence);
          resolve({ ok: true, error: "" });
        } else {
          resolve({ ok: false, error: res.error });
        }
      });
    });
  }

  const toPayload = (v: MetricValues) => ({
    name: v.name,
    kind: v.kind,
    from_value: v.from_value,
    to_value: v.to_value,
    delta: v.delta,
    evidence_level: v.evidence_level,
    method: v.method,
  });

  return (
    <>
      {/* 证明度跳档了就说一句是哪一档变成哪一档，3 秒后自己淡走 */}
      {notice?.changed && (
        <div
          key={noticeKey}
          role="status"
          className="proof-notice mb-2.5 rounded-btn px-3 py-1.5 text-[12.5px]"
          style={{ background: "var(--proof-soft)", color: "var(--ink)" }}
        >
          证明度已更新：{EVIDENCE_LABEL[notice.before]} → {EVIDENCE_LABEL[notice.after]}
        </div>
      )}

      {metrics.length === 0 && open !== "new" && (
        <p className="text-[13px]" style={{ color: "var(--mute)" }}>
          还没有结果指标。补一条，证明度会跟着变。
        </p>
      )}

      <ul className="-mx-1">
        {metrics.map((m) => (
          <li key={m.id} ref={m.id === wanted ? jumpRef : undefined}>
            {open === m.id ? (
              <div className="px-1 py-1.5">
                <MetricForm
                  initial={m}
                  busy={working}
                  onCancel={() => setOpen(null)}
                  onSubmit={async (v) => {
                    const r = await run(() => updateMetric(m.id, toPayload(v)));
                    return r.ok ? { ok: true, data: null } : { ok: false, error: r.error };
                  }}
                />
              </div>
            ) : (
              <div className="flex items-baseline gap-2.5 rounded-btn px-1 py-1.5">
                <ProofDot level={m.evidence_level} className="translate-y-[1px]" />
                <span className="text-[13.5px] font-medium">{m.name}</span>
                <span className="font-display text-[13.5px]">{display(m)}</span>
                <span
                  className="rounded-pill px-1.5 py-[1px] text-[11px]"
                  style={{
                    background: m.kind === "outcome" ? "var(--proof-soft)" : "var(--line-soft)",
                    color: m.kind === "outcome" ? "var(--ink)" : "var(--slate)",
                  }}
                >
                  {METRIC_KIND_LABEL[m.kind]}
                </span>
                {m.method && (
                  <span
                    className="min-w-0 flex-1 truncate text-[12px]"
                    style={{ color: "var(--mute)" }}
                  >
                    {m.method}
                  </span>
                )}
                <span className={`ml-auto flex shrink-0 items-center gap-1.5 ${m.method ? "" : "pl-2"}`}>
                  {confirming === m.id ? (
                    <>
                      <span className="text-[12px]" style={{ color: "var(--slate)" }}>
                        删掉？
                      </span>
                      <Mini onClick={() => run(() => deleteMetric(m.id))} tone="danger" disabled={working}>
                        确认
                      </Mini>
                      <Mini onClick={() => setConfirming(null)}>取消</Mini>
                    </>
                  ) : (
                    <>
                      <Mini onClick={() => setOpen(m.id)}>编辑</Mini>
                      <Mini onClick={() => setConfirming(m.id)}>删除</Mini>
                    </>
                  )}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {open === "new" ? (
        <div className="mt-2">
          <MetricForm
            busy={working}
            submitLabel="添加"
            onCancel={() => setOpen(null)}
            onSubmit={async (v) => {
              const r = await run(() => createMetric({ atom_id: atomId, ...toPayload(v) }));
              return r.ok ? { ok: true, data: null } : { ok: false, error: r.error };
            }}
          />
        </div>
      ) : (
        <Button variant="text" size="sm" className="mt-1 px-0" onClick={() => setOpen("new")}>
          ＋ 加一条指标
        </Button>
      )}
    </>
  );
}

function Mini({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-btn px-1 text-[12px] transition-colors hover:text-[var(--ink)] disabled:opacity-40"
      style={{ color: tone === "danger" ? "var(--danger)" : "var(--mute)" }}
    >
      {children}
    </button>
  );
}

function display(m: AtomMetric): string {
  if (m.from_value && m.to_value) {
    const base = `${m.from_value} → ${m.to_value}`;
    return m.delta ? `${base}（${m.delta}）` : base;
  }
  return m.delta ?? m.to_value ?? m.from_value ?? "";
}
