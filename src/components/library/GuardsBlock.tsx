"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { deleteGuards, upsertGuards } from "@/app/(app)/library/actions";
import type { Probe } from "@/lib/domain";
import type { AtomGuards } from "@/lib/queries/atoms";

export function GuardsBlock({
  atomId,
  guards,
}: {
  atomId: string;
  guards: AtomGuards | null;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [awaiting, setAwaiting] = useState(false);
  const [seen, setSeen] = useState(guards);
  if (seen !== guards) {
    setSeen(guards);
    if (awaiting) {
      setAwaiting(false);
      setEditing(false);
    }
  }
  const working = pending || awaiting;

  const [role, setRole] = useState(guards?.role_framing ?? "");
  const [must, setMust] = useState<string[]>(guards?.must_say ?? []);
  const [never, setNever] = useState<string[]>(guards?.never_say ?? []);
  const [probes, setProbes] = useState<Probe[]>(guards?.probes ?? []);

  function open() {
    setRole(guards?.role_framing ?? "");
    setMust(guards?.must_say ?? []);
    setNever(guards?.never_say ?? []);
    setProbes(guards?.probes ?? []);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await upsertGuards({
        atom_id: atomId,
        role_framing: role,
        must_say: must,
        never_say: never,
        probes: probes.filter((p) => p.q.trim().length > 0),
      });
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteGuards(atomId);
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  if (editing) {
    return (
      <div
        className="rounded-btn p-3"
        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditing(false);
          }
        }}
      >
        <Field label="角色定位">
          <input
            autoFocus
            aria-label="角色定位"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="比如「产品负责人，带一个 4 人小组」"
            className={input}
            style={inputStyle}
          />
        </Field>

        <Field label="必须说">
          <Lines items={must} onChange={setMust} tone="proof" name="必须说" />
        </Field>

        <Field label="不能说">
          <Lines items={never} onChange={setNever} tone="danger" name="不能说" />
          <p className="mt-1 text-[12px]" style={{ color: "var(--mute)" }}>
            这里填的词，简历生成后会做一次复查，出现就报错。
          </p>
        </Field>

        <Field label="被追问时">
          {probes.map((probe, i) => (
            <div key={i} className="mb-1.5 flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <input
                  aria-label={`第 ${i + 1} 个问题`}
                  value={probe.q}
                  onChange={(e) =>
                    setProbes(probes.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))
                  }
                  placeholder="面试官会怎么追？"
                  className={input}
                  style={inputStyle}
                />
                <input
                  aria-label={`第 ${i + 1} 个应答要点`}
                  value={probe.a_outline}
                  onChange={(e) =>
                    setProbes(
                      probes.map((x, j) => (j === i ? { ...x, a_outline: e.target.value } : x)),
                    )
                  }
                  placeholder="应答要点"
                  className={`${input} mt-1`}
                  style={inputStyle}
                />
              </div>
              <Remove
                label={`删掉第 ${i + 1} 个追问`}
                onClick={() => setProbes(probes.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <Button
            variant="text"
            size="sm"
            className="px-0"
            onClick={() => setProbes([...probes, { q: "", a_outline: "" }])}
          >
            ＋ 加一个追问
          </Button>
        </Field>

        <div className="mt-2 flex items-center gap-2">
          {guards && (
            <Button variant="danger" size="sm" onClick={remove} disabled={working}>
              删掉护栏
            </Button>
          )}
          {error && (
            <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={working}
            >
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

  // 没护栏时只给一句话和一个入口，不摆空表格
  if (!guards) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-[13px]" style={{ color: "var(--mute)" }}>
          还没设置叙事护栏。
        </span>
        <Button variant="secondary" size="sm" onClick={open}>
          添加
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {guards.role_framing && (
        <Part title="角色定位">
          <p className="text-[13.5px]">{guards.role_framing}</p>
        </Part>
      )}
      {guards.must_say.length > 0 && (
        <Part title="必须说">
          <Marks items={guards.must_say} tone="proof" />
        </Part>
      )}
      {guards.never_say.length > 0 && (
        <Part title="不能说">
          <Marks items={guards.never_say} tone="danger" />
        </Part>
      )}
      {guards.probes.length > 0 && (
        <Part title="被追问时">
          {guards.probes.map((probe, i) => (
            <div key={`${i}-${probe.q}`} className="py-1">
              <div className="text-[13.5px] font-medium">{probe.q}</div>
              {probe.a_outline && (
                <div className="text-[13px]" style={{ color: "var(--slate)" }}>
                  {probe.a_outline}
                </div>
              )}
            </div>
          ))}
        </Part>
      )}
      <Button variant="text" size="sm" className="px-0" onClick={open}>
        编辑护栏
      </Button>
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ---- 小件 ----

const input =
  "h-8 w-full rounded-btn px-2 text-[13px] outline-none transition-colors focus:border-[var(--ink)]";

const inputStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-medium" style={{ color: "var(--slate)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Marks({ items, tone }: { items: string[]; tone: "proof" | "danger" }) {
  const color = tone === "proof" ? "var(--proof)" : "var(--danger)";
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex gap-2 py-[3px] text-[13.5px]">
          <span aria-hidden style={{ color }}>
            {tone === "proof" ? "✓" : "✕"}
          </span>
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Lines({
  items,
  onChange,
  tone,
  name,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  tone: "proof" | "danger";
  name: string;
}) {
  const color = tone === "proof" ? "var(--proof)" : "var(--danger)";
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="mb-1.5 flex items-center gap-1.5">
          <span aria-hidden className="shrink-0 text-[13px]" style={{ color }}>
            {tone === "proof" ? "✓" : "✕"}
          </span>
          <input
            aria-label={`${name} 第 ${i + 1} 条`}
            value={item}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className={input}
            style={inputStyle}
          />
          <Remove
            label={`删掉${name}第 ${i + 1} 条`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button variant="text" size="sm" className="px-0" onClick={() => onChange([...items, ""])}>
        ＋ 加一条
      </Button>
    </>
  );
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-7 shrink-0 items-center justify-center rounded-btn text-[13px] transition-colors hover:bg-[var(--line-soft)]"
      style={{ border: "1px solid var(--line)", color: "var(--slate)" }}
    >
      ×
    </button>
  );
}
