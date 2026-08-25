"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { EVIDENCE_LABEL, METRIC_KIND_LABEL, STATUS_LABEL, CONTEXT_LABEL } from "@/lib/domain";
import type { ProjectOption, ReviewDraft } from "@/lib/queries/drafts";
import type { ExtractedAtom } from "@/lib/ingest/schema";
import { DraftEditor } from "./DraftEditor";

// 意图的三种颜色：紫=新增 / 橙=更新 / 红=需你判断
const BAR: Record<string, string> = {
  CREATE: "var(--ai)",
  UPDATE: "var(--warn)",
  ASK: "var(--danger)",
};
const INTENT_LABEL: Record<string, string> = {
  CREATE: "新增",
  UPDATE: "更新",
  ASK: "需你判断",
};

export type CardAction = {
  accept: (atom: ExtractedAtom | null, parentId: string | null, asCreate: boolean) => Promise<void>;
  reject: () => Promise<void>;
};

export function ConfirmCard({
  draft,
  projects,
  action,
  leaving,
}: {
  draft: ReviewDraft;
  projects: ProjectOption[];
  action: CardAction;
  leaving: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asCreate, setAsCreate] = useState(false);
  const [parentId, setParentId] = useState<string | null>(draft.parentAtomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intent = asCreate ? "CREATE" : draft.intent;
  const pct = draft.confidence === null ? null : Math.round(draft.confidence * 100);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "出错了，再试一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="overflow-hidden rounded-card transition-all duration-[180ms]"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${BAR[intent]}`,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(0.98)" : "scale(1)",
      }}
    >
      <div className="p-4">
        {/* 意图标签 + 置信度 */}
        <div className="flex items-center gap-2">
          <span
            className="rounded-pill px-2 py-0.5 text-[11.5px] font-medium"
            style={{ background: `color-mix(in srgb, ${BAR[intent]} 12%, transparent)`, color: BAR[intent] }}
          >
            {INTENT_LABEL[intent]}
          </span>
          {pct !== null && (
            <span className="font-mono text-[11.5px]" style={{ color: "var(--mute)" }}>
              置信度 {pct}%
            </span>
          )}
          {draft.targetTitle && intent === "UPDATE" && (
            <span className="truncate text-[12px]" style={{ color: "var(--slate)" }}>
              改的是「{draft.targetTitle}」
            </span>
          )}
        </div>

        <h3 className="mt-2 text-[16px] font-semibold">{draft.atom.title || "（没有标题）"}</h3>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--mute)" }}>
          {[
            draft.atom.org,
            draft.atom.role,
            period(draft.atom),
            STATUS_LABEL[draft.atom.status],
            CONTEXT_LABEL[draft.atom.context],
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* AI 的判断 */}
        <div
          className="mt-3 rounded-card px-3 py-2.5"
          style={{ background: "var(--ai-soft)" }}
        >
          <p className="text-[11.5px] font-medium" style={{ color: "var(--ai)" }}>
            AI 的判断
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
            {draft.aiNote || "（没有给出判断依据）"}
          </p>
          {draft.recallDegraded && (
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--warn)" }}>
              向量召回没跑起来，这次是按字面比对判的，多看一眼。
            </p>
          )}
        </div>

        {/* 原文依据 */}
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="mt-2.5 cursor-pointer text-[12.5px] underline-offset-2 hover:underline"
          style={{ color: "var(--slate)" }}
        >
          {showSource ? "收起原文依据" : "原文依据"}
        </button>
        {showSource && (
          <blockquote
            className="mt-2 rounded-card px-3 py-2.5 text-[12.5px] leading-relaxed"
            style={{ background: "var(--line-soft)", color: "var(--slate)" }}
          >
            {draft.atom.source_excerpt || "（这条没给出原文片段，值得怀疑）"}
            {draft.locateFuzzy && (
              <span className="mt-1.5 block text-[12px]" style={{ color: "var(--warn)" }}>
                切分标记没对上原文，片段是粗切的。
              </span>
            )}
          </blockquote>
        )}

        {/* 主体：三种意图三种样子 */}
        {editing ? (
          <div className="mt-3">
            <DraftEditor
              atom={draft.atom}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(next) =>
                run(async () => {
                  await action.accept(next, parentId, asCreate);
                })
              }
            />
          </div>
        ) : (
          <>
            {intent === "UPDATE" && <DiffTable draft={draft} />}
            {intent === "ASK" && <Options draft={draft} />}
            {intent === "CREATE" && <Preview atom={draft.atom} />}

            {asCreate && (
              <div className="mt-3">
                <label className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                  这条挂在哪个项目下？
                </label>
                <select
                  value={parentId ?? ""}
                  onChange={(e) => setParentId(e.target.value || null)}
                  className="mt-1 block h-9 w-full rounded-btn px-2 text-[13.5px]"
                  style={{ background: "var(--card)", border: "1px solid var(--line)" }}
                >
                  <option value="">不挂父级，作为独立项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.org ? `${p.org} · ${p.title}` : p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => run(() => action.accept(null, parentId, asCreate))}
              >
                {intent === "UPDATE" ? "就这么更新" : "收下这条"}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                改一下
              </Button>
              {draft.intent === "UPDATE" && !asCreate && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setAsCreate(true)}>
                  这是新经历
                </Button>
              )}
              <Button size="sm" variant="text" disabled={busy} onClick={() => run(action.reject)}>
                不要这条
              </Button>
            </div>
          </>
        )}

        {error && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function period(a: ExtractedAtom): string {
  if (!a.period_start && !a.period_end) return "";
  const s = a.period_start?.replace("-", ".") ?? "?";
  return `${s} – ${a.period_end ? a.period_end.replace("-", ".") : "至今"}`;
}

function Preview({ atom }: { atom: ExtractedAtom }) {
  return (
    <div className="mt-3 space-y-2 text-[13px]">
      {atom.situation && (
        <Row label="背景">
          <span style={{ color: "var(--slate)" }}>{atom.situation}</span>
        </Row>
      )}
      {atom.task && (
        <Row label="职责">
          <span style={{ color: "var(--slate)" }}>{atom.task}</span>
        </Row>
      )}
      {atom.actions.length > 0 && (
        <Row label={`行动 ${atom.actions.length}`}>
          <ul className="space-y-0.5" style={{ color: "var(--slate)" }}>
            {atom.actions.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </Row>
      )}
      {atom.metrics.length > 0 && (
        <Row label="结果">
          <ul className="space-y-0.5">
            {atom.metrics.map((m, i) => (
              <li key={i} style={{ color: "var(--slate)" }}>
                {m.name}
                {m.delta || m.to_value ? ` ${m.delta || `→ ${m.to_value}`}` : ""}
                <span className="ml-1.5 text-[11.5px]" style={{ color: "var(--mute)" }}>
                  {METRIC_KIND_LABEL[m.kind]} · {EVIDENCE_LABEL[m.evidence_level]}
                </span>
              </li>
            ))}
          </ul>
        </Row>
      )}
      {atom.pending_metrics.length > 0 && (
        <Row label="待补数据">
          <span style={{ color: "var(--slate)" }}>{atom.pending_metrics.join("、")}</span>
        </Row>
      )}
      {atom.skills.length > 0 && (
        <Row label="技能">
          <span style={{ color: "var(--slate)" }}>{atom.skills.join("、")}</span>
        </Row>
      )}
      {atom.children.length > 0 && (
        <Row label={`能力点 ${atom.children.length}`}>
          <span style={{ color: "var(--slate)" }}>
            {atom.children.map((c) => c.title).join("、")}
          </span>
          {atom.children.length > 8 && (
            <span className="mt-1 block text-[12px]" style={{ color: "var(--warn)" }}>
              一个项目下拆出 {atom.children.length} 个能力点，超过 8 个了，多半切得太细。
              收之前扫一眼，两三句话就能讲完的合并进行动里。
            </span>
          )}
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-[64px] shrink-0 text-[12px]" style={{ color: "var(--mute)" }}>
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const DIFF_LABEL: Record<string, string> = {
  field_change: "改动",
  metric_add: "新增指标",
  pending_resolved: "待补数据被填上",
  status_change: "状态推进",
};

function DiffTable({ draft }: { draft: ReviewDraft }) {
  if (draft.diff.length === 0) {
    return (
      <p className="mt-3 text-[13px]" style={{ color: "var(--mute)" }}>
        AI 没列出具体改了什么。这种情况别急着点更新，先展开原文依据看一眼。
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <tbody>
          {draft.diff.map((d, i) => (
            <tr key={i} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
              <td className="py-1.5 pr-3 align-top" style={{ color: "var(--mute)" }}>
                {DIFF_LABEL[d.type] ?? d.type}
                {d.field && ` · ${d.field}`}
              </td>
              <td className="py-1.5 align-top">
                {d.before && (
                  <span style={{ color: "var(--mute)", textDecoration: "line-through" }}>
                    {d.before}
                  </span>
                )}
                {d.before && d.after && <span className="mx-1.5">→</span>}
                {d.after && <span>{d.after}</span>}
                {d.note && (
                  <span className="ml-1.5" style={{ color: "var(--mute)" }}>
                    {d.note}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Options({ draft }: { draft: ReviewDraft }) {
  if (draft.options.length === 0) {
    return (
      <p className="mt-3 text-[13px]" style={{ color: "var(--mute)" }}>
        AI 没给出可选方案。按新增收下，或者改一下再存。
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {draft.options.map((o, i) => (
        <li
          key={i}
          className="rounded-card px-3 py-2.5 text-[13px]"
          style={{ background: "var(--line-soft)" }}
        >
          <p className="font-medium">{o.label}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
            {o.consequence}
          </p>
        </li>
      ))}
    </ul>
  );
}
