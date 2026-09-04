"use client";

// =============================================================
// Proofly · 面试题包（S9）
//
// 排序是固定的：高风险置顶，其次「答不好 > 未练 > 已练熟」，最后按
// 生成顺序。高风险不参与筛选之外的任何折叠 —— 它们是这一步存在的理由。
// =============================================================

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { QuestionCard } from "./QuestionCard";
import { KitJobPanel } from "./KitJobPanel";
import { quoteAction } from "@/app/app/billing-actions";
import { useBillingFeedback } from "@/components/billing/BillingFeedback";
import { ConfirmCost } from "@/components/billing/ConfirmCost";
import { CreditCost } from "@/components/billing/CreditTag";
import { ACTION_PRICES } from "@/config/plan";
import { startKitJob, type KitJobProgress } from "@/app/app/interview/job-actions";
import { overviewOf } from "@/lib/interview/view";
import type { KitView, VersionOption } from "@/lib/queries/interview";
import type { InterviewKind, PracticeStatus, RiskLevel } from "@/types/database";

const TABS: { kind: InterviewKind; label: string }[] = [
  { kind: "project_probe", label: "项目深挖" },
  { kind: "product_case", label: "产品设计" },
  { kind: "ai_tech", label: "AI 技术" },
  { kind: "data_case", label: "数据分析" },
];

const RISK_FILTERS: { value: RiskLevel | "all"; label: string }[] = [
  { value: "all", label: "全部风险" },
  { value: "high", label: "高风险" },
  { value: "medium", label: "中风险" },
  { value: "low", label: "低风险" },
];

const STATUS_FILTERS: { value: PracticeStatus | "all"; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "untouched", label: "还没练" },
  { value: "struggling", label: "答不好" },
  { value: "practiced", label: "已练熟" },
];

export function InterviewBoard({
  kit,
  versions,
  selected,
  job,
}: {
  kit: KitView | null;
  versions: VersionOption[];
  selected: VersionOption | null;
  /** 服务端渲染时读到的作业状态。有它页面一打开就知道该不该轮询。 */
  job: KitJobProgress | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [running, setRunning] = useState(false);
  // 挂着进度面板的作业 id。为 null 时面板不显示，也不轮询。
  // 失败的作业也要挂着 —— 那句「案例题这次没出上」和「重跑一次」按钮，
  // 是用户唯一能据以决定下一步的东西，被一句「出了 33 道题」盖掉就等于没报错。
  const [jobKitId, setJobKitId] = useState<string | null>(
    job && (!job.settled || job.status === "failed") ? job.kitId : null,
  );
  // 面板挂着的这个作业是不是已经失败了。不能读 job.status —— 那是服务端
  // 渲染那一刻的值，作业是在轮询里跑完的，它不会跟着变。
  const [jobFailed, setJobFailed] = useState(job?.status === "failed");
  const [outcome, setOutcome] = useState<KitJobProgress | null>(
    job && job.settled && (job.warnings.length > 0 || job.rejected.length > 0) ? job : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InterviewKind>("project_probe");
  const [risk, setRisk] = useState<RiskLevel | "all">("all");
  const [practice, setPractice] = useState<PracticeStatus | "all">("all");
  const [atomId, setAtomId] = useState<string>("all");
  const [picking, setPicking] = useState(false);

  // 起作业只是插一行 + after()，秒回。真正的等待交给 KitJobPanel 轮询，
  // 页面关掉作业照样在后台跑完。
  const feedback = useBillingFeedback();
  const [asking, setAsking] = useState(false);
  const [balance, setBalance] = useState(0);

  // 二次确认要显示「余额 156 → 131」，所以进页面先把余额读回来。
  useEffect(() => {
    let alive = true;
    void quoteAction("interview_kit").then((q) => {
      if (alive) setBalance(q.balance);
    });
    return () => {
      alive = false;
    };
  }, [jobKitId]);

  function run() {
    if (!selected) return;
    setError(null);
    setOutcome(null);
    setJobFailed(false);
    setRunning(true);
    start(async () => {
      const r = await startKitJob(selected.id);
      setRunning(false);
      if (!r.ok) {
        // 余额不足走弹窗，说清差多少；其余错误留在原地。
        feedback.report("生成面试题包", {
          ok: false,
          error: r.error,
          ...(r.error.includes("差") && r.error.includes("分")
            ? { code: "INSUFFICIENT" as const }
            : {}),
        });
        setError(r.error);
        return;
      }
      setJobKitId(r.data);
    });
  }

  // 深挖题落库时会来一次，作业停下来时再来一次。两次都要刷新页面 ——
  // 前者是为了让刚出的十几道题立刻能看，后者是为了把案例题也带出来。
  function onProgress(p: KitJobProgress) {
    if (p.settled) {
      // 成功就把面板收掉，失败留着 —— 错误原因和「重跑一次」得看得见。
      setJobFailed(p.status === "failed");
      if (p.status !== "failed") setJobKitId(null);
      if (p.warnings.length > 0 || p.rejected.length > 0) setOutcome(p);
    }
    router.refresh();
  }

  if (versions.length === 0) {
    return (
      <Empty>
        <p className="text-[14px]">还没有题目。先生成一份投递版本，我按它出题。</p>
        <Link href="/app/resume" className="mt-3 inline-block">
          <Button size="sm">去生成投递版本</Button>
        </Link>
      </Empty>
    );
  }

  const questions = kit?.questions ?? [];
  const overview = overviewOf(questions);

  const sources = [
    ...new Map(
      questions
        .filter((q) => q.fromAtomId)
        .map((q) => [q.fromAtomId!, q.fromAtomTitle ?? "未命名经历"]),
    ),
  ];

  const visible = questions.filter(
    (q) =>
      q.kind === tab &&
      (risk === "all" || q.riskLevel === risk) &&
      (practice === "all" || q.practiceStatus === practice) &&
      (atomId === "all" || q.fromAtomId === atomId),
  );

  return (
    <>
      {feedback.node}
      {asking && (
        <ConfirmCost
          title="生成面试题包"
          credits={ACTION_PRICES.interview_kit}
          balance={balance}
          note="大概需要 5–10 分钟，可以先去做别的，好了我会提示你。"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            run();
          }}
        />
      )}

      {/* 版本切换 */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <span className="text-[13.5px]" style={{ color: "var(--slate)" }}>
          {selected ? `${selected.company} · ${selected.roleTitle}` : "选一份投递版本"}
        </span>
        {selected && (
          <span className="text-[12.5px]" style={{ color: "var(--mute)" }}>
            {selected.targetName}
            {selected.submittedAt ? " · 已投递" : " · 草稿"}
          </span>
        )}
        <Button size="sm" variant="text" onClick={() => setPicking((p) => !p)}>
          {picking ? "收起" : "换一份 ▾"}
        </Button>
        {kit && (
          <Button
            size="sm"
            variant="secondary"
            disabled={running || (jobKitId !== null && !jobFailed)}
            onClick={() => setAsking(true)}
          >
            {jobKitId && !jobFailed ? "正在出题…" : "重新出题"}
            {!jobKitId && <CreditCost credits={ACTION_PRICES.interview_kit} />}
          </Button>
        )}
        {kit && (
          <>
            <Link href={`/app/interview/${kit.id}/print`}>
              <Button size="sm" variant="secondary">
                面试小抄
              </Button>
            </Link>
            <a href={`/app/interview/${kit.id}/export`}>
              <Button size="sm" variant="text">
                导出 MD
              </Button>
            </a>
          </>
        )}
      </div>

      {picking && (
        <ul className="mt-2 space-y-1" style={{ maxWidth: 640 }}>
          {versions.map((v) => (
            <li key={v.id}>
              <Link
                href={`/app/interview?v=${v.id}`}
                onClick={() => setPicking(false)}
                className="flex items-center gap-2.5 rounded-btn border px-3 py-2 text-[13px] hover:bg-[var(--line-soft)]"
                style={{
                  borderColor: v.id === selected?.id ? "var(--ink)" : "var(--line-soft)",
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {v.company} · {v.roleTitle}
                </span>
                <span className="shrink-0 text-[12px]" style={{ color: "var(--mute)" }}>
                  {v.questionCount > 0 ? `${v.questionCount} 题` : "还没出题"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {jobKitId && <KitJobPanel kitId={jobKitId} onSettled={onProgress} />}

      {/* 作业跑完（成功或失败）才有 outcome，所以跟进度面板不会同时是
          「正在跑」的状态；失败时两个一起显示，一个说为什么停，一个说丢了什么。 */}
      {outcome && <Outcome outcome={outcome} />}

      {/* 作业刚起、题还没落库时，题包行已经存在但里面是空的 ——
          那还是空状态，不该显示四个 0 的标签页。 */}
      {!kit || (questions.length === 0 && !jobKitId) ? (
        <Empty>
          <p className="text-[14px]">
            这份投递版本还没出过题。我按它实际用到的经历出题 —— 面试官只会问简历上写了的。
          </p>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--mute)" }}>
            两次大生成，一次十来分钟。作业跑在后台，可以关掉页面。
          </p>
          <Button
            size="sm"
            className="mt-3"
            disabled={running || (jobKitId !== null && !jobFailed) || !selected}
            onClick={() => setAsking(true)}
          >
            {jobKitId && !jobFailed ? "正在出题…" : "出一套题"}
            {!jobKitId && <CreditCost credits={ACTION_PRICES.interview_kit} />}
          </Button>
        </Empty>
      ) : (
        <>
          {/* 概览 */}
          <div
            className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-card border px-4 py-2.5 text-[13px]"
            style={{ borderColor: "var(--line-soft)", background: "var(--card)" }}
          >
            <Stat label="共" value={`${overview.total} 题`} />
            <Stat
              label="高风险"
              value={`${overview.highRisk} 题`}
              tone={overview.highRisk > 0 ? "var(--danger)" : undefined}
            />
            <Stat label="已练熟" value={`${overview.practiced} 题`} />
            <Stat
              label="答不好"
              value={`${overview.struggling} 题`}
              tone={overview.struggling > 0 ? "var(--caution)" : undefined}
            />
          </div>

          {/* 标签页 */}
          <div
            className="mt-4 flex flex-wrap gap-1 border-b"
            style={{ borderColor: "var(--line-soft)" }}
          >
            {TABS.map((t) => {
              const n = questions.filter((q) => q.kind === t.kind).length;
              const high = questions.filter(
                (q) => q.kind === t.kind && q.riskLevel === "high",
              ).length;
              return (
                <button
                  key={t.kind}
                  type="button"
                  onClick={() => setTab(t.kind)}
                  className="-mb-px border-b-2 px-3 py-2 text-[13.5px] transition-colors"
                  style={{
                    borderColor: tab === t.kind ? "var(--ink)" : "transparent",
                    color: tab === t.kind ? "var(--ink)" : "var(--slate)",
                    fontWeight: tab === t.kind ? 500 : 400,
                  }}
                >
                  {t.label} {n}
                  {high > 0 && <span style={{ color: "var(--danger)" }}> ·{high}</span>}
                </button>
              );
            })}
          </div>

          {/* 筛选 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={risk} onChange={(v) => setRisk(v as RiskLevel | "all")} options={RISK_FILTERS} />
            <Select
              value={practice}
              onChange={(v) => setPractice(v as PracticeStatus | "all")}
              options={STATUS_FILTERS}
            />
            {sources.length > 0 && (
              <Select
                value={atomId}
                onChange={setAtomId}
                options={[
                  { value: "all", label: "全部经历" },
                  ...sources.map(([id, title]) => ({ value: id, label: title })),
                ]}
              />
            )}
          </div>

          <div className="mt-4 space-y-3" style={{ maxWidth: 760 }}>
            {visible.length === 0 ? (
              <p className="py-6 text-[13.5px]" style={{ color: "var(--mute)" }}>
                这一类下没有符合筛选条件的题。
              </p>
            ) : (
              visible.map((q) => <QuestionCard key={q.id} q={q} />)
            )}
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span>
      <span style={{ color: "var(--mute)" }}>{label} </span>
      <span style={{ color: tone ?? "var(--ink)", fontWeight: 500 }}>{value}</span>
    </span>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-[30px] rounded-btn border px-2 text-[13px] outline-none focus:border-[var(--ink)]"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-6 rounded-card border px-5 py-8 text-center"
      style={{ borderColor: "var(--line-soft)", background: "var(--card)", maxWidth: 640 }}
    >
      {children}
    </div>
  );
}

/** 丢掉的题必须说出来 —— 不说，用户以为模型只出了这么多。 */
function Outcome({ outcome }: { outcome: KitJobProgress }) {
  const [open, setOpen] = useState(false);
  const noise = outcome.warnings.length + outcome.rejected.length;
  return (
    <div
      className="mt-3 rounded-card border px-4 py-3 text-[13px]"
      style={{ borderColor: "var(--line-soft)", background: "var(--card)" }}
    >
      <p>
        出了 {outcome.probeCount + outcome.caseCount} 道题：项目深挖 {outcome.probeCount} · 案例题{" "}
        {outcome.caseCount}。
      </p>
      {noise > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[12.5px] underline underline-offset-2"
          style={{ color: "var(--slate)" }}
        >
          {open ? "收起" : `有 ${noise} 处需要你知道`}
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-1.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
          {outcome.rejected.map((r: { question: string; problems: string[] }, i: number) => (
            <p key={`r-${i}`}>
              丢掉「{r.question}」：{r.problems.join("；")}
            </p>
          ))}
          {outcome.warnings.map((w: string, i: number) => (
            <p key={`w-${i}`}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
