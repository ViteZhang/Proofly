"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CONTEXT_LABEL, STATUS_LABEL, EVIDENCE_LABEL } from "@/lib/domain";
import { updateAtom, type UpdateAtomInput } from "@/app/(app)/library/actions";
import type { AtomDetail as Detail } from "@/lib/queries/atoms";
import type { AtomContext, AtomLevel, AtomStatus } from "@/types/database";
import { DeleteAtomDialog } from "./DeleteAtomDialog";
import { ProofDot } from "./ProofDot";

const CONTEXTS: AtomContext[] = ["employment", "side_project", "volunteer", "community"];
const STATUSES: AtomStatus[] = ["concept", "design_done", "in_dev", "shipped", "sunset"];

// 周期在界面上只到月，date 列存到日。载入时截成 YYYY-MM，
// 保存时只提交真正变过的那一头，免得把 2021-06-30 悄悄改成 2021-06-01。
const toMonth = (d: string | null) => (d ? d.slice(0, 7) : "");

type Draft = {
  title: string;
  org: string;
  role: string;
  level: AtomLevel;
  parent_id: string;
  context: AtomContext;
  status: AtomStatus;
  start: string;
  end: string;
  ongoing: boolean;
  situation: string;
  task: string;
  actions: string[];
  sort_order: number;
};

export function AtomEditForm({
  atom,
  projects,
  settling,
  onSaved,
  onCancel,
  onDeleted,
}: {
  atom: Detail;
  projects: { id: string; title: string }[];
  settling: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [d, setD] = useState<Draft>({
    title: atom.title,
    org: atom.org ?? "",
    role: atom.role ?? "",
    level: atom.level,
    parent_id: atom.parent_id ?? "",
    context: atom.context,
    status: atom.status,
    start: toMonth(atom.period_start),
    end: toMonth(atom.period_end),
    ongoing: atom.period_end === null,
    situation: atom.situation ?? "",
    task: atom.task ?? "",
    actions: atom.actions,
    sort_order: atom.sort_order,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [posting, startSave] = useTransition();
  // 请求发出到新数据回来之间都算「保存中」，中途不给退回只读态
  const saving = posting || settling;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  function save() {
    setError(null);
    const patch: UpdateAtomInput = {
      title: d.title,
      org: d.org,
      role: d.role,
      level: d.level,
      parent_id: d.level === "capability_slice" ? d.parent_id || null : null,
      context: d.context,
      status: d.status,
      situation: d.situation,
      task: d.task,
      actions: d.actions,
      sort_order: d.sort_order,
    };

    if (d.start !== toMonth(atom.period_start)) patch.period_start = d.start || null;
    const nextEnd = d.ongoing ? null : d.end || null;
    if ((nextEnd ?? "") !== toMonth(atom.period_end)) patch.period_end = nextEnd;

    startSave(async () => {
      const res = await updateAtom(atom.id, patch);
      if (res.ok) onSaved();
      else setError(res.error);
    });
  }

  // Esc 退出编辑，改动一律丢弃。挂在 window 上而不是表单上——
  // 挂表单的话，用户点过页面别处以后按 Esc 就没反应了。
  useEffect(() => {
    if (confirming || saving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, saving, onCancel]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="rounded-card"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="px-6 pb-5 pt-6">
        <Field label="标题">
          <input
            autoFocus
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <div className="font-display mt-1.5 text-[11.5px]" style={{ color: "var(--mute)" }}>
          {atom.id}
        </div>
      </div>

      <Section>
        <Grid>
          <Field label="组织">
            <input
              value={d.org}
              onChange={(e) => set("org", e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="角色">
            <input
              value={d.role}
              onChange={(e) => set("role", e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="归类">
            <select
              value={d.context}
              onChange={(e) => set("context", e.target.value as AtomContext)}
              className={inputCls}
              style={inputStyle}
            >
              {CONTEXTS.map((c) => (
                <option key={c} value={c}>
                  {CONTEXT_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select
              value={d.status}
              onChange={(e) => set("status", e.target.value as AtomStatus)}
              className={inputCls}
              style={inputStyle}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="开始">
            <input
              type="month"
              value={d.start}
              onChange={(e) => set("start", e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <div>
            <Label>结束</Label>
            <div className="flex items-center gap-2.5">
              <input
                type="month"
                aria-label="结束"
                value={d.ongoing ? "" : d.end}
                disabled={d.ongoing}
                onChange={(e) => set("end", e.target.value)}
                className={`${inputCls} flex-1 disabled:opacity-45`}
                style={inputStyle}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={d.ongoing}
                  onChange={(e) => set("ongoing", e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--ink)]"
                />
                至今
              </label>
            </div>
          </div>

          <Field label="层级">
            <select
              value={d.level}
              onChange={(e) => set("level", e.target.value as AtomLevel)}
              className={inputCls}
              style={inputStyle}
            >
              <option value="project">经历</option>
              <option value="capability_slice">能力点</option>
            </select>
          </Field>
          <Field label="挂在哪条经历下">
            <select
              value={d.parent_id}
              disabled={d.level !== "capability_slice"}
              onChange={(e) => set("parent_id", e.target.value)}
              className={`${inputCls} disabled:opacity-45`}
              style={inputStyle}
            >
              <option value="">
                {projects.length === 0 ? "还没有别的经历可挂" : "选一条经历"}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="排序">
            <input
              type="number"
              value={d.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>

          {/* 证明度是推导出来的，编辑态里也只读——这是整套约束的地基 */}
          <div>
            <Label>证明度</Label>
            <div
              className="flex h-9 items-center gap-1.5 rounded-btn px-2.5 text-[13px]"
              style={{ background: "var(--line-soft)", color: "var(--slate)" }}
            >
              <ProofDot level={atom.evidence_level} size={9} />
              {EVIDENCE_LABEL[atom.evidence_level]}
              <span className="ml-auto text-[11.5px]" style={{ color: "var(--mute)" }}>
                跟着结果指标自动算
              </span>
            </div>
          </div>
        </Grid>
      </Section>

      <Section>
        <Field label="背景">
          <textarea
            rows={3}
            value={d.situation}
            onChange={(e) => set("situation", e.target.value)}
            className={`${inputCls} h-auto py-2 leading-[1.7]`}
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section>
        <Field label="我要做什么">
          <textarea
            rows={2}
            value={d.task}
            onChange={(e) => set("task", e.target.value)}
            className={`${inputCls} h-auto py-2 leading-[1.7]`}
            style={inputStyle}
          />
        </Field>

        <div className="mt-3">
          <Label>具体做了哪些事</Label>
          {d.actions.map((action, i) => (
            <div key={i} className="mt-1.5 flex items-center gap-1.5">
              <input
                aria-label={`第 ${i + 1} 条`}
                value={action}
                onChange={(e) =>
                  set(
                    "actions",
                    d.actions.map((a, j) => (j === i ? e.target.value : a)),
                  )
                }
                className={`${inputCls} flex-1`}
                style={inputStyle}
              />
              <IconBtn
                label="上移"
                disabled={i === 0}
                onClick={() => set("actions", move(d.actions, i, i - 1))}
              >
                ↑
              </IconBtn>
              <IconBtn
                label="下移"
                disabled={i === d.actions.length - 1}
                onClick={() => set("actions", move(d.actions, i, i + 1))}
              >
                ↓
              </IconBtn>
              <IconBtn
                label="删掉这条"
                onClick={() => set("actions", d.actions.filter((_, j) => j !== i))}
              >
                ×
              </IconBtn>
            </div>
          ))}
          <Button
            variant="text"
            size="sm"
            className="mt-1.5 px-0"
            onClick={() => set("actions", [...d.actions, ""])}
          >
            ＋ 加一条
          </Button>
        </div>
      </Section>

      {/* 底部操作条 */}
      <div
        className="flex items-center gap-2 border-t px-6 py-4"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
          删除
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
            取消
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      {confirming && (
        <DeleteAtomDialog
          atomId={atom.id}
          onClose={() => setConfirming(false)}
          onDeleted={onDeleted}
        />
      )}
    </form>
  );
}

// ---- 小件 ----

const inputCls =
  "h-9 w-full rounded-btn px-2.5 text-[13.5px] outline-none " +
  "focus:border-[var(--ink)] transition-colors";

const inputStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
};

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t px-6 py-5" style={{ borderColor: "var(--line-soft)" }}>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pb-1 text-[11.5px] font-medium"
      style={{ letterSpacing: "0.04em", color: "var(--mute)" }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-8 shrink-0 items-center justify-center rounded-btn text-[13px] transition-colors hover:bg-[var(--line-soft)] disabled:opacity-30"
      style={{ border: "1px solid var(--line)", color: "var(--slate)" }}
    >
      {children}
    </button>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
