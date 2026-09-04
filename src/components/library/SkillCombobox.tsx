"use client";

import { useEffect, useState, useTransition } from "react";
import { linkSkill, searchSkills, type SkillOption } from "@/app/app/library/actions";

/**
 * 技能输入必须是 combobox，不能是纯文本框。
 * skills 上有 unique(user_id, label)：敲一个已经存在的技能名，纯文本框会直接
 * 撞唯一约束，用户看到的是一串英文数据库报错。所以先查再建——命中就复用。
 */
export function SkillCombobox({
  atomId,
  linkedIds,
  onDone,
  onCancel,
}: {
  atomId: string;
  linkedIds: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<SkillOption[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSkills(q).then((res) => {
        if (res.ok) setOptions(res.data);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  const keyword = q.trim();
  const exact = options.find((o) => o.label.toLowerCase() === keyword.toLowerCase());
  // 没命中已有技能才给「新建」这一项
  const rows: ({ kind: "existing" } & SkillOption)[] | never[] = options.map((o) => ({
    kind: "existing" as const,
    ...o,
  }));
  const showCreate = keyword.length > 0 && !exact;
  const total = rows.length + (showCreate ? 1 : 0);

  function choose(index: number) {
    if (saving) return;
    setError(null);
    const row = rows[index];

    startSave(async () => {
      const res = row
        ? await linkSkill({ atom_id: atomId, skill_id: row.id })
        : await linkSkill({ atom_id: atomId, label: keyword });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <div className="relative w-[280px]">
      <input
        autoFocus
        aria-label="技能"
        role="combobox"
        aria-controls="skill-options"
        aria-expanded={total > 0}
        aria-autocomplete="list"
        value={q}
        disabled={saving}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, total - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (total > 0) choose(active);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder="敲技能名，已有的会自动匹配"
        className="h-8 w-full rounded-btn px-2.5 text-[13px] outline-none transition-colors focus:border-[var(--ink)] disabled:opacity-50"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      />

      {total > 0 && (
        <ul
          id="skill-options"
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-[220px] w-full overflow-y-auto rounded-btn py-1"
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-3)",
          }}
        >
          {rows.map((o, i) => {
            const already = linkedIds.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  disabled={already || saving}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] disabled:opacity-45"
                  style={{ background: i === active ? "var(--line-soft)" : "transparent" }}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="shrink-0 text-[11.5px]" style={{ color: "var(--mute)" }}>
                    {already ? "已关联" : "复用"}
                  </span>
                </button>
              </li>
            );
          })}
          {showCreate && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={active === rows.length}
                disabled={saving}
                onMouseEnter={() => setActive(rows.length)}
                onClick={() => choose(rows.length)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]"
                style={{
                  background: active === rows.length ? "var(--line-soft)" : "transparent",
                }}
              >
                <span className="min-w-0 flex-1 truncate">新建「{keyword}」</span>
                <span className="shrink-0 text-[11.5px]" style={{ color: "var(--mute)" }}>
                  新技能
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      {error && (
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
