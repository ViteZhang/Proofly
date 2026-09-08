"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { saveFact } from "@/app/app/profile/actions";
import { resolveFact } from "@/app/app/facts/actions";
import { FACT_KEYS, FACT_REGISTRY, type FactKey } from "@/lib/profile/registry";
import type { ProfileFact } from "@/lib/queries/facts";
import { ExportTag, Section } from "./parts";
import { inputClass, inputStyle } from "./Drawer";

/**
 * 身份与联系方式：行内编辑，逐字段保存。
 *
 * 不做整块的「编辑 / 保存」两态：一次只改一个字段是这一页最常见的动作，
 * 为改一个手机号让整块进入编辑态，等于把另外九个字段也置于可改状态，
 * 手滑的代价是一份错的简历。
 */
export function IdentityEditor({ facts }: { facts: ProfileFact[] }) {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const rows = FACT_KEYS.filter((k) => k !== "entity_disclosure");
  const disclosure = byKey.get("entity_disclosure");

  return (
    <Section
      id="identity"
      title="身份与联系方式"
      desc="简历抬头直接取这几项。标着「仅匹配」的只参与 JD 匹配，不会印出去。"
    >
      <div>
        {rows.map((key) => (
          <FactLine key={key} fieldKey={key} fact={byKey.get(key) ?? null} />
        ))}
      </div>

      {/* 披露口径与上面隔开：它是「怎么说事实」的规则，不是事实本身。
          并排列着，用户会以为它也会被印在简历上。 */}
      <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--line)" }}>
        <div className="text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
          对外披露口径
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--mute)" }}>
          公司主体与对外品牌不一致时怎么说。它是规则，不是事实，不会被印在简历上。
        </p>
        <div className="mt-2">
          <FactLine fieldKey="entity_disclosure" fact={disclosure ?? null} bare />
        </div>
      </div>
    </Section>
  );
}

function FactLine({
  fieldKey,
  fact,
  bare = false,
}: {
  fieldKey: FactKey;
  fact: ProfileFact | null;
  /** 披露口径那一行不显示标签和「进简历」角标，它已经有自己的标题了。 */
  bare?: boolean;
}) {
  const spec = FACT_REGISTRY[fieldKey];
  const value = fact?.value?.trim() ?? "";

  // 体检的「去解决」带着 ?key=phone&highlight=1 过来，滚到那一行并高亮。
  const params = useSearchParams();
  const targeted = params.get("key") === fieldKey;
  const row = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (targeted) row.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [targeted]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 服务端把新值送回来了，才退出编辑态。提前退出会闪一下旧值。
  const [seen, setSeen] = useState(fact);
  const [awaiting, setAwaiting] = useState(false);
  if (seen !== fact) {
    setSeen(fact);
    if (awaiting) {
      setAwaiting(false);
      setEditing(false);
    }
  }
  const busy = pending || awaiting;
  const conflicted = fact !== null && fact.status !== "RESOLVED";

  function open() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveFact(fieldKey, draft);
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  function decide(chosen: string) {
    setError(null);
    if (!fact) return;
    start(async () => {
      const res = await resolveFact(fact.id, chosen);
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  if (editing) {
    return (
      <div
        ref={row}
        className={`grid ${bare ? "grid-cols-1" : "grid-cols-[104px_1fr]"} items-start gap-3 border-t border-[var(--line-soft)] py-2.5 first:border-t-0`}
      >
        {!bare && (
          <span className="pt-2 text-[12.5px]" style={{ color: "var(--mute)" }}>
            {spec.label}
          </span>
        )}
        <div className="min-w-0">
          {spec.type === "select" ? (
            <select
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">还没定</option>
              {(spec.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder={spec.hint}
              className={inputClass}
              style={inputStyle}
            />
          )}
          {error && (
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy} onClick={save}>
              {busy ? "保存中…" : "保存"}
            </Button>
            <Button size="sm" variant="text" disabled={busy} onClick={() => setEditing(false)}>
              取消
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={row}
      className={`group grid ${bare ? "grid-cols-[1fr_auto]" : "grid-cols-[104px_1fr_auto_auto]"} items-center gap-3 border-t border-[var(--line-soft)] py-2.5 first:border-t-0`}
      style={targeted ? { background: "var(--warn-soft)" } : undefined}
    >
      {!bare && (
        <span className="text-[12.5px]" style={{ color: "var(--mute)" }}>
          {spec.label}
        </span>
      )}
      <button
        type="button"
        onClick={open}
        className="min-w-0 truncate rounded-btn px-1.5 py-1 text-left text-[13.5px] transition-colors hover:bg-[var(--line-soft)] focus-visible:outline-2 focus-visible:outline-ink"
        style={value ? undefined : { color: "var(--ghost)" }}
      >
        {value || "还没填，点一下填"}
      </button>
      {!bare && <ExportTag exportable={spec.exportable} />}
      <span className="text-[11.5px]" style={{ color: "var(--mute)" }}>
        {conflicted ? "口径待定" : ""}
      </span>

      {conflicted && fact && (
        <div className="col-span-full">
          <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
            几处材料说法不一样，定一个之后简历和面试都按它走：
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {fact.conflicts.map((c, i) => (
              <button
                key={`${c.value}-${i}`}
                type="button"
                disabled={busy}
                onClick={() => decide(c.value)}
                className="rounded-pill px-3 py-1 text-[12.5px] transition-colors hover:bg-[var(--line-soft)] disabled:opacity-50"
                style={{ border: "1px solid var(--line)" }}
              >
                {c.value}
                {c.source && (
                  <span style={{ color: "var(--mute)" }}> · {c.source}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
