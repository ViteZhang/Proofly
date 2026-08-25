"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { resolveFact, updateFact } from "@/app/(app)/facts/actions";
import type { ProfileFact } from "@/lib/queries/facts";

export function FactRow({ fact }: { fact: ProfileFact }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.value ?? "");
  const [choice, setChoice] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [awaiting, setAwaiting] = useState(false);
  const [seen, setSeen] = useState(fact);
  if (seen !== fact) {
    setSeen(fact);
    if (awaiting) {
      setAwaiting(false);
      setEditing(false);
    }
  }
  const working = pending || awaiting;
  const conflicted = fact.status !== "RESOLVED";

  function save() {
    setError(null);
    start(async () => {
      const res = await updateFact(fact.id, draft);
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  function decide() {
    setError(null);
    const value = choice === "__custom__" ? custom : (choice ?? "");
    start(async () => {
      const res = await resolveFact(fact.id, value);
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  return (
    <div className="border-t px-5 py-4 first:border-t-0" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex items-center gap-3">
        <span className="w-[110px] shrink-0 text-[13.5px] font-medium">{fact.label}</span>

        {editing ? (
          <input
            autoFocus
            aria-label={fact.label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 min-w-0 flex-1 rounded-btn px-2.5 text-[13.5px] outline-none focus:border-[var(--ink)]"
            style={{ background: "var(--card)", border: "1px solid var(--line)" }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: fact.value ? "var(--ink)" : "var(--mute)" }}>
            {fact.value || "还没填"}
          </span>
        )}

        {conflicted && <StatusChip status={fact.status} />}

        {editing ? (
          <span className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={working}>
              取消
            </Button>
            <Button size="sm" onClick={save} disabled={working}>
              {working ? "保存中…" : "保存"}
            </Button>
          </span>
        ) : (
          <Button
            variant="text"
            size="sm"
            className="shrink-0 px-0"
            onClick={() => {
              setDraft(fact.value ?? "");
              setEditing(true);
            }}
          >
            编辑
          </Button>
        )}
      </div>

      {/* 有冲突就把各来源的取值摆开，让人定一个。这是事实层存在的理由。 */}
      {conflicted && (
        <div
          className="mt-2.5 rounded-btn px-3.5 py-3"
          style={{ background: "var(--warn-soft)" }}
        >
          <p className="text-[13px] font-medium">多处记录不一致，需要你定一个</p>
          <div className="mt-2 space-y-1.5">
            {fact.conflicts.map((c) => (
              <label key={`${c.value}-${c.source}`} className="flex items-center gap-2 text-[13.5px]">
                <input
                  type="radio"
                  name={`fact-${fact.id}`}
                  checked={choice === c.value}
                  onChange={() => setChoice(c.value)}
                  className="h-3.5 w-3.5 accent-[var(--ink)]"
                />
                <span className="w-[110px] shrink-0">{c.value}</span>
                <span className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                  来源：{c.source}
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-[13.5px]">
              <input
                type="radio"
                name={`fact-${fact.id}`}
                checked={choice === "__custom__"}
                onChange={() => setChoice("__custom__")}
                className="h-3.5 w-3.5 accent-[var(--ink)]"
              />
              <span className="shrink-0">都不对，我自己填</span>
              <input
                aria-label="自己填"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setChoice("__custom__");
                }}
                className="h-7 w-[180px] rounded-btn px-2 text-[13px] outline-none focus:border-[var(--ink)]"
                style={{ background: "var(--card)", border: "1px solid var(--line)" }}
              />
            </label>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            {error && (
              <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>
                {error}
              </span>
            )}
            <Button
              size="sm"
              className="ml-auto"
              onClick={decide}
              disabled={working || choice === null}
            >
              {working ? "保存中…" : "确定用这个"}
            </Button>
          </div>
        </div>
      )}

      {!conflicted && error && (
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: "PENDING" | "BLOCKING" | "RESOLVED" }) {
  const danger = status === "BLOCKING";
  return (
    <span
      className="font-display shrink-0 rounded-pill px-2 py-[2px] text-[11px] font-medium"
      style={{
        background: danger ? "var(--danger-soft)" : "var(--warn-soft)",
        color: danger ? "var(--danger)" : "var(--warn)",
      }}
    >
      {status}
    </span>
  );
}
