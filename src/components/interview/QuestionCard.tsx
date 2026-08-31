"use client";

// =============================================================
// Proofly · 一道题
//
// 卡上最重要的不是题干，是应答骨架 —— 题目谁都能想到，
// 「被问到时怎么答、绝对不能说什么」才是有用的东西。
//
// 风险标记右侧必须显示 risk_reason。只挂一个「高风险」标签，
// 用户看到的是一个形容词，看不到该去做什么。
// =============================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ProofDot } from "@/components/library/ProofDot";
import { EVIDENCE_LABEL } from "@/lib/domain";
import {
  setPracticeNote,
  setPracticeStatus,
} from "@/app/(app)/interview/practice-actions";
import type { QuestionView } from "@/lib/queries/interview";
import type { PracticeStatus, ProbeType, QuestionDifficulty } from "@/types/database";

export const PROBE_LABEL: Record<ProbeType, string> = {
  effect: "效果追问",
  attribution: "归因追问",
  decision: "决策追问",
  boundary: "边界追问",
  role: "角色追问",
  progress: "进度追问",
};

export const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = {
  basic: "门槛题",
  standard: "常规",
  deep: "拉开差距",
};

const RISK_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: "var(--danger-soft)", fg: "var(--danger)", label: "⚠ 高风险" },
  medium: { bg: "var(--caution-soft)", fg: "var(--caution)", label: "中风险" },
  low: { bg: "var(--line-soft)", fg: "var(--slate)", label: "低风险" },
};

export function QuestionCard({ q }: { q: QuestionView }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [status, setStatus] = useState<PracticeStatus>(q.practiceStatus);
  const [note, setNote] = useState(q.practiceNote ?? "");
  const [savedNote, setSavedNote] = useState(q.practiceNote ?? "");
  // 已练熟的折成一行。折叠是本地状态：标完就收起，想再看点一下展开。
  const [open, setOpen] = useState(q.practiceStatus !== "practiced");
  const [busy, setBusy] = useState(false);

  function mark(next: PracticeStatus) {
    setBusy(true);
    start(async () => {
      const r = await setPracticeStatus(q.id, next);
      setBusy(false);
      if (!r.ok) return;
      setStatus(r.data);
      setOpen(r.data !== "practiced");
      if (r.data === "untouched") {
        setNote("");
        setSavedNote("");
      }
      router.refresh();
    });
  }

  function saveNote() {
    if (note.trim() === savedNote.trim()) return;
    setBusy(true);
    start(async () => {
      const r = await setPracticeNote(q.id, note);
      setBusy(false);
      if (r.ok) setSavedNote(r.data);
    });
  }

  const risk = RISK_STYLE[q.riskLevel];
  const struggling = status === "struggling";

  if (!open) {
    return (
      <article
        className="rounded-card border px-4 py-2.5"
        style={{ borderColor: "var(--line-soft)", background: "var(--card)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <span className="shrink-0 text-[12px]" style={{ color: "var(--proof)" }}>
            ✓ 已练熟
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: "var(--slate)" }}>
            {q.question}
          </span>
          <span className="shrink-0 text-[12px]" style={{ color: "var(--mute)" }}>
            展开
          </span>
        </button>
      </article>
    );
  }

  return (
    <article
      className="rounded-card border"
      style={{
        borderColor: struggling ? "var(--caution)" : "var(--line)",
        background: "var(--card)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div className="px-5 pt-4">
        <p className="text-[15.5px] font-medium leading-[1.55]">{q.question}</p>

        {/* 来源与风险 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
          {q.fromAtomId && (
            <Link
              href={`/library?atom=${q.fromAtomId}`}
              className="underline decoration-[var(--line)] underline-offset-2 hover:decoration-[var(--ink)]"
              style={{ color: "var(--slate)" }}
            >
              来自 {q.fromAtomTitle ?? "这条经历"}
            </Link>
          )}
          {q.fromAtomEvidence && (
            <span className="inline-flex items-center gap-1" style={{ color: "var(--mute)" }}>
              <ProofDot level={q.fromAtomEvidence} size={9} />
              {EVIDENCE_LABEL[q.fromAtomEvidence]}
            </span>
          )}
          {q.probeType && (
            <span style={{ color: "var(--mute)" }}>{PROBE_LABEL[q.probeType]}</span>
          )}
          {q.difficulty && (
            <span
              className="rounded-pill px-1.5 py-[1px] text-[11px]"
              style={{ background: "var(--line-soft)", color: "var(--slate)" }}
            >
              {DIFFICULTY_LABEL[q.difficulty]}
            </span>
          )}
          {q.riskLevel !== "low" && (
            <span
              className="rounded-pill px-2 py-[1px] text-[11.5px] font-medium"
              style={{ background: risk.bg, color: risk.fg }}
            >
              {risk.label}
            </span>
          )}
          {q.carriedOver && (
            <span
              className="rounded-pill px-2 py-[1px] text-[11.5px]"
              style={{ background: "var(--line-soft)", color: "var(--slate)" }}
            >
              上一版的题
            </span>
          )}
          {q.fromExistingProbe && (
            <span
              className="rounded-pill px-2 py-[1px] text-[11.5px]"
              style={{ background: "var(--proof-soft)", color: "var(--ink)" }}
            >
              来自你自己写的追问预案
            </span>
          )}
        </div>

        {/* 风险标记右侧必须给出具体原因，不能只给一个标签 */}
        {q.riskReason && (
          <p className="mt-1.5 text-[12.5px]" style={{ color: risk.fg }}>
            {q.riskReason}
          </p>
        )}

        {q.whyThisQuestion && (
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--mute)" }}>
            为什么会问：{q.whyThisQuestion}
          </p>
        )}

        {q.relatedAtomTitles.length > 0 && (
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--mute)" }}>
            可以拿来举例：{q.relatedAtomTitles.join("、")}
          </p>
        )}

        {/* 缺数据不是缺话术。这条提示指向具体一条指标。 */}
        {q.dataGapHint && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 rounded-btn px-3 py-2 text-[12.5px]"
            style={{ background: "var(--ai-soft)", color: "var(--ink)" }}
          >
            <span className="min-w-0 flex-1">💡 {q.dataGapHint}</span>
            {q.fromAtomId && (
              <Link
                href={
                  q.gapMetricId
                    ? `/library?atom=${q.fromAtomId}&metric=${q.gapMetricId}`
                    : `/library?atom=${q.fromAtomId}`
                }
                className="shrink-0 rounded-btn border px-2 py-[3px] text-[12px]"
                style={{ borderColor: "var(--line)", background: "var(--card)" }}
              >
                去补
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 应答骨架 */}
      {(q.answerOutline.length > 0 || q.dontDo) && (
        <div className="px-5 pb-1 pt-3">
          <div
            className="rounded-card border px-4 py-3"
            style={{ borderColor: "var(--line-soft)", background: "var(--bg)" }}
          >
            <p className="text-[12px] font-medium" style={{ color: "var(--mute)" }}>
              怎么答
            </p>
            <ul className="mt-2 space-y-1.5">
              {q.answerOutline.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.6]">
                  <span
                    className="mt-[2px] w-[4.5em] shrink-0 text-[12px]"
                    style={{ color: "var(--slate)" }}
                  >
                    {p.label}
                  </span>
                  <span className="min-w-0 flex-1">{p.content}</span>
                </li>
              ))}
            </ul>

            {q.dontDo && (
              <div
                className="mt-3 rounded-btn px-3 py-2"
                style={{ background: "var(--danger-soft)" }}
              >
                <p className="text-[12px] font-medium" style={{ color: "var(--danger)" }}>
                  ⛔ 别做的事
                </p>
                <p className="mt-1 text-[13px] leading-[1.6]">{q.dontDo}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 练习状态 */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-3">
        <Button
          size="sm"
          variant={status === "practiced" ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => mark("practiced")}
        >
          {status === "practiced" ? "已练熟" : "标记已练熟"}
        </Button>
        <Button
          size="sm"
          variant={struggling ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => mark("struggling")}
        >
          {struggling ? "标了答不好" : "这题答不好"}
        </Button>
        {status === "practiced" && (
          <Button size="sm" variant="text" onClick={() => setOpen(false)}>
            收起
          </Button>
        )}
      </div>

      {struggling && (
        <div className="px-5 pb-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={2}
            maxLength={500}
            placeholder="卡在哪？写一句，面试前十分钟就看这个。"
            className="w-full resize-y rounded-btn border px-3 py-2 text-[13px] outline-none focus:border-[var(--ink)]"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          />
        </div>
      )}
    </article>
  );
}
