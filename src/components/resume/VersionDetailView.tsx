"use client";

// =============================================================
// Proofly · 投递版本详情（S8-B 第二层）
//
// 只展示差异。一份版本跟基线之间的区别通常是 3–6 处，把全文摊开
// 等于让用户自己去找那 6 处 —— 找不全就等于没看。
//
// 逐条可拒绝：拒绝后立刻重算 delta_ratio 并重新渲染完整简历，
// 因为「这一版到底长什么样」必须随时说得准。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ResumePaper } from "./ResumePaper";
import { InspectPanel } from "./InspectPanel";
import { toggleDelta } from "@/app/app/resume/version-actions";
import { DELTA_LABEL } from "@/lib/resume/delta";
import type { DeltaView, VersionDetail } from "@/lib/queries/resume";

export function VersionDetailView({ version }: { version: VersionDetail }) {
  const router = useRouter();
  const [full, setFull] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const accepted = version.deltas.filter((d) => d.accepted);
  const changed = new Set(accepted.map((d) => d.targetBlockId));

  function toggle(d: DeltaView) {
    setError(null);
    start(async () => {
      const r = await toggleDelta(version.id, d.id, !d.accepted);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <h1 className="font-display text-[24px] font-semibold tracking-tight">
        {version.company} · {version.roleTitle}
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--slate)" }}>
        {version.matchScore !== null && `匹配 ${Math.round(version.matchScore)}　`}
        {accepted.length} 处调整　动到 {version.affected}/{version.totalBlocks} 块（
        {Math.round(version.deltaRatio * 100)}%）　
        {version.locked ? "已投递（已锁定）" : "草稿"}
        {version.deltaRatio > 0.4 && (
          <span className="ml-2" style={{ color: "var(--caution)" }}>
            ⚠ 改动偏多
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--mute)" }}>
        基于「{version.targetName}」的基线，只生成差异部分。
      </p>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-6">
        <div className="min-w-0" style={{ width: 720 }}>
          {version.deltas.length === 0 ? (
            <p
              className="rounded-card px-5 py-4 text-[13.5px] leading-relaxed"
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                color: "var(--slate)",
              }}
            >
              这一版跟基线没有差异。要么这份 JD 跟方向高度吻合，要么经历库里
              暂时没有能对上的新内容 —— 下面的「没有对应内容的要求」会告诉你是哪种。
            </p>
          ) : (
            <div className="space-y-2.5">
              {version.deltas.map((d) => (
                <DeltaCard
                  key={d.id}
                  delta={d}
                  busy={busy}
                  locked={version.locked}
                  onToggle={() => toggle(d)}
                />
              ))}
            </div>
          )}

          {version.unmatched.length > 0 && (
            <section
              className="mt-5 rounded-card px-5 py-4"
              style={{ background: "var(--card)", border: "1px solid var(--line)" }}
            >
              <h2 className="text-[13.5px] font-semibold">
                没有对应内容的要求 {version.unmatched.length} 条
              </h2>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--mute)" }}>
                这些没有硬凑。硬凑出来的东西，面试第一轮就会被问到。
              </p>
              <ul className="mt-2 space-y-1">
                {version.unmatched.map((u, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed">
                    <span style={{ color: "var(--mute)" }}>第 {u.requirementIndex + 1} 条</span>{" "}
                    {u.note}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {version.warnings.length > 0 && (
            <section
              className="mt-3 rounded-card px-5 py-4"
              style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)" }}
            >
              <h2 className="text-[13.5px] font-semibold">
                丢弃了 {version.warnings.length} 条不合格的调整
              </h2>
              <ul className="mt-2 space-y-1">
                {version.warnings.map((w, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed">
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-5">
            <Button size="sm" variant="secondary" onClick={() => setFull((v) => !v)}>
              {full ? "收起完整简历" : "看完整简历"}
            </Button>
          </div>

          {full && (
            <div className="mt-4">
              <ResumePaper
                headline={version.headline}
                blocks={version.blocks}
                skills={version.skills}
                selectedId={selectedId}
                onSelect={setSelectedId}
                highlight={changed}
              />
            </div>
          )}
        </div>

        {full && (
          <aside className="w-[300px] shrink-0">
            <InspectPanel
              readOnly
              baseline={{
                id: version.id,
                targetId: version.targetId,
                targetName: version.targetName,
                headline: version.headline,
                lockedAt: null,
                generatedAt: null,
                blocks: version.blocks,
                tradeoffs: [],
                skills: version.skills,
                checks: version.checks,
                why: version.why,
                draftCount: 0,
                versionCount: 0,
              }}
              preview={null}
              block={version.blocks.find((b) => b.id === selectedId) ?? null}
              locked
              onMove={() => {}}
              canMoveUp={false}
              canMoveDown={false}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  keyword_align: "var(--ai)",
  bullet_add: "var(--proof)",
  bullet_drop: "var(--warn)",
  reorder: "var(--slate)",
  headline_tweak: "var(--ai)",
};

function DeltaCard({
  delta,
  busy,
  locked,
  onToggle,
}: {
  delta: DeltaView;
  busy: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const off = !delta.accepted;
  return (
    <section
      className="rounded-card px-5 py-4"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        opacity: off ? 0.55 : 1,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: TONE[delta.type] }}>
          {DELTA_LABEL[delta.type]}
        </span>
        <span className="text-[12px]" style={{ color: "var(--mute)" }}>
          {delta.blockTitle}
        </span>
        {delta.manual && (
          <span className="text-[11.5px]" style={{ color: "var(--caution)" }}>
            位置说明读不出确切名次，没有自动搬 —— 在基线页上拖一下
          </span>
        )}
        {off && (
          <span className="text-[11.5px]" style={{ color: "var(--mute)" }}>
            已拒绝
          </span>
        )}
      </div>

      <div className="mt-1.5 text-[13.5px] leading-relaxed">
        {delta.type === "keyword_align" ? (
          <p>
            「{delta.before}」→「{delta.after}」
          </p>
        ) : delta.type === "bullet_add" ? (
          <p>
            <span style={{ color: "var(--proof)" }}>＋ </span>
            {delta.after}
          </p>
        ) : delta.type === "bullet_drop" ? (
          <p>
            <span style={{ color: "var(--warn)" }}>− </span>
            <span style={{ textDecoration: "line-through" }}>{delta.before}</span>
          </p>
        ) : (
          <p>
            {delta.before} → {delta.after}
          </p>
        )}
      </div>

      <p className="mt-1 text-[12.5px]" style={{ color: "var(--slate)" }}>
        {delta.reason}
      </p>

      {delta.type === "bullet_add" && delta.sourceTitle && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--mute)" }}>
          来自「{delta.sourceTitle}」的 {delta.sourceWhere ?? "某一项"}
        </p>
      )}

      {!locked && (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className="mt-2 text-[12.5px] hover:underline disabled:opacity-50"
          style={{ color: off ? "var(--ink)" : "var(--mute)" }}
        >
          {off ? "恢复这一条" : "拒绝这一条"}
        </button>
      )}
    </section>
  );
}
