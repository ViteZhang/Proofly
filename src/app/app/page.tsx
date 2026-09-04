import Link from "next/link";

import { SignupGuide } from "@/components/billing/SignupGuide";
import { ensureOnboarded } from "@/lib/billing/onboard";
import { getOverviewStats, getProofSummary } from "@/lib/queries/atoms";
import { getRiskCards } from "@/lib/queries/risk";
import { getTaskBoard } from "@/lib/queries/tasks";
import { listRecentVersions } from "@/lib/queries/resume";
import { healthSummary } from "@/lib/queries/health";
import { sortTasks } from "@/lib/planning/sort";
import { ACTION_COPY } from "@/lib/planning/labels";
import { EmptyLibrary } from "@/components/library/EmptyLibrary";
import { ProofDot } from "@/components/library/ProofDot";
import { ProofRing } from "@/components/home/ProofRing";
import { EVIDENCE_LABEL, EVIDENCE_ORDER } from "@/lib/domain";
import type { EvidenceLevel } from "@/types/database";

// 证明条的四档配色，跟标记同一个色相往下降，absent 落到灰。
const BAR: Record<EvidenceLevel, string> = {
  measured: "var(--proof)",
  estimated: "var(--proof-mid)",
  designed_only: "var(--proof-soft)",
  absent: "var(--ghost)",
};

export default async function HomePage() {
  // 兜住两种人：注册那天护栏触顶没领到的（今天补发），
  // 以及 Magic Link 落地那一步没走完的。幂等，老用户是空操作。
  const onboard = await ensureOnboarded();

  const [summary, stats, risks, board, recentVersions, health] = await Promise.all([
    getProofSummary(),
    getOverviewStats(),
    getRiskCards(),
    getTaskBoard(),
    listRecentVersions(),
    healthSummary(),
  ]);

  // S2 区块三「今天做什么」：priority 最高的三条。
  // 排序跟行动清单用同一个 sortTasks，两处不一致的话首页就在骗人。
  const today = sortTasks(
    board.open.map((t) => ({ ...t, actionType: t.actionType as string })),
  )
    .slice(0, 3)
    .map((t) => board.open.find((x) => x.id === t.id)!);

  // 一条经历都没有的时候，摆一个 0% 的环没有任何意义
  if (summary.total === 0) return <EmptyLibrary />;

  return (
    <div className="max-w-[860px]">
      <SignupGuide state={onboard} />
      <h1 className="font-display text-[26px] font-semibold tracking-tight">首页</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        证明度总览 · 当前该做什么
      </p>

      {/* Hero：环 + 证明条 + 图例 */}
      <section
        className="mt-5 flex items-center gap-7 rounded-card px-7 py-6"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <ProofRing score={summary.score} />

        <div className="min-w-0 flex-1">
          <p className="text-[14px]">
            {summary.total} 条经历，
            {summary.counts.measured > 0 ? (
              <>其中 {summary.counts.measured} 条有实测数据。</>
            ) : (
              <>还没有一条拿得出实测数据。</>
            )}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--slate)" }}>
            {stats.pendingMetrics > 0 ? (
              <>
                还有 {stats.pendingMetrics} 项数据没补，
                <Link href="/app/library" className="underline underline-offset-2">
                  补上就往上走
                </Link>
                。
              </>
            ) : (
              <>给结果补一条实测指标，是最快的一档。</>
            )}
          </p>

          {/* 证明条 */}
          <div className="mt-4 flex h-2 overflow-hidden rounded-pill" style={{ background: "var(--line-soft)" }}>
            {EVIDENCE_ORDER.map((level) =>
              summary.counts[level] > 0 ? (
                <div
                  key={level}
                  style={{ width: `${summary.ratios[level] * 100}%`, background: BAR[level] }}
                  title={`${EVIDENCE_LABEL[level]} ${summary.counts[level]}`}
                />
              ) : null,
            )}
          </div>

          {/* 图例 */}
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
            {EVIDENCE_ORDER.map((level) => (
              <span key={level} className="inline-flex items-center gap-1.5 text-[12.5px]">
                <ProofDot level={level} size={9} />
                <span style={{ color: "var(--slate)" }}>{EVIDENCE_LABEL[level]}</span>
                <span className="font-display font-medium">{summary.counts[level]}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 体检卡。数字与体检页同一个口径 —— 两处对不上，用户就不知道该信哪个。 */}
      <Link
        href="/app/health"
        className="mt-4 block rounded-card px-5 py-4 transition-opacity hover:opacity-90"
        style={
          health.blockingCount > 0
            ? { background: "var(--danger-soft)", border: "1px solid var(--danger)" }
            : { background: "var(--card)", border: "1px solid var(--line)" }
        }
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className="text-[14px] font-semibold"
            style={{ color: health.blockingCount > 0 ? "var(--danger)" : "var(--ink)" }}
          >
            体检 ·{" "}
            {health.blockingCount > 0
              ? `${health.blockingCount} 处待解决`
              : health.scanned
                ? "一切正常"
                : "还没体检过"}
          </span>
          {health.minorCount > 0 && (
            <span className="shrink-0 text-[12.5px]" style={{ color: "var(--mute)" }}>
              另有 {health.minorCount} 处小问题
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
          {health.blockingCount > 0
            ? "在解决之前，简历生成和导出都会被拦住。"
            : health.scanned
              ? "口径一致、措辞有据、跨方向说法对得上。可以放心投。"
              : "进去扫一次，看看简历、经历、源材料之间有没有对不上的地方。"}
        </p>
      </Link>

      {/* S2 区块二 · 风险提示。做过一堆事但都拿不出数据，
          比「没做过」更容易在面试里被问穿，而它平时看不出来。 */}
      {risks.map((risk) => (
        <Link
          key={risk.targetId}
          href={`/app/targets?target=${risk.targetId}`}
          className="mt-4 block rounded-card px-5 py-4 transition-opacity hover:opacity-90"
          style={{ background: "var(--caution-soft)", border: "1px solid var(--caution)" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold" style={{ color: "var(--caution)" }}>
              「{risk.targetName}」方向：做过，但拿不出数据
            </span>
            <span className="shrink-0 font-display text-[13px] font-semibold" style={{ color: "var(--caution)" }}>
              −{risk.weakLoss.toFixed(1)} 分
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
            在「{risk.jdLabel}」上，命中要求的经历里有 {risk.weakLoss.toFixed(1)} 分丢在「还没有实测数据」上。
            {risk.atomTitles.length > 0 && (
              <> 主要是{risk.atomTitles.slice(0, 3).map((t) => `「${t}」`).join("")}。</>
            )}
            {" "}补一条实测数据，这些分会自己回来。
          </p>
        </Link>
      ))}

      {/* S2 区块三 · 今天做什么。紧凑，不重复行动清单的信息量，
          只回答一个问题：现在坐下来该动哪一条。 */}
      {today.length > 0 && (
        <section
          className="mt-4 rounded-card px-5 py-4"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold">今天做什么</h2>
            <Link href="/app/actions" className="text-[12.5px] hover:underline" style={{ color: "var(--slate)" }}>
              全部 {board.open.length} 条 →
            </Link>
          </div>
          <ul className="mt-2.5 space-y-2">
            {today.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/actions?task=${t.id}`}
                  className="block rounded-btn px-2.5 py-2 transition-colors hover:bg-[var(--line-soft)]"
                >
                  <div className="text-[13.5px] font-medium">{t.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
                    <span
                      className="rounded-pill px-1.5"
                      style={{
                        background: ACTION_COPY[t.actionType].bg,
                        color: ACTION_COPY[t.actionType].fg,
                      }}
                    >
                      {ACTION_COPY[t.actionType].label}
                    </span>
                    <span style={{ color: "var(--slate)" }}>{t.estimatedHours}h</span>
                    <span style={{ color: "var(--ai)" }}>服务 {t.targetCount} 个方向</span>
                    <span style={{ color: "var(--slate)" }}>
                      {perTargetLine(t)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 最近投递。三个生成入口之一 —— 从这里进的是已经生成过的版本，
          点进去就是差异详情，不用先回到方向页再找一遍。 */}
      {recentVersions.length > 0 && (
        <section
          className="mt-4 rounded-card px-5 py-4"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold">最近投递</h2>
            <Link href="/app/resume" className="text-[12.5px] hover:underline" style={{ color: "var(--slate)" }}>
              全部版本 →
            </Link>
          </div>
          <ul className="mt-2.5 space-y-2">
            {recentVersions.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/app/resume/${v.id}`}
                  className="block rounded-btn px-2.5 py-2 transition-colors hover:bg-[var(--line-soft)]"
                >
                  <div className="text-[13.5px] font-medium">
                    {v.submittedAt && <span aria-label="已锁定">🔒 </span>}
                    {v.company} · {v.roleTitle}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[12px]">
                    <span style={{ color: "var(--ai)" }}>{v.targetName}</span>
                    <span style={{ color: "var(--slate)" }}>{v.deltaCount} 处调整</span>
                    <span style={{ color: "var(--mute)" }}>
                      {v.submittedAt ? "已投递" : "草稿"}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 数据概览 */}
      <div className="mt-4 grid grid-cols-4 gap-4">
        <Card
          value={stats.atoms}
          label="经历"
          note={`${stats.projects} 个项目 · ${stats.slices} 个能力点`}
        />
        <Card
          value={stats.skills}
          label="技能"
          note={
            stats.skillsWithoutEvidence > 0
              ? `${stats.skillsWithoutEvidence} 个还没有经历能证明`
              : "都有经历撑着"
          }
        />
        <Card
          value={stats.pendingMetrics}
          label="待补数据"
          note={stats.pendingMetrics > 0 ? "补上就能提证明度" : "没有欠着的数"}
        />
        <Card
          value={board.open.length}
          label="待办行动"
          note={board.open.length > 0 ? `预计 ${board.totalHours} 小时` : "清单是空的"}
        />
      </div>
    </div>
  );
}

/** 各方向 impact 分别列出，不给总和 —— 首页也一样，得知道补的是哪个方向。 */
function perTargetLine(t: { targets: { targetName: string; impact: number }[] }): string {
  const byTarget = new Map<string, number>();
  for (const x of t.targets) {
    byTarget.set(x.targetName, (byTarget.get(x.targetName) ?? 0) + x.impact);
  }
  return [...byTarget]
    .map(([name, impact]) => `${name} +${impact.toFixed(1)}`)
    .join(" · ");
}

function Card({ value, label, note }: { value: number; label: string; note: string }) {
  return (
    <div
      className="rounded-card px-5 py-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="font-display text-[24px] font-semibold leading-none tracking-tight">
        {value}
      </div>
      <div className="mt-1.5 text-[13px] font-medium">{label}</div>
      <div className="mt-0.5 text-[12px]" style={{ color: "var(--mute)" }}>
        {note}
      </div>
    </div>
  );
}
