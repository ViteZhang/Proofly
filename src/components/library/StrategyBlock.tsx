"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStrategy } from "@/app/app/targets/strategy-actions";
import {
  conflictNotice,
  normalizeGroup,
  RENDER_WEIGHT_LABEL,
  RENDER_WEIGHT_ORDER,
} from "@/lib/targets/strategy";
import type { AtomStrategyRow } from "@/lib/queries/strategy";
import type { RenderWeight } from "@/types/database";

// S3 第 9 区块。一行一个求职方向 —— 同一条经历在不同方向下的讲法不一样，
// 这张表就是「不一样」的落点。
export function StrategyBlock({
  atomId,
  rows,
}: {
  atomId: string;
  rows: AtomStrategyRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        还没有求职方向。建了方向之后，可以在这里配置这条经历在各方向下的展开程度。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="grid items-center gap-3 px-1 text-[11.5px]"
        style={{ gridTemplateColumns: "1fr 96px 1fr", color: "var(--mute)" }}
      >
        <span>方向</span>
        <span>展开程度</span>
        <span>互斥组</span>
      </div>
      {rows.map((row) => (
        <StrategyRow key={row.targetId} atomId={atomId} row={row} />
      ))}
    </div>
  );
}

function StrategyRow({ atomId, row }: { atomId: string; row: AtomStrategyRow }) {
  const router = useRouter();
  const listId = useId();
  const [weight, setWeight] = useState<RenderWeight>(row.renderWeight);
  const [group, setGroup] = useState(row.exclusiveGroup ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  // 改一次存一次，只碰这一条记录。没动过的方向在库里始终没有行。
  function save(next: { renderWeight: RenderWeight; exclusiveGroup: string }) {
    setError(null);
    start(async () => {
      const res = await saveStrategy(row.targetId, {
        atomId,
        renderWeight: next.renderWeight,
        exclusiveGroup: next.exclusiveGroup,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 撞车提示是查库算出来的，存完要重新拿一遍
      router.refresh();
    });
  }

  function onWeight(v: RenderWeight) {
    setWeight(v);
    save({ renderWeight: v, exclusiveGroup: group });
  }

  // 组名用失焦保存：边打字边存会在库里留下一串半截的组名。
  function onGroupBlur() {
    if (normalizeGroup(group) === row.exclusiveGroup) return;
    save({ renderWeight: weight, exclusiveGroup: group });
  }

  const clashCount = row.clashesWith.length + 1;

  return (
    <div>
      <div
        className="grid items-center gap-3 rounded-btn px-1"
        style={{ gridTemplateColumns: "1fr 96px 1fr" }}
      >
        <span className="truncate text-[13.5px]">{row.targetName}</span>

        <select
          value={weight}
          onChange={(e) => onWeight(e.target.value as RenderWeight)}
          disabled={saving}
          aria-label={`${row.targetName}下的展开程度`}
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
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          onBlur={onGroupBlur}
          disabled={saving}
          list={listId}
          placeholder="—"
          aria-label={`${row.targetName}下的互斥组`}
          className="h-[30px] rounded-btn px-2 text-[13px] focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
          style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }}
        />
        <datalist id={listId}>
          {row.knownGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      {/* 只提示，不阻断 —— 真正的取舍在 Step 6 生成简历时做 */}
      {row.clashesWith.length > 0 && (
        <p
          className="mt-1 rounded-btn px-2 py-1 text-[12px] leading-relaxed"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          {conflictNotice(clashCount)}
          <span className="opacity-80">
            {" "}
            · 同组的还有{row.clashesWith.map((c) => `「${c.title}」`).join("")}
          </span>
        </p>
      )}

      {error && (
        <p className="mt-1 px-2 text-[12px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
