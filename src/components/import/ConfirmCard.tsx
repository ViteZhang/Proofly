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
  accept: (
    atom: ExtractedAtom | null,
    parentId: string | null,
    asCreate: boolean,
    targetId: string | null,
  ) => Promise<void>;
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

  // 「需你判断」的卡片上，AI 列的那几个方案是要人点的。
  // 之前它们只是三条死的说明文字，而卡片又不给 ASK 渲染「这是新经历」，
  // 于是这种卡片唯一的出路是「不要这条」—— 抽出来的东西只能扔。
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked === null ? null : (draft.options[picked] ?? null);

  // 点了方案就按方案来：说新建就新建，说更新/合并就更新那一条。
  const asCreateNow = asCreate || chosen?.action === "CREATE";
  // CREATE 型方案里的那个 id 是「挂在谁下面」，UPDATE/MERGE 型的是「改哪一条」。
  const targetId =
    chosen && chosen.action !== "CREATE" ? chosen.target_atom_id : null;
  const parentNow =
    chosen?.action === "CREATE" && chosen.target_atom_id ? chosen.target_atom_id : parentId;

  const intent = asCreateNow ? "CREATE" : draft.intent;
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
          {draft.servedBy && (
            <p
              className="mt-1.5 text-[12px]"
              style={{ color: draft.servedBy.isHead ? "var(--mute)" : "var(--warn)" }}
            >
              {draft.servedBy.isHead ? (
                <>由 {draft.servedBy.extract} 抽取</>
              ) : draft.servedBy.extract === draft.servedBy.verdict ? (
                <>主用没通，这条由备用的 {draft.servedBy.extract} 抽取和判定，多看一眼。</>
              ) : (
                <>
                  主用没通过一次：{draft.servedBy.extract} 抽取 · {draft.servedBy.verdict} 判定，
                  多看一眼。
                </>
              )}
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
                  await action.accept(next, parentNow, asCreateNow, targetId);
                })
              }
            />
          </div>
        ) : (
          <>
            {intent === "UPDATE" && <DiffTable draft={draft} />}
            {draft.intent === "ASK" && (
              <Options draft={draft} picked={picked} onPick={setPicked} />
            )}
            {intent === "CREATE" && draft.intent !== "ASK" && <Preview atom={draft.atom} />}

            {asCreateNow && draft.intent !== "ASK" && (
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
                disabled={busy || (draft.intent === "ASK" && chosen === null && !asCreate)}
                onClick={() => run(() => action.accept(null, parentNow, asCreateNow, targetId))}
              >
                {intent === "UPDATE" ? "就这么更新" : "收下这条"}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                改一下
              </Button>
              {/* ASK 也要给这条退路：模型说不准该更新哪条才判的 ASK，
                  而「其实是条全新的经历」是最常见的答案。以前只给 UPDATE 渲染，
                  于是报错让人点这个按钮、按钮却不存在。 */}
              {draft.intent !== "CREATE" && !asCreate && chosen === null && (
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

function Options({
  draft,
  picked,
  onPick,
}: {
  draft: ReviewDraft;
  picked: number | null;
  onPick: (i: number | null) => void;
}) {
  if (draft.options.length === 0) {
    return (
      <p className="mt-3 text-[13px]" style={{ color: "var(--mute)" }}>
        AI 没给出可选方案。按「这是新经历」收下，或者改一下再存。
      </p>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-[12.5px]" style={{ color: "var(--slate)" }}>
        选一个再收下
      </p>
      <ul className="mt-1.5 space-y-2">
        {draft.options.map((o, i) => {
          const on = picked === i;
          return (
            <li key={i}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? null : i)}
                className="block w-full cursor-pointer rounded-card px-3 py-2.5 text-left text-[13px] transition-colors"
                style={{
                  background: on ? "var(--ai-soft, var(--line-soft))" : "var(--line-soft)",
                  border: `1.5px solid ${on ? "var(--ink)" : "transparent"}`,
                }}
              >
                <p className="font-medium">{o.label}</p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
                  {o.consequence}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
