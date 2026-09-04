"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBillingFeedback } from "@/components/billing/BillingFeedback";
import { CreditCost } from "@/components/billing/CreditTag";
import { ACTION_PRICES } from "@/config/plan";
import { Button } from "@/components/ui/Button";
import { ProofDot } from "@/components/library/ProofDot";
import { matchAndScore, recallAtoms } from "@/app/app/targets/assess-actions";
import { parseJd } from "@/app/app/targets/jd-actions";
import { countOpenGaps, generatePlan } from "@/app/app/actions/plan-actions";
import { KIND_LABEL } from "@/lib/jd/labels";
import { GAP_COPY, gapExplain, OTHER_COPY } from "@/lib/scoring/gap-copy";
import { isStrong } from "@/lib/scoring";
import type { AssessmentView } from "@/lib/queries/assessments";
import type { RequirementResult } from "@/lib/scoring/types";

type Step = 0 | 1 | 2 | 3; // 0 = 没在跑
const STEP_LABEL = ["解析要求", "检索经历", "计算匹配"];

// S6 区块三。分数由代码算，这里只负责把算好的数字摆出来。
export type TaskLink = { taskId: string; title: string };

export function AssessPanel({
  jdId,
  hasRequirements,
  assessment,
  taskLinks = {},
}: {
  jdId: string;
  hasRequirements: boolean;
  assessment: AssessmentView | null;
  /** requirementIndex → 已经生成的行动。Step 5 之后这里就不再是占位了。 */
  taskLinks?: Record<number, TaskLink>;
}) {
  const router = useRouter();
  const feedback = useBillingFeedback();
  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState<string | null>(null);
  const [running, start] = useTransition();
  // 评估完主动问一句要不要生成行动清单 —— 不自动静默生成，
  // 清单是要人去执行的东西，得让人知道它什么时候变了。
  const [openGaps, setOpenGaps] = useState<number | null>(null);

  // 三步分开调，进度才能真的一步步走完，而不是转一个看不出进展的圈。
  function run() {
    setError(null);
    start(async () => {
      setStep(1);
      if (!hasRequirements) {
        const p = await parseJd(jdId);
        if (!p.ok) {
          setError(p.error);
          setStep(0);
          return;
        }
      }

      setStep(2);
      const recall = await recallAtoms(jdId);
      if (!recall.ok) {
        setError(recall.error);
        setStep(0);
        return;
      }

      setStep(3);
      const scored = await matchAndScore(jdId, recall.data.atomIds);
      if (!scored.ok) {
        setError(scored.error);
        setStep(0);
        return;
      }

      setStep(0);
      const c = await countOpenGaps();
      setOpenGaps(c.ok ? c.data.count : null);
      router.refresh();
    });
  }

  return (
    <div id="assess-panel" className="mt-6">
      {feedback.node}
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[16px] font-semibold">匹配评估</h2>
        <Button variant="secondary" size="sm" onClick={run} disabled={running}>
          {running ? "评估中…" : assessment ? "重新评估" : "开始评估"}
          {!running && <CreditCost credits={ACTION_PRICES.target_assess} />}
        </Button>
      </div>

      {running && <Progress step={step} />}

      {error && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {!assessment && !running && (
        <p className="mt-3 text-[13.5px]" style={{ color: "var(--mute)" }}>
          还没评估过。跑一次就知道差在哪、每一分丢在什么地方。
        </p>
      )}

      {openGaps !== null && openGaps > 0 && (
        <PlanPrompt count={openGaps} onDone={() => setOpenGaps(0)} />
      )}

      {assessment && (
        <>
          <div className="mt-3 flex flex-wrap items-stretch gap-3">
            <ScoreCard a={assessment} />
            <LossCard a={assessment} />
          </div>
          <Comparison results={assessment.results} taskLinks={taskLinks} />
        </>
      )}
    </div>
  );
}

/** 5.2 触发时机之一：评估完成后问一次。不点就什么都不发生。 */
function PlanPrompt({ count, onDone }: { count: number; onDone: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    start(async () => {
      const r = await generatePlan();
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      onDone();
      router.push("/app/actions");
    });
  }

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-card px-4 py-3"
      style={{ background: "var(--ai-soft)", border: "1px solid var(--line)" }}
    >
      <span className="text-[13px]">发现 {count} 处缺口，要生成行动清单吗？</span>
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? "生成中…" : "生成行动清单"}
        {!busy && <CreditCost credits={ACTION_PRICES.task_plan} />}
      </Button>
      <Link href="/app/actions" className="text-[12.5px] hover:underline" style={{ color: "var(--slate)" }}>
        先去看看清单
      </Link>
      {msg && (
        <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-2">
      {STEP_LABEL.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px]"
              style={{
                background: done || active ? "var(--ai-soft)" : "var(--line-soft)",
                color: done || active ? "var(--ai)" : "var(--mute)",
              }}
            >
              <span aria-hidden>{done ? "✓" : active ? "…" : "○"}</span>
              {label}
            </span>
            {i < STEP_LABEL.length - 1 && (
              <span aria-hidden style={{ color: "var(--ghost)" }}>
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ScoreCard({ a }: { a: AssessmentView }) {
  const gaps = a.results.filter((r) => r.gapType !== null).length;
  const strong = a.results.filter(isStrong).length;

  return (
    <div
      className="min-w-[220px] flex-1 rounded-card px-5 py-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[40px] font-semibold leading-none tracking-tight">
          {Math.round(a.matchScore)}
        </span>
        <span className="text-[13px]" style={{ color: "var(--slate)" }}>
          匹配度
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
        {a.results.length} 条要求里，{strong} 条讲得出充分证据，{gaps} 条有缺口。
      </p>
      {a.runCount > 1 && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--mute)" }}>
          这是第 {a.runCount} 次评估，前几次都留着。
        </p>
      )}
    </div>
  );
}

function LossCard({ a }: { a: AssessmentView }) {
  const total = a.buckets.reduce((s, b) => s + b.loss, 0);

  return (
    <div
      className="min-w-[300px] flex-[1.4] rounded-card px-5 py-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-medium">这 {Math.round(total)} 分丢在哪</h3>
        <span className="text-[11.5px]" style={{ color: "var(--mute)" }}>
          按补法分类
        </span>
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {a.buckets.length === 0 && (
          <li className="text-[13px]" style={{ color: "var(--proof)" }}>
            一分没丢。
          </li>
        )}
        {a.buckets.map((b) => {
          const copy = b.gapType ? GAP_COPY[b.gapType] : OTHER_COPY;
          return (
            <li key={b.gapType ?? "other"} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-pill"
                style={{ background: copy.fg }}
              />
              <span className="text-[13px]">{copy.label}</span>
              {copy.remedy && (
                <span className="text-[12px]" style={{ color: "var(--mute)" }}>
                  {copy.remedy} · {b.count} 条
                </span>
              )}
              {!copy.remedy && (
                <span className="text-[12px]" style={{ color: "var(--mute)" }}>
                  {b.count} 条
                </span>
              )}
              <span
                className="ml-auto font-display text-[13.5px] font-semibold"
                style={{ color: copy.fg }}
              >
                −{b.loss.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- 逐条对照 ----

function Comparison({
  results,
  taskLinks,
}: {
  results: RequirementResult[];
  taskLinks: Record<number, TaskLink>;
}) {
  const [showAll, setShowAll] = useState(true);
  const shown = showAll ? results : results.filter((r) => r.gapType !== null);

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-semibold">逐条对照</h3>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[12.5px] hover:underline"
          style={{ color: "var(--slate)" }}
        >
          {showAll ? "只看有缺口的" : "看全部"}
        </button>
      </div>

      <ul className="mt-2 space-y-2">
        {shown.map((r) => (
          <RequirementCard
            key={r.requirementIndex}
            r={r}
            link={taskLinks[r.requirementIndex] ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

function RequirementCard({ r, link }: { r: RequirementResult; link: TaskLink | null }) {
  const strong = isStrong(r);
  const copy = r.gapType ? GAP_COPY[r.gapType] : null;

  return (
    <li
      className="rounded-card px-4 py-3"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 shrink-0 rounded-pill px-1.5 py-px text-[11px]"
          style={{ background: "var(--line-soft)", color: "var(--slate)", width: 34, textAlign: "center" }}
        >
          {KIND_LABEL[r.kind]}
        </span>
        <span className="min-w-0 flex-1 text-[13.5px]">{r.text}</span>

        <span className="shrink-0 text-right">
          {strong ? (
            <Tag fg="var(--proof)" bg="var(--proof-soft)">
              充分
            </Tag>
          ) : copy ? (
            <Tag fg={copy.fg} bg={copy.bg}>
              {copy.label}
            </Tag>
          ) : (
            <Tag fg="var(--mute)" bg="var(--line-soft)">
              部分命中
            </Tag>
          )}
        </span>
      </div>

      <div className="mt-1.5 flex items-start gap-2 pl-[44px]">
        {r.bestEvidence ? (
          <ProofDot level={r.bestEvidence} className="mt-[3px]" />
        ) : (
          <span aria-hidden className="mt-[1px] text-[11px]" style={{ color: "var(--ghost)" }}>
            ◌
          </span>
        )}
        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
          {r.gapType
            ? gapExplain(r.gapType, r)
            : r.matchedTitles.length > 0
              ? `命中${r.matchedTitles.map((t) => `「${t}」`).join("")}。`
              : "没有命中任何经历。"}
          {r.reason && (
            <span style={{ color: "var(--mute)" }}> {r.reason}</span>
          )}
        </p>
        <span className="shrink-0 text-[12px]" style={{ color: r.scoreLoss > 0 ? "var(--slate)" : "var(--proof)" }}>
          {r.scoreLoss > 0 ? `−${r.scoreLoss.toFixed(1)}` : "满分"}
        </span>
      </div>

      {/* structural 也有对应行动——「改叙事」就是 rewrite_narrative，
          补不上不等于不用管。 */}
      {r.gapType && (
        <p className="mt-1 pl-[44px] text-[12px]">
          {link ? (
            <Link
              href={`/app/actions?task=${link.taskId}`}
              className="hover:underline"
              style={{ color: "var(--ai)" }}
            >
              → 已生成行动「{link.title}」
            </Link>
          ) : (
            <span style={{ color: "var(--ghost)" }}>还没有对应行动，去行动清单生成一次</span>
          )}
        </p>
      )}
    </li>
  );
}

function Tag({
  fg,
  bg,
  children,
}: {
  fg: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-pill px-2 py-0.5 text-[11.5px]"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}
