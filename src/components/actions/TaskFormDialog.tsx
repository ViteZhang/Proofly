"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createTask, updateTask, type TaskInput } from "@/app/(app)/actions/task-actions";
import { ACTION_COPY } from "@/lib/planning/labels";
import { LEARN_MIN_HOURS } from "@/lib/planning/config";
import type { TaskActionType } from "@/types/database";

export type GapOption = {
  id: string;
  targetName: string;
  text: string;
  gapType: string;
};

export type AnchorOption = { id: string; title: string };

export type TaskDraft = {
  id: string | null; // null = 新建
  title: string;
  rationale: string;
  actionType: TaskActionType;
  estimatedHours: number;
  deliverable: string;
  anchorAtomId: string | null;
  gapIds: string[];
};

export const EMPTY_TASK: TaskDraft = {
  id: null,
  title: "",
  rationale: "",
  actionType: "collect_data",
  estimatedHours: 4,
  deliverable: "",
  anchorAtomId: null,
  gapIds: [],
};

const TYPES: TaskActionType[] = [
  "collect_data",
  "build_evidence",
  "rewrite_narrative",
  "learn",
];

export function TaskFormDialog({
  draft,
  gaps,
  anchors,
  onClose,
  onSaved,
}: {
  draft: TaskDraft;
  gaps: GapOption[];
  anchors: AnchorOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [rationale, setRationale] = useState(draft.rationale);
  const [actionType, setActionType] = useState<TaskActionType>(draft.actionType);
  const [hours, setHours] = useState(String(draft.estimatedHours));
  const [deliverable, setDeliverable] = useState(draft.deliverable);
  const [anchor, setAnchor] = useState(draft.anchorAtomId ?? "");
  const [gapIds, setGapIds] = useState<string[]>(draft.gapIds);
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
    const input: TaskInput = {
      title,
      rationale,
      actionType,
      estimatedHours: Number(hours) || 0,
      deliverable,
      anchorAtomId: anchor || null,
      gapIds,
    };
    start(async () => {
      const res = draft.id ? await updateTask(draft.id, input) : await createTask(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? "编辑行动" : "新增行动"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[520px] overflow-y-auto rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <h2 className="text-[15.5px] font-semibold">{draft.id ? "编辑行动" : "新增行动"}</h2>

        <Field label="标题">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给知识宇宙的检索模块做一版召回率评测"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field label="说明" hint="选填">
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            placeholder="为什么值得做、具体怎么做、有什么要注意的。"
            className={`${inputClass} resize-y leading-relaxed`}
            style={inputStyle}
          />
        </Field>

        <div className="mt-3 flex gap-3">
          <div className="flex-1">
            <Label>类型</Label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as TaskActionType)}
              className={inputClass}
              style={inputStyle}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTION_COPY[t].label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[130px]">
            <Label>预计工时</Label>
            <input
              type="number"
              min={0}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
            {actionType === "learn" && (
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--mute)" }}>
                学技能不低于 {LEARN_MIN_HOURS}h
              </p>
            )}
          </div>
        </div>

        <Field label="挂靠项目" hint="选填">
          <select
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">不挂靠</option>
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="预计产出物" hint="选填">
          <input
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="一份含 20 条测试用例、三维评分与回归脚本的评测报告"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <div className="mt-3">
          <Label>
            关联缺口{" "}
            <span style={{ color: "var(--mute)" }}>
              选填 · 不选则预期提升为 0，排在最后但仍可置顶
            </span>
          </Label>
          <div
            className="mt-1.5 max-h-[180px] overflow-y-auto rounded-btn px-2.5 py-2"
            style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
          >
            {gaps.length === 0 && (
              <p className="text-[12.5px]" style={{ color: "var(--mute)" }}>
                现在没有待处理的缺口。
              </p>
            )}
            {gaps.map((g) => (
              <label key={g.id} className="flex cursor-pointer items-start gap-2 py-1 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={gapIds.includes(g.id)}
                  onChange={(e) =>
                    setGapIds((prev) =>
                      e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id),
                    )
                  }
                  className="mt-[3px]"
                />
                <span className="min-w-0 flex-1">
                  <span style={{ color: "var(--mute)" }}>{g.targetName} · </span>
                  {g.text}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--mute)" }}>
            预期提升按公式算，不用手填 —— 手填的数字排起序来没有意义。
          </p>
        </div>

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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-medium" style={{ color: "var(--slate)" }}>
      {children}
    </div>
  );
}

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
    <div className="mt-3">
      <Label>
        {label}
        {hint && <span style={{ color: "var(--mute)" }}> {hint}</span>}
      </Label>
      {children}
    </div>
  );
}
