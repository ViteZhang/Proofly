"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  addRequirement,
  deleteRequirement,
  updateRequirement,
} from "@/app/app/targets/jd-actions";
import { KIND_HINT, KIND_LABEL, KIND_ORDER } from "@/lib/jd/labels";
import type { RequirementRow } from "@/lib/queries/jds";
import type { RequirementKind } from "@/types/database";

// 解析结果必须能改。模型会漏、会把职责描述当成加分项、会把「熟练 SQL」
// 判成结构性 —— 没有这个口子，一处误判会一路错到分数上，而且看不出来。
export function RequirementList({
  jdId,
  requirements,
  onChanged,
}: {
  jdId: string;
  requirements: RequirementRow[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const counts = KIND_ORDER.map((k) => ({
    kind: k,
    n: requirements.filter((r) => r.kind === k).length,
  }));
  const hard = counts.find((c) => c.kind === "hard")?.n ?? 0;
  const implicit = counts.find((c) => c.kind === "implicit")?.n ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px]">
        <span style={{ color: "var(--slate)" }}>
          共 {requirements.length} 条：
          {counts.map((c, i) => (
            <span key={c.kind}>
              {i > 0 && " · "}
              {KIND_LABEL[c.kind]} {c.n}
            </span>
          ))}
        </span>
        {/* 方案约束：implicit 不得超过 hard 的一半。超了就在这儿说一声，
            不拦着——是留给你自己删的信号，不是错误。 */}
        {implicit * 2 > hard && (
          <span style={{ color: "var(--warn)" }}>
            隐含要求比硬性要求的一半还多，挖过头了，删掉几条牵强的
          </span>
        )}
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {requirements.map((r) => (
          <RequirementItem key={r.id} row={r} onChanged={onChanged} />
        ))}
      </ul>

      {adding ? (
        <NewRequirement
          jdId={jdId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-[13px] hover:underline"
          style={{ color: "var(--slate)" }}
        >
          ＋ 手动加一条
        </button>
      )}
    </div>
  );
}

function RequirementItem({
  row,
  onChanged,
}: {
  row: RequirementRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.text);
  const [kind, setKind] = useState<RequirementKind>(row.kind);
  const [isStructural, setStructural] = useState(row.isStructural);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateRequirement(row.id, { text, kind, isStructural });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteRequirement(row.id);
      if (!res.ok) setError(res.error);
      else onChanged();
    });
  }

  if (editing) {
    return (
      <li
        className="rounded-btn px-3 py-2.5"
        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-btn px-2 py-1 text-[13.5px] focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as RequirementKind)}
            className="h-[30px] rounded-btn px-2 text-[13px]"
            style={{ background: "var(--card)", border: "1px solid var(--line)" }}
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]} —— {KIND_HINT[k]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={isStructural}
              onChange={(e) => setStructural(e.target.checked)}
            />
            结构性（三个月内补不上）
          </label>
          <div className="ml-auto flex items-center gap-1.5">
            {error && (
              <span className="text-[12px]" style={{ color: "var(--danger)" }}>
                {error}
              </span>
            )}
            <Button variant="text" size="sm" onClick={() => setEditing(false)} disabled={working}>
              取消
            </Button>
            <Button size="sm" onClick={save} disabled={working}>
              {working ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-2 rounded-btn px-1 py-1">
      <KindTag kind={row.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
          <span style={{ color: "var(--mute)" }}>{row.idx}.</span>
          <span>{row.text}</span>
          {row.isStructural && (
            <span
              className="rounded-pill px-1.5 py-px text-[11px]"
              style={{ background: "var(--line-soft)", color: "var(--slate)" }}
            >
              结构性
            </span>
          )}
        </div>
        {row.rawPhrase && (
          <div className="mt-0.5 text-[12px]" style={{ color: "var(--mute)" }}>
            原文：{row.rawPhrase}
          </div>
        )}
        {row.derivedFrom && (
          <div className="mt-0.5 text-[12px]" style={{ color: "var(--mute)" }}>
            从「{row.derivedFrom}」反推
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button variant="text" size="sm" onClick={() => setEditing(true)}>
          编辑
        </Button>
        <Button variant="text" size="sm" onClick={remove} disabled={working}>
          删除
        </Button>
      </div>
    </li>
  );
}

function NewRequirement({
  jdId,
  onClose,
  onAdded,
}: {
  jdId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<RequirementKind>("hard");
  const [isStructural, setStructural] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await addRequirement(jdId, { text, kind, isStructural });
      if (!res.ok) setError(res.error);
      else onAdded();
    });
  }

  return (
    <div
      className="mt-2 rounded-btn px-3 py-2.5"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="模型漏掉的那条要求"
        className="w-full rounded-btn px-2 py-1 text-[13.5px] focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as RequirementKind)}
          className="h-[30px] rounded-btn px-2 text-[13px]"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            checked={isStructural}
            onChange={(e) => setStructural(e.target.checked)}
          />
          结构性
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          {error && (
            <span className="text-[12px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <Button variant="text" size="sm" onClick={onClose} disabled={working}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={working}>
            {working ? "添加中…" : "添加"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const TAG_STYLE: Record<RequirementKind, { bg: string; fg: string }> = {
  hard: { bg: "var(--line-soft)", fg: "var(--ink)" },
  implicit: { bg: "var(--ai-soft)", fg: "var(--ai)" },
  nice_to_have: { bg: "transparent", fg: "var(--mute)" },
};

function KindTag({ kind }: { kind: RequirementKind }) {
  const s = TAG_STYLE[kind];
  return (
    <span
      className="mt-0.5 shrink-0 rounded-pill px-1.5 py-px text-[11px]"
      style={{ background: s.bg, color: s.fg, width: 34, textAlign: "center" }}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}
