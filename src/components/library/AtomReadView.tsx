"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EvidenceChange } from "@/app/(app)/library/actions";
import {
  CONTEXT_LABEL,
  EVIDENCE_LABEL,
  STATUS_LABEL,
  STRENGTH_LABEL,
} from "@/lib/domain";
import { explainEvidence, STRENGTH_EXPLAIN } from "@/lib/evidence";
import type { AtomDetail as Detail } from "@/lib/queries/atoms";
import { MetricsBlock } from "./MetricsBlock";
import { PendingBlock } from "./PendingBlock";
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

  // 指标一存，证明度可能跳档。跳了就在指标区顶上说一句，
  // 同时让上面那个证明度标记闪一下——不然用户不知道刚才那一下起没起作用。
  // seq 只为让提示重新播一遍淡入淡出；连着改两次时，
  // 第一次的定时器也要清掉，不然第二条提示会被提前收走。
  const [notice, setNotice] = useState<{ change: EvidenceChange; seq: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = notice?.change ?? null;

  function noteChange(next: EvidenceChange) {
    if (!next.changed) return;
    if (timer.current) clearTimeout(timer.current);
    setNotice((prev) => ({ change: next, seq: (prev?.seq ?? 0) + 1 }));
    timer.current = setTimeout(() => setNotice(null), 3000);
  }

  // 提示说「仅设计 → 实测」的那一刻，atom 还是上一轮的数据。
  // 标记先按新档位显示，等真数据回来两边就一致了。
  const shownLevel =
    change?.changed && atom.evidence_level !== change.after ? change.after : atom.evidence_level;

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
          key={shownLevel}
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[12px] ${
            change?.changed ? "proof-flash" : ""
          }`}
          style={{ background: "var(--proof-soft)", color: "var(--ink)" }}
        >
          <ProofDot level={shownLevel} size={9} />
          {EVIDENCE_LABEL[shownLevel]}
          <WhyTip explain={explainEvidence(shownLevel, atom.status, atom.metrics)} />
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
        <MetricsBlock
          atomId={atom.id}
          metrics={atom.metrics}
          notice={change}
          noticeKey={notice?.seq ?? 0}
          onSaved={noteChange}
        />
      </Block>

      {/* 6 待补数据 */}
      <Block title="待补数据">
        <PendingBlock
          atomId={atom.id}
          items={atom.pending_metrics}
          onSaved={noteChange}
        />
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
    <section
      data-block={title}
      className="border-t px-6 py-5"
      style={{ borderColor: "var(--line-soft)" }}
    >
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

