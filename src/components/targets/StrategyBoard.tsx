"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ProofDot } from "@/components/library/ProofDot";
import { saveStrategies, type StrategyEntry } from "@/app/app/targets/strategy-actions";
import {
  conflictNotice,
  findConflicts,
  normalizeGroup,
  RENDER_WEIGHT_LABEL,
  RENDER_WEIGHT_ORDER,
  type Strategy,
} from "@/lib/targets/strategy";
import type { StrategyBoard as Board } from "@/lib/queries/strategy";
import type { RenderWeight } from "@/types/database";

type Edited = { renderWeight: RenderWeight; exclusiveGroup: string };

// 批量配置：行是经历（能力点缩进跟在各自经历下面），列是这个方向的两个字段。
// 撞车提示在浏览器里现算 —— findConflicts 是纯函数，边改边看，
// 不用为了看一眼提示先存一次库。
export function StrategyBoard({ board }: { board: Board }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Map<string, Edited>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, start] = useTransition();

  function current(atomId: string): Edited {
    const row = board.rows.find((r) => r.atomId === atomId)!;
    return edits.get(atomId) ?? {
      renderWeight: row.renderWeight,
      exclusiveGroup: row.exclusiveGroup ?? "",
    };
  }

  function edit(atomId: string, patch: Partial<Edited>) {
    setSaved(null);
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(atomId, { ...current(atomId), ...patch });
      return next;
    });
  }

  // 改回原值就不算改动 —— 否则保存时会为一条没变的记录写库。
  const dirty = useMemo(() => {
    const out: StrategyEntry[] = [];
    for (const [atomId, e] of edits) {
      const row = board.rows.find((r) => r.atomId === atomId);
      if (!row) continue;
      const group = normalizeGroup(e.exclusiveGroup);
      if (row.configured && row.renderWeight === e.renderWeight && row.exclusiveGroup === group) {
        continue;
      }
      if (!row.configured && e.renderWeight === row.renderWeight && group === null) continue;
      out.push({ atomId, renderWeight: e.renderWeight, exclusiveGroup: e.exclusiveGroup });
    }
    return out;
  }, [edits, board.rows]);

  // 用当前界面上的值算撞车，不是用库里的值
  const conflicts = useMemo(() => {
    const live: Strategy[] = board.rows.map((r) => {
      const e = edits.get(r.atomId);
      return {
        atomId: r.atomId,
        targetId: board.target.id,
        renderWeight: e?.renderWeight ?? r.renderWeight,
        exclusiveGroup: e ? normalizeGroup(e.exclusiveGroup) : r.exclusiveGroup,
        configured: true,
      };
    });
    return findConflicts(live);
  }, [board.rows, board.target.id, edits]);

  const clashingAtoms = new Set(conflicts.flatMap((c) => c.atomIds));
  const titleOf = (id: string) => board.rows.find((r) => r.atomId === id)?.title ?? "";
  const knownGroups = [
    ...new Set(
      board.rows
        .map((r) => normalizeGroup(current(r.atomId).exclusiveGroup))
        .filter((g): g is string => g !== null),
    ),
  ].sort();

  function save() {
    setError(null);
    start(async () => {
      const res = await saveStrategies(board.target.id, dirty);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(res.data.saved);
      setEdits(new Map());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/app/targets?target=${board.target.id}`}
            className="text-[12.5px] hover:underline"
            style={{ color: "var(--slate)" }}
          >
            ← 求职方向
          </Link>
          <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight">
            配置经历策略
          </h1>
          <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
            「{board.target.name}」方向下，每条经历讲多少。互斥组只在这个方向里生效。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saved !== null && (
            <span className="text-[12.5px]" style={{ color: "var(--proof)" }}>
              {saved === 0 ? "没有改动" : `存了 ${saved} 条`}
            </span>
          )}
          {error && (
            <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <Button size="sm" onClick={save} disabled={saving || dirty.length === 0}>
            {saving ? "保存中…" : dirty.length > 0 ? `保存 ${dirty.length} 条改动` : "保存"}
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mt-5 space-y-1.5">
          {conflicts.map((c) => (
            <p
              key={c.group}
              className="rounded-btn px-3 py-2 text-[12.5px] leading-relaxed"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              <strong className="font-semibold">{c.group}</strong> · {conflictNotice(c.atomIds.length)}
              <span className="opacity-80">
                {" "}
                —— {c.atomIds.map((id) => `「${titleOf(id)}」`).join("")}
              </span>
            </p>
          ))}
        </div>
      )}

      <div
        className="mt-5 overflow-hidden rounded-card"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <div
          className="grid gap-3 px-4 py-2.5 text-[11.5px]"
          style={{
            gridTemplateColumns: "1fr 110px 200px",
            color: "var(--mute)",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <span>经历</span>
          <span>展开程度</span>
          <span>互斥组</span>
        </div>

        {board.rows.length === 0 ? (
          <p className="px-4 py-6 text-[13px]" style={{ color: "var(--mute)" }}>
            经历库还是空的。先导入或记几条经历。
          </p>
        ) : (
          board.rows.map((row) => {
            const e = current(row.atomId);
            const clashing = clashingAtoms.has(row.atomId);
            return (
              <div
                key={row.atomId}
                className="grid items-center gap-3 px-4 py-2"
                style={{
                  gridTemplateColumns: "1fr 110px 200px",
                  borderBottom: "1px solid var(--line-soft)",
                  // 撞车的行在左边留一道黄条，好在长表格里找回来
                  boxShadow: clashing ? "inset 3px 0 0 var(--warn)" : undefined,
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {row.level !== "project" && (
                    <span className="shrink-0 pl-4 text-[11px]" style={{ color: "var(--mute)" }}>
                      └
                    </span>
                  )}
                  <ProofDot level={row.evidenceLevel} />
                  <span className="truncate text-[13.5px]">{row.title}</span>
                  {row.org && (
                    <span className="shrink-0 truncate text-[12px]" style={{ color: "var(--mute)" }}>
                      {row.org}
                    </span>
                  )}
                </div>

                <select
                  value={e.renderWeight}
                  onChange={(ev) => edit(row.atomId, { renderWeight: ev.target.value as RenderWeight })}
                  aria-label={`${row.title}的展开程度`}
                  className="h-[30px] rounded-btn px-2 text-[13px] focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }}
                >
                  {RENDER_WEIGHT_ORDER.map((w) => (
                    <option key={w} value={w}>
                      {RENDER_WEIGHT_LABEL[w]}
                    </option>
                  ))}
                </select>

                <input
                  value={e.exclusiveGroup}
                  onChange={(ev) => edit(row.atomId, { exclusiveGroup: ev.target.value })}
                  list="strategy-groups"
                  placeholder="—"
                  aria-label={`${row.title}的互斥组`}
                  className="h-[30px] rounded-btn px-2 text-[13px] focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }}
                />
              </div>
            );
          })
        )}
      </div>

      <datalist id="strategy-groups">
        {knownGroups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <p className="mt-3 text-[12.5px]" style={{ color: "var(--mute)" }}>
        没配过的经历按「{RENDER_WEIGHT_LABEL.brief}」算，库里不会为它们建记录。改了才存。
      </p>
    </div>
  );
}
