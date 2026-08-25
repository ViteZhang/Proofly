"use client";

import { Button } from "@/components/ui/Button";
import {
  CONTEXT_LABEL,
  EVIDENCE_LABEL,
  METRIC_KIND_LABEL,
  STATUS_LABEL,
  STRENGTH_LABEL,
} from "@/lib/domain";
import { explainEvidence, STRENGTH_EXPLAIN } from "@/lib/evidence";
import type { AtomDetail as Detail, AtomMetric } from "@/lib/queries/atoms";
import { ProofDot } from "./ProofDot";
import { WhyTip } from "./WhyTip";

// 区块顺序固定（S3）：标题 → 元信息 → 背景 → 我做了什么 → 结果 →
// 待补数据 → 叙事护栏 → 技能证据 → 各方向策略。
export function AtomReadView({
  atom,
  onEdit,
  onAddSlice,
  addingSlice,
}: {
  atom: Detail;
  onEdit: () => void;
  onAddSlice: () => void;
  addingSlice: boolean;
}) {
  const range = period(atom.period_start, atom.period_end);

  return (
    <article
      className="rounded-card"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      {/* 1 标题区 */}
      <header className="flex items-start gap-4 px-6 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold leading-snug tracking-tight">{atom.title}</h2>
          <div className="font-display mt-1 text-[11.5px]" style={{ color: "var(--mute)" }}>
            {atom.id}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          编辑
        </Button>
      </header>

      {/* 2 元信息胶囊 */}
      <div className="flex flex-wrap items-center gap-1.5 px-6 pb-5">
        {atom.level === "capability_slice" && atom.parent && (
          <Pill>{atom.parent.title} 的能力点</Pill>
        )}
        {atom.org && <Pill>{atom.org}</Pill>}
        {atom.role && <Pill>{atom.role}</Pill>}
        {range && <Pill>{range}</Pill>}
        <Pill>{STATUS_LABEL[atom.status]}</Pill>
        <Pill>{CONTEXT_LABEL[atom.context]}</Pill>

        {/* 证明度只读。旁边的 ? 解释当前这一档是怎么推出来的。 */}
        <span
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[12px]"
          style={{ background: "var(--proof-soft)", color: "var(--ink)" }}
        >
          <ProofDot level={atom.evidence_level} size={9} />
          {EVIDENCE_LABEL[atom.evidence_level]}
          <WhyTip explain={explainEvidence(atom.evidence_level, atom.status, atom.metrics)} />
        </span>
      </div>

      {/* 3 背景 */}
      <Block title="背景">
        {atom.situation ? (
          <Paragraph>{atom.situation}</Paragraph>
        ) : (
          <Todo>还没写背景。补一句当时是什么处境，面试讲这条的时候用得上。</Todo>
        )}
      </Block>

      {/* 4 我做了什么 */}
      <Block title="我做了什么">
        {atom.task && <Paragraph>{atom.task}</Paragraph>}
        {atom.actions.length > 0 && (
          <ul className={atom.task ? "mt-2.5" : ""}>
            {atom.actions.map((action, i) => (
              <li key={`${i}-${action}`} className="flex gap-2 py-[3px] text-[13.5px]">
                <span aria-hidden style={{ color: "var(--ghost)" }}>
                  —
                </span>
                <span className="min-w-0 flex-1">{action}</span>
              </li>
            ))}
          </ul>
        )}
        {!atom.task && atom.actions.length === 0 && (
          <Todo>还没写你做了什么。这块是简历里最占篇幅的一段。</Todo>
        )}
      </Block>

      {/* 5 结果 */}
      <Block title="结果">
        {atom.metrics.length > 0 ? (
          <ul className="-mx-1">
            {atom.metrics.map((m) => (
              <MetricRow key={m.id} metric={m} />
            ))}
          </ul>
        ) : (
          <Todo>还没有结果指标。补一条，证明度会跟着变。</Todo>
        )}
      </Block>

      {/* 6 待补数据 */}
      <Block title="待补数据">
        {atom.pending_metrics.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {atom.pending_metrics.map((p) => (
              <span
                key={p.id}
                className="rounded-pill px-2.5 py-[3px] text-[12.5px]"
                style={{ border: "1px dashed var(--line)", color: "var(--slate)" }}
              >
                {p.name}
              </span>
            ))}
          </div>
        ) : (
          <Todo>想到还缺哪个数，记在这里，回头补上就能提证明度。</Todo>
        )}
      </Block>

      {/* 7 叙事护栏 */}
      <Block title="叙事护栏">
        {atom.guards ? (
          <div className="space-y-3">
            {atom.guards.role_framing && (
              <div>
                <SubTitle>角色定位</SubTitle>
                <Paragraph>{atom.guards.role_framing}</Paragraph>
              </div>
            )}
            {atom.guards.must_say.length > 0 && (
              <div>
                <SubTitle>必须说</SubTitle>
                <GuardList items={atom.guards.must_say} tone="proof" />
              </div>
            )}
            {atom.guards.never_say.length > 0 && (
              <div>
                <SubTitle>不能说</SubTitle>
                <GuardList items={atom.guards.never_say} tone="danger" />
              </div>
            )}
            {atom.guards.probes.length > 0 && (
              <div>
                <SubTitle>被追问时</SubTitle>
                {atom.guards.probes.map((probe, i) => (
                  <div key={`${i}-${probe.q}`} className="py-1">
                    <div className="text-[13.5px] font-medium">{probe.q}</div>
                    {probe.a_outline && (
                      <div className="text-[13px]" style={{ color: "var(--slate)" }}>
                        {probe.a_outline}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="text-[13px]" style={{ color: "var(--mute)" }}>
              还没设置叙事护栏。
            </span>
            <Button variant="secondary" size="sm" disabled title="切片 1.6 接上">
              添加
            </Button>
          </div>
        )}
      </Block>

      {/* 8 技能证据 */}
      <Block
        title="技能证据"
        aside={<WhyTip explain={STRENGTH_EXPLAIN} />}
      >
        {atom.skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {atom.skills.map((s) => (
              <span
                key={s.linkId}
                className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[12.5px]"
                style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                <StrengthDot strength={s.evidence_strength} />
                {s.label}
                <span style={{ color: "var(--mute)" }}>{STRENGTH_LABEL[s.evidence_strength]}</span>
              </span>
            ))}
          </div>
        ) : (
          <Todo>还没关联技能。没有经历支撑的技能不会出现在简历技能栏里。</Todo>
        )}
      </Block>

      {/* 9 各方向策略 —— targets 表要到 Step 4 才有数据，这里先占位 */}
      <Block title="各方向策略">
        <Todo>
          还没有求职方向。建了方向之后，可以在这里配置这条经历在各方向下的展开程度。
        </Todo>
      </Block>

      {/* 只有两层：能力点下面不能再挂能力点，所以这个按钮只对经历出现 */}
      {atom.level === "project" && (
        <div className="border-t px-6 py-4" style={{ borderColor: "var(--line-soft)" }}>
          <Button variant="text" size="sm" onClick={onAddSlice} disabled={addingSlice}>
            {addingSlice ? "正在新建…" : "＋ 添加能力点"}
          </Button>
        </div>
      )}
    </article>
  );
}

// ---- 小件 ----

function Block({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t px-6 py-5" style={{ borderColor: "var(--line-soft)" }}>
      <h3
        className="flex items-center gap-1.5 text-[11.5px] font-medium"
        style={{ letterSpacing: "0.06em", color: "var(--mute)" }}
      >
        {title}
        {aside}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-medium" style={{ color: "var(--slate)" }}>
      {children}
    </div>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="whitespace-pre-wrap text-[13.5px] leading-[1.75]">{children}</p>;
}

// 空区块不写「暂无数据」，写下一步该干什么。
function Todo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px]" style={{ color: "var(--mute)" }}>
      {children}
    </p>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-pill px-2.5 py-[3px] text-[12px]"
      style={{ border: "1px solid var(--line)", color: "var(--slate)" }}
    >
      {children}
    </span>
  );
}

function GuardList({ items, tone }: { items: string[]; tone: "proof" | "danger" }) {
  const color = tone === "proof" ? "var(--proof)" : "var(--danger)";
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex gap-2 py-[3px] text-[13.5px]">
          <span aria-hidden style={{ color }}>
            {tone === "proof" ? "✓" : "✕"}
          </span>
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MetricRow({ metric }: { metric: AtomMetric }) {
  return (
    <li className="flex items-baseline gap-2.5 rounded-btn px-1 py-1.5">
      <ProofDot level={metric.evidence_level} className="translate-y-[1px]" />
      <span className="text-[13.5px] font-medium">{metric.name}</span>
      <span className="font-display text-[13.5px]" style={{ color: "var(--ink)" }}>
        {value(metric)}
      </span>
      <span
        className="rounded-pill px-1.5 py-[1px] text-[11px]"
        style={{
          background: metric.kind === "outcome" ? "var(--proof-soft)" : "var(--line-soft)",
          color: metric.kind === "outcome" ? "var(--ink)" : "var(--slate)",
        }}
      >
        {METRIC_KIND_LABEL[metric.kind]}
      </span>
      {metric.method && (
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--mute)" }}>
          {metric.method}
        </span>
      )}
    </li>
  );
}

function StrengthDot({ strength }: { strength: "strong" | "weak" | "none" }) {
  const color = strength === "none" ? "var(--ghost)" : "var(--proof)";
  return (
    <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden className="shrink-0">
      {strength === "strong" ? (
        <circle cx="5" cy="5" r="4.25" fill={color} />
      ) : (
        <circle cx="5" cy="5" r="3.6" fill="none" stroke={color} strokeWidth="1.4" />
      )}
    </svg>
  );
}

// period_end 为 null 显示「至今」
function period(start: string | null, end: string | null): string | null {
  const fmt = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}`;
  if (!start && !end) return null;
  if (!start) return `至 ${fmt(end!)}`;
  return `${fmt(start)} – ${end ? fmt(end) : "至今"}`;
}

function value(metric: AtomMetric): string {
  if (metric.from_value && metric.to_value) {
    const base = `${metric.from_value} → ${metric.to_value}`;
    return metric.delta ? `${base}（${metric.delta}）` : base;
  }
  return metric.delta ?? metric.to_value ?? metric.from_value ?? "";
}
