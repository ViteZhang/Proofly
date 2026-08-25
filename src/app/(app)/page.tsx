import Link from "next/link";
import { getOverviewStats, getProofSummary } from "@/lib/queries/atoms";
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
  const [summary, stats] = await Promise.all([getProofSummary(), getOverviewStats()]);

  // 一条经历都没有的时候，摆一个 0% 的环没有任何意义
  if (summary.total === 0) return <EmptyLibrary />;

  return (
    <div className="max-w-[860px]">
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
                <Link href="/library" className="underline underline-offset-2">
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

      {/* 数据概览 */}
      <div className="mt-4 grid grid-cols-3 gap-4">
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
      </div>
    </div>
  );
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
