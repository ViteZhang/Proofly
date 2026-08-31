"use client";

// =============================================================
// Proofly · 面试题包（S9）
//
// 排序是固定的：高风险置顶，其次「答不好 > 未练 > 已练熟」，最后按
// 生成顺序。高风险不参与筛选之外的任何折叠 —— 它们是这一步存在的理由。
// =============================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { QuestionCard } from "./QuestionCard";
import { generateKit, type KitOutcome } from "@/app/(app)/interview/actions";
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
}: {
  kit: KitView | null;
  versions: VersionOption[];
  selected: VersionOption | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<KitOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InterviewKind>("project_probe");
  const [risk, setRisk] = useState<RiskLevel | "all">("all");
  const [practice, setPractice] = useState<PracticeStatus | "all">("all");
  const [atomId, setAtomId] = useState<string>("all");
  const [picking, setPicking] = useState(false);

  function run() {
    if (!selected) return;
    setError(null);
    setOutcome(null);
    setRunning(true);
    start(async () => {
      const r = await generateKit(selected.id);
      setRunning(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOutcome(r.data);
      router.refresh();
    });
  }

  if (versions.length === 0) {
    return (
      <Empty>
        <p className="text-[14px]">还没有题目。先生成一份投递版本，我按它出题。</p>
        <Link href="/resume" className="mt-3 inline-block">
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
          <Button size="sm" variant="secondary" disabled={running} onClick={run}>
            {running ? "正在出题，十来分钟…" : "重新出题"}
          </Button>
        )}
        {kit && (
          <>
            <Link href={`/interview/${kit.id}/print`}>
              <Button size="sm" variant="secondary">
                面试小抄
              </Button>
            </Link>
            <a href={`/interview/${kit.id}/export`}>
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
                href={`/interview?v=${v.id}`}
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

      {outcome && <Outcome outcome={outcome} />}

      {!kit ? (
        <Empty>
          <p className="text-[14px]">
            这份投递版本还没出过题。我按它实际用到的经历出题 —— 面试官只会问简历上写了的。
          </p>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--mute)" }}>
            两次大生成，一次十来分钟。别关页面。
          </p>
          <Button size="sm" className="mt-3" disabled={running || !selected} onClick={run}>
            {running ? "正在出题，十来分钟…" : "出一套题"}
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
function Outcome({ outcome }: { outcome: KitOutcome }) {
  const [open, setOpen] = useState(false);
  const noise = outcome.warnings.length + outcome.rejected.length;
  return (
    <div
      className="mt-3 rounded-card border px-4 py-3 text-[13px]"
      style={{ borderColor: "var(--line-soft)", background: "var(--card)" }}
    >
      <p>
        出了 {outcome.total} 道题：项目深挖 {outcome.probes} · 案例题 {outcome.cases}。
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
          {outcome.rejected.map((r, i) => (
            <p key={`r-${i}`}>
              丢掉「{r.question}」：{r.problems.join("；")}
            </p>
          ))}
          {outcome.warnings.map((w, i) => (
            <p key={`w-${i}`}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
