"use client";

// =============================================================
// Proofly · 投递版本（S8-B 的入口，列表与详情在 6.5）
//
// 基线没锁定，这里的生成入口一律禁用。这条不开后门：基线会飘的话，
// 「只生成差异」就没有意义了 —— 每份版本都在跟一个不一样的底稿做差异。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  ackOverThreshold,
  generateVersion,
  type VersionOutcome,
} from "@/app/(app)/resume/version-actions";
import { farOffCopy, overThresholdCopy } from "@/lib/resume/delta";
import type { VersionSummary } from "@/lib/queries/resume";

export function VersionSection({
  locked,
  versions,
  jdsWithoutVersion,
  hasBaseline,
}: {
  locked: boolean;
  versions: VersionSummary[];
  jdsWithoutVersion: { id: string; company: string; roleTitle: string }[];
  hasBaseline: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<VersionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [, start] = useTransition();

  function run(jdId: string) {
    setError(null);
    setOutcome(null);
    setRunning(jdId);
    start(async () => {
      const r = await generateVersion(jdId);
      setRunning(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOutcome(r.data);
      router.refresh();
    });
  }

  const rows = [
    ...versions.map((v) => ({
      jdId: v.jdId,
      company: v.company,
      roleTitle: v.roleTitle,
      version: v as VersionSummary | null,
    })),
    ...jdsWithoutVersion.map((j) => ({
      jdId: j.id,
      company: j.company,
      roleTitle: j.roleTitle,
      version: null as VersionSummary | null,
    })),
  ];

  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[16px] font-semibold">
          投递版本 <span style={{ color: "var(--mute)" }}>{versions.length} 份</span>
        </h2>
      </div>

      {!hasBaseline ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--mute)" }}>
          先生成一份基线。投递版本是基线的差异，没有基线就没有差异可言。
        </p>
      ) : !locked ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--warn)" }}>
          先锁定基线 —— 基线会飘的话，每份版本都在跟一个不一样的底稿做差异。
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--mute)" }}>
          这个方向下还没有 JD。
          <Link href="/targets" className="ml-1 underline" style={{ color: "var(--ink)" }}>
            去贴一份
          </Link>
        </p>
      ) : null}

      {rows.length > 0 && (
        <div
          className="mt-3 overflow-hidden rounded-card"
          style={{ background: "var(--card)", border: "1px solid var(--line)", maxWidth: 720 }}
        >
          {rows.map((r, i) => (
            <div
              key={r.jdId}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-soft)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">
                  {r.company} · {r.roleTitle}
                  {r.version?.locked && (
                    <span className="ml-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
                      已投递（已锁定）
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--mute)" }}>
                  {r.version
                    ? `${r.version.matchScore !== null ? `匹配 ${Math.round(r.version.matchScore)}　` : ""}${r.version.deltaCount} 处调整　${Math.round(r.version.deltaRatio * 100)}% 的块被改动`
                    : "还没生成版本"}
                  {r.version && r.version.deltaRatio > 0.4 && (
                    <span className="ml-2" style={{ color: "var(--caution)" }}>
                      ⚠ 改动偏多
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!locked || running !== null || !!r.version?.locked}
                onClick={() => run(r.jdId)}
              >
                {running === r.jdId ? "生成中…" : r.version ? "重新生成" : "生成简历"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 max-w-[720px] text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {outcome && <Outcome outcome={outcome} onClose={() => setOutcome(null)} />}
    </section>
  );
}

function Outcome({
  outcome,
  onClose,
}: {
  outcome: VersionOutcome;
  onClose: () => void;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [, start] = useTransition();
  const showDialog = (outcome.over || outcome.farOff) && !outcome.acked && !dismissed;

  return (
    <>
      <div
        className="mt-3 max-w-[720px] rounded-card px-4 py-3 text-[13px]"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <p>
          生成了 {outcome.deltaCount} 处调整，动到 {outcome.affected}/{outcome.totalBlocks} 块（
          {Math.round(outcome.deltaRatio * 100)}%）。
        </p>
        {outcome.unmatched.length > 0 && (
          <div className="mt-2">
            <p className="text-[12.5px]" style={{ color: "var(--slate)" }}>
              有 {outcome.unmatched.length} 条要求在经历库里找不到对应内容，没有硬凑：
            </p>
            <ul className="mt-1 space-y-0.5">
              {outcome.unmatched.map((u, i) => (
                <li key={i} className="text-[12.5px]" style={{ color: "var(--mute)" }}>
                  第 {u.requirement_index + 1} 条 · {u.note}
                </li>
              ))}
            </ul>
          </div>
        )}
        {outcome.warnings.length > 0 && (
          <div className="mt-2">
            <p className="text-[12.5px]" style={{ color: "var(--warn)" }}>
              丢弃了 {outcome.warnings.length} 条不合格的调整：
            </p>
            <ul className="mt-1 space-y-0.5">
              {outcome.warnings.map((w, i) => (
                <li key={i} className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 text-[12.5px] hover:underline"
          style={{ color: "var(--mute)" }}
        >
          知道了
        </button>
      </div>

      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(12,14,20,0.4)" }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="改动偏多"
            className="w-full max-w-[460px] rounded-card px-6 py-5"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
          >
            <p className="text-[14px] leading-relaxed">
              {outcome.over
                ? overThresholdCopy(outcome.affected, outcome.totalBlocks, outcome.deltaRatio)
                : farOffCopy(outcome.unmatched.length, outcome.requirementCount)}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Link href="/targets?new=1">
                <Button size="sm">新建方向</Button>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  start(async () => {
                    await ackOverThreshold(outcome.versionId);
                    setDismissed(true);
                    router.refresh();
                  })
                }
              >
                就这样用
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
