"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { EvidenceChange } from "@/app/(app)/library/actions";
import {
  CONTEXT_LABEL,
  EVIDENCE_LABEL,
  STATUS_LABEL,
} from "@/lib/domain";
import { explainEvidence, STRENGTH_EXPLAIN } from "@/lib/evidence";
import type { AtomDetail as Detail } from "@/lib/queries/atoms";
import type { AtomStrategyRow } from "@/lib/queries/strategy";
import { GuardsBlock } from "./GuardsBlock";
import { MetricsBlock } from "./MetricsBlock";
import { PendingBlock } from "./PendingBlock";
import { ProofDot } from "./ProofDot";
import { SkillsBlock } from "./SkillsBlock";
import { StrategyBlock } from "./StrategyBlock";
import { WhyTip } from "./WhyTip";

// 区块顺序固定（S3）：标题 → 元信息 → 背景 → 我做了什么 → 结果 →
// 待补数据 → 叙事护栏 → 技能证据 → 各方向策略。
export function AtomReadView({
  atom,
  strategies,
  onEdit,
  onAddSlice,
  addingSlice,
}: {
  atom: Detail;
  strategies: AtomStrategyRow[];
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
        <GuardsBlock atomId={atom.id} guards={atom.guards} />
      </Block>

      {/* 8 技能证据 */}
      <Block title="技能证据" aside={<WhyTip explain={STRENGTH_EXPLAIN} />}>
        <SkillsBlock atomId={atom.id} skills={atom.skills} />
      </Block>

      {/* 9 各方向策略 */}
      <Block title="各方向策略">
        <StrategyBlock atomId={atom.id} rows={strategies} />
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

// 体检页的「去解决」带着 ?highlight=技能证据 / 结果 过来 —— 滚到那一区
// 并标出来。跳到经历顶部让用户自己往下找，等于没做跳转。
const HIGHLIGHT_BLOCK: Record<string, string> = {
  skills: "技能证据",
  metrics: "结果",
};

function Block({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const wanted = HIGHLIGHT_BLOCK[params.get("highlight") ?? ""];
  const hit = wanted === title;
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (hit) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hit]);

  return (
    <section
      ref={ref}
      data-block={title}
      className="border-t px-6 py-5"
      style={{
        borderColor: "var(--line-soft)",
        background: hit ? "var(--caution-soft)" : undefined,
      }}
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




// period_end 为 null 显示「至今」
function period(start: string | null, end: string | null): string | null {
  const fmt = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}`;
  if (!start && !end) return null;
  if (!start) return `至 ${fmt(end!)}`;
  return `${fmt(start)} – ${end ? fmt(end) : "至今"}`;
}

