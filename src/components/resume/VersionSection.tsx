"use client";

// =============================================================
// Proofly · 投递版本列表（S8-B 第一层）
//
// 草稿在前，已投递在后。已投递的不可编辑、显示锁标记 ——
// 投出去的那份是什么样，事后必须还查得到，那是面试前唯一能复习的东西。
//
// 基线没锁定，生成入口一律禁用。这条不开后门：基线会飘的话，
// 「只生成差异」就没有意义了 —— 每份版本都在跟一个不一样的底稿做差异。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  ackOverThreshold,
  duplicateVersion,
  generateVersion,
  submitVersion,
  type VersionOutcome,
} from "@/app/app/resume/version-actions";
import { farOffCopy, overThresholdCopy } from "@/lib/resume/delta";
import type { VersionSummary } from "@/lib/queries/resume";

type Jd = { id: string; company: string; roleTitle: string };

export function VersionSection({
  locked,
  blockingCount,
  versions,
  jdsWithoutVersion,
  hasBaseline,
}: {
  locked: boolean;
  blockingCount: number;
  versions: VersionSummary[];
  jdsWithoutVersion: Jd[];
  hasBaseline: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<VersionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | { mode: "new" } | { mode: "copy"; from: VersionSummary }>(
    null,
  );
  const [submitting, setSubmitting] = useState<VersionSummary | null>(null);
  const [, start] = useTransition();

  function run(jdId: string, fromVersionId?: string) {
    setError(null);
    setOutcome(null);
    setPicker(null);
    setRunning(jdId);
    start(async () => {
      const r = fromVersionId
        ? await duplicateVersion(fromVersionId, jdId)
        : await generateVersion(jdId);
      setRunning(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOutcome(r.data);
      router.refresh();
    });
  }

  const canGenerate = hasBaseline && locked && running === null;

  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between gap-4" style={{ maxWidth: 720 }}>
        <h2 className="text-[16px] font-semibold">
          投递版本 <span style={{ color: "var(--mute)" }}>{versions.length} 份</span>
        </h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canGenerate || jdsWithoutVersion.length === 0}
          onClick={() => setPicker({ mode: "new" })}
        >
          ＋ 为新 JD 生成
        </Button>
      </div>

      {!hasBaseline ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--mute)" }}>
          先生成一份基线。投递版本是基线的差异，没有基线就没有差异可言。
        </p>
      ) : !locked ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--warn)" }}>
          先锁定基线 —— 基线会飘的话，每份版本都在跟一个不一样的底稿做差异。
        </p>
      ) : versions.length === 0 && jdsWithoutVersion.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--mute)" }}>
          这个方向下还没有 JD。
          <Link href="/app/targets" className="ml-1 underline" style={{ color: "var(--ink)" }}>
            去贴一份
          </Link>
        </p>
      ) : null}

      {(versions.length > 0 || jdsWithoutVersion.length > 0) && (
        <div
          className="mt-3 overflow-hidden rounded-card"
          style={{ background: "var(--card)", border: "1px solid var(--line)", maxWidth: 720 }}
        >
          {versions.map((v, i) => (
            <div
              key={v.id}
              className="px-4 py-3"
              style={{
                borderTop: i === 0 ? undefined : "1px solid var(--line-soft)",
                opacity: v.locked ? 0.72 : 1,
              }}
            >
              <div className="flex items-baseline gap-3">
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                  {v.locked && <span aria-label="已锁定">🔒 </span>}
                  {v.company} · {v.roleTitle}
                </p>
                {v.matchScore !== null && (
                  <span className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                    匹配 {Math.round(v.matchScore)}
                  </span>
                )}
                <span className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                  {v.deltaCount} 处调整
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-[12px]" style={{ color: "var(--mute)" }}>
                  {when(v.updatedAt)} ·{" "}
                  {v.submittedAt ? "已投递（已锁定）" : "草稿"}
                </span>
                {v.deltaRatio > 0.4 && (
                  <span className="text-[12px]" style={{ color: "var(--caution)" }}>
                    ⚠ 改动偏多 {Math.round(v.deltaRatio * 100)}%
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Link
                    href={`/app/resume/${v.id}`}
                    className="text-[12.5px] hover:underline"
                    style={{ color: "var(--ink)" }}
                  >
                    {v.locked ? "查看" : "继续编辑"}
                  </Link>
                  <button
                    type="button"
                    disabled={!canGenerate || jdsWithoutVersion.length === 0}
                    onClick={() => setPicker({ mode: "copy", from: v })}
                    className="text-[12.5px] hover:underline disabled:opacity-40"
                    style={{ color: "var(--mute)" }}
                  >
                    复制一份
                  </button>
                  <ExportGroup versionId={v.id} blockingCount={blockingCount} />
                  {!v.locked && (
                    <button
                      type="button"
                      onClick={() => setSubmitting(v)}
                      className="text-[12.5px] hover:underline"
                      style={{ color: "var(--mute)" }}
                    >
                      标记已投递
                    </button>
                  )}
                  {!v.locked && (
                    <button
                      type="button"
                      disabled={!canGenerate}
                      onClick={() => run(v.jdId)}
                      className="text-[12.5px] hover:underline disabled:opacity-40"
                      style={{ color: "var(--mute)" }}
                    >
                      {running === v.jdId ? "生成中…" : "重新生成"}
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))}

          {jdsWithoutVersion.map((j, i) => (
            <div
              key={j.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderTop:
                  i === 0 && versions.length === 0 ? undefined : "1px solid var(--line-soft)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">
                  {j.company} · {j.roleTitle}
                </p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--mute)" }}>
                  还没生成版本
                </p>
              </div>
              <Button size="sm" variant="secondary" disabled={!canGenerate} onClick={() => run(j.id)}>
                {running === j.id ? "生成中…" : "生成简历"}
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

      {submitting && (
        <SubmitDialog
          version={submitting}
          onClose={() => setSubmitting(null)}
          onDone={() => {
            setSubmitting(null);
            router.refresh();
          }}
        />
      )}

      {picker && (
        <JdPicker
          jds={jdsWithoutVersion}
          title={picker.mode === "copy" ? `以「${picker.from.company} · ${picker.from.roleTitle}」为起点` : "为哪份 JD 生成？"}
          hint={
            picker.mode === "copy"
              ? "它这一版用过的调整会作为起点再跑一次，适合投同类岗位。"
              : "新 JD 要先解析要求、评估匹配度，那条链路在求职方向页。"
          }
          onPick={(jdId) => run(jdId, picker.mode === "copy" ? picker.from.id : undefined)}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}

function when(iso: string | null): string {
  if (!iso) return "刚刚";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

function JdPicker({
  jds,
  title,
  hint,
  onPick,
  onClose,
}: {
  jds: Jd[];
  title: string;
  hint: string;
  onPick: (jdId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <h2 className="text-[15.5px] font-semibold">{title}</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--mute)" }}>
          {hint}
        </p>
        <div className="mt-3 space-y-1.5">
          {jds.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              这个方向下每份 JD 都已经有版本了。
            </p>
          ) : (
            jds.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => onPick(j.id)}
                className="block w-full rounded-btn px-3 py-2 text-left text-[13px] hover:bg-line-soft"
                style={{ border: "1px solid var(--line)" }}
              >
                {j.company} · {j.roleTitle}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Link href="/app/targets" className="text-[12.5px] hover:underline" style={{ color: "var(--ink)" }}>
            去贴一份新 JD →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[12.5px] hover:underline"
            style={{ color: "var(--mute)" }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function Outcome({ outcome, onClose }: { outcome: VersionOutcome; onClose: () => void }) {
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
          <Link
            href={`/app/resume/${outcome.versionId}`}
            className="ml-2 underline"
            style={{ color: "var(--ink)" }}
          >
            逐条看看
          </Link>
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
              <Link href="/app/targets?new=1">
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

/**
 * 导出入口。存在 blocking 问题时禁用，换成「⚠ 有 N 处问题必须先解决」。
 * 「去看看」落在体检页 —— 那里有全部十项检查的结果，以及每条的精确跳转。
 */
function ExportGroup({
  versionId,
  blockingCount,
}: {
  versionId: string;
  blockingCount: number;
}) {
  if (blockingCount > 0) {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
        ⚠ 有 {blockingCount} 处问题必须先解决
        <Link href="/app/health#blocking" className="underline" style={{ color: "var(--ink)" }}>
          去看看
        </Link>
      </span>
    );
  }
  return (
    <>
      <a
        href={`/app/resume/${versionId}/export`}
        className="text-[12.5px] hover:underline"
        style={{ color: "var(--mute)" }}
      >
        导出 MD
      </a>
      <a
        href={`/app/resume/${versionId}/print`}
        target="_blank"
        rel="noreferrer"
        className="text-[12.5px] hover:underline"
        style={{ color: "var(--mute)" }}
      >
        导出 PDF
      </a>
    </>
  );
}

function SubmitDialog({
  version,
  onClose,
  onDone,
}: {
  version: VersionSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="标记已投递"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <h2 className="text-[15.5px] font-semibold">
          标记「{version.company} · {version.roleTitle}」已投递？
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
          这一版会固化成一份副本，从此不再跟着基线变 —— 投出去的那份是什么样，
          面试前你还要照着复习。固化之后不能再编辑，但「复制一份」仍然可用。
        </p>
        {error && (
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await submitVersion(version.id);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                onDone();
              })
            }
          >
            {busy ? "固化中…" : "标记已投递"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] hover:underline"
            style={{ color: "var(--mute)" }}
          >
            再想想
          </button>
        </div>
      </div>
    </div>
  );
}
