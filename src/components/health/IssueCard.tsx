"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ignore, restore } from "@/app/(app)/health/actions";
import type { ReportIssue } from "@/lib/health/report";

const TONE = {
  blocking: { label: "阻断", fg: "var(--danger)", bg: "var(--danger-soft)" },
  warning: { label: "警告", fg: "var(--caution)", bg: "var(--caution-soft)" },
  info: { label: "提示", fg: "var(--slate)", bg: "var(--bg)" },
} as const;

export function IssueCard({ issue }: { issue: ReportIssue }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const tone = TONE[issue.level];

  return (
    <div
      className="rounded-card px-5 py-4"
      style={{
        background: "var(--card)",
        border: `1px solid ${issue.level === "blocking" ? "var(--danger)" : "var(--line)"}`,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="font-display shrink-0 rounded-pill px-2 py-[2px] text-[11px] font-medium"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {tone.label}
        </span>
        <p className="text-[13.5px] font-medium">{issue.title}</p>
      </div>

      <p
        className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed"
        style={{ color: "var(--slate)" }}
      >
        {issue.detail}
      </p>

      {issue.ignored && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--mute)" }}>
          已忽略{issue.ignoreReason ? ` —— ${issue.ignoreReason}` : ""}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
        <Link
          href={issue.resolveLink}
          className="rounded-btn px-3 py-1.5"
          style={{ background: "var(--ink)", color: "var(--card)" }}
        >
          去解决
        </Link>

        {/* 阻断级不提供忽略入口。不接受任何变通。 */}
        {issue.level !== "blocking" &&
          (issue.ignored ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await restore(issue.fingerprint)))}
              className="underline disabled:opacity-50"
              style={{ color: "var(--slate)" }}
            >
              恢复
            </button>
          ) : asking ? (
            <span className="flex w-full flex-wrap items-center gap-2">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="为什么忽略它？三个月后你会忘（可不填）"
                aria-label="忽略理由"
                className="min-w-0 flex-1 rounded-btn px-2.5 py-1.5 text-[12.5px]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await ignore(issue.fingerprint, issue.code, reason);
                    setAsking(false);
                  })
                }
                className="rounded-btn px-3 py-1.5 disabled:opacity-50"
                style={{ background: "var(--card)", border: "1px solid var(--line)" }}
              >
                确认忽略
              </button>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="underline"
                style={{ color: "var(--mute)" }}
              >
                取消
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="underline"
              style={{ color: "var(--mute)" }}
            >
              忽略
            </button>
          ))}
      </div>
    </div>
  );
}
