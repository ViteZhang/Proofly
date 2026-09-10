"use client";

// =============================================================
// Proofly · A4 纸面
//
// 基线页与投递版本详情页共用同一份渲染。两处看到的必须是同一张纸 ——
// 「看完整简历」如果跟基线页长得不一样，用户就得在脑子里做一次换算，
// 而他要判断的是措辞，不是两个界面的差别。
// =============================================================

import { useState } from "react";
import { ProofDot } from "@/components/library/ProofDot";
import { ProofBar } from "./ProofBar";
import { type ProfileLine } from "@/lib/resume/markdown";
import { employmentHeading, layoutFlat } from "@/lib/resume/layout";
import { groupSkills } from "@/lib/skills/taxonomy";
import type { LayoutEmployment } from "@/lib/resume/layout";
import type { BaselineBlockView } from "@/lib/queries/resume";

export function ResumePaper({
  headline,
  blocks,
  skills,
  educations = [],
  credentials = [],
  selectedId = null,
  onSelect,
  onMenu,
  onDrop,
  draggable = false,
  reveal,
  highlight,
}: {
  headline: string;
  blocks: BaselineBlockView[];
  skills: string[];
  /** 教育背景与证书。直接来自基本信息，不可在这里编辑 —— 改要去那一页。 */
  educations?: ProfileLine[];
  credentials?: ProfileLine[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMenu?: (id: string, x: number, y: number) => void;
  onDrop?: (fromId: string, toId: string) => void;
  draggable?: boolean;
  /** 只显示前 N 块。刚生成完时逐条露出用。 */
  reveal?: number;
  /** 被差异改动过的块 id，详情页用它标出「这一版动过哪几块」。 */
  highlight?: Set<string>;
}) {
  // 排版与导出走同一个 layoutFlat：同 section 的块排在一起，同一段任职的
  // 块收拢到一个雇主标题下。摊平而不是分组，是因为每一块仍然要能单独
  // 选中和拖拽。
  const rows = layoutFlat(blocks);
  const shown = reveal === undefined ? rows.length : reveal;
  const skillGroups = groupSkills(skills);

  return (
    <article
      className="rounded-card px-9 py-8"
      style={{
        background: "#fff",
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-1)",
        width: 720,
        // A4 比例：210 × 297。不是装饰，是让人对篇幅有真实的判断。
        minHeight: Math.round((720 * 297) / 210),
      }}
    >
      <ProofBar
        blocks={rows.map((r) => ({
          evidenceLevel: r.source.evidenceLevel,
          weight: 1 + r.source.bullets.length + (r.source.summary ? 1 : 0),
        }))}
      />

      {headline && <p className="mt-5 text-[13.5px] leading-relaxed">{headline}</p>}

      {rows.slice(0, shown).map((row, i) => (
        <BlockRow
          key={row.source.id}
          block={row.source}
          title={row.title}
          meta={row.meta}
          employmentHead={row.employmentHead}
          first={i === 0}
          newSection={row.newSection}
          selected={row.source.id === selectedId}
          changed={highlight?.has(row.source.id) ?? false}
          draggable={draggable}
          onSelect={onSelect}
          onMenu={onMenu}
          onDrop={onDrop}
        />
      ))}

      {/* 顺序与导出一致：教育背景 → 技能 → 证书。屏幕上和导出的必须是
          同一份东西，不然用户会在两个界面之间做换算。 */}
      {shown >= rows.length && <Lines title="教育背景" lines={educations} />}

      {skillGroups.length > 0 && shown >= rows.length && (
        <section className="mt-7">
          <SectionTitle>技能</SectionTitle>
          <ul className="space-y-1">
            {skillGroups.map((g) => (
              <li key={g.category} className="text-[13px] leading-relaxed">
                <span style={{ color: "var(--mute)" }}>{g.category}</span>
                <span style={{ color: "var(--ghost)" }}>　</span>
                {g.items.join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown >= rows.length && <Lines title="证书与语言" lines={credentials} />}
    </article>
  );
}

/**
 * 教育背景 / 证书。它们不是块，点不了也拖不动 —— 没有「怎么讲」的空间，
 * 只有「是不是真的」，改要去基本信息那一页。
 */
function Lines({ title, lines }: { title: string; lines: ProfileLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="mt-7">
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
            <span className="min-w-0 flex-1">{l.main}</span>
            {l.when && (
              <span className="font-display shrink-0 text-[12px]" style={{ color: "var(--mute)" }}>
                {l.when}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-2 border-b pb-1 text-[12px] font-medium tracking-wide"
      style={{ color: "var(--mute)", borderColor: "var(--line-soft)" }}
    >
      {children}
    </h3>
  );
}

function BlockRow({
  block,
  title,
  meta,
  employmentHead,
  first,
  newSection,
  selected,
  changed,
  draggable,
  onSelect,
  onMenu,
  onDrop,
}: {
  block: BaselineBlockView;
  /** 剥掉重复公司名之后的标题。空串表示它已经并进雇主行。 */
  title: string;
  /** 挂了履历的块不在这里印时间 —— 雇主行上已经有了。 */
  meta: string;
  /** 非 null 表示这一块前面要先印一行雇主标题。 */
  employmentHead: LayoutEmployment | null;
  first: boolean;
  newSection: boolean;
  selected: boolean;
  changed: boolean;
  draggable: boolean;
  onSelect?: (id: string) => void;
  onMenu?: (id: string, x: number, y: number) => void;
  onDrop?: (fromId: string, toId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const border = selected
    ? "var(--proof)"
    : over
      ? "var(--ai)"
      : changed
        ? "var(--ai-soft)"
        : "transparent";

  return (
    <>
      {newSection && (
        <div className={first ? "mt-5" : "mt-7"}>
          <SectionTitle>{block.section}</SectionTitle>
        </div>
      )}
      {employmentHead && (
        <div className={newSection ? "mt-1" : "mt-6"}>
          <p className="text-[14px] font-medium">{employmentHeading(employmentHead)}</p>
        </div>
      )}
      <div
        draggable={draggable}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", block.id)}
        onDragOver={(e) => {
          if (!draggable) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData("text/plain");
          if (id && onDrop) onDrop(id, block.id);
        }}
        onClick={() => onSelect?.(block.id)}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          onMenu(block.id, e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(block.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`简历块 ${block.title}`}
        // 体检页跳过来时要能滚到这一块
        data-block-id={block.id}
        className={`${newSection || employmentHead ? "mt-2" : "mt-5"} cursor-pointer border-l-[3px] pl-3 transition-colors`}
        style={{ borderColor: border, marginLeft: -15 }}
      >
        {/* 标题与时间那一行。单项目雇主的标题已经并进雇主行，两边都空时
            整行不占位 —— 只剩一个孤零零的证明度圆点，看着像渲染坏了。
            那种情况下圆点挪到第一条 bullet 前面，信息一点没少。 */}
        {(title !== "" || meta !== "" || block.edited || changed) && (
        <div className="flex items-baseline gap-2">
          <ProofDot level={block.evidenceLevel} size={9} className="translate-y-[1px]" />
          {title !== "" && (
            <span className={employmentHead || meta === "" ? "text-[13.5px] font-medium" : "text-[14px] font-medium"}>
              {title}
            </span>
          )}
          {block.edited && (
            <span className="text-[11px]" style={{ color: "var(--ai)" }}>
              手工改过
            </span>
          )}
          {changed && (
            <span className="text-[11px]" style={{ color: "var(--ai)" }}>
              本版有调整
            </span>
          )}
          <span className="ml-auto text-[12px]" style={{ color: "var(--mute)" }}>
            {meta}
          </span>
        </div>
        )}
        {block.summary && (
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
            {block.summary}
          </p>
        )}
        {block.bullets.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {block.bullets.map((line, j) => (
              <li key={j} className="flex items-baseline gap-2 text-[13px] leading-relaxed">
                {j === 0 && title === "" && meta === "" ? (
                  <ProofDot level={block.evidenceLevel} size={9} className="translate-y-[1px]" />
                ) : (
                  <span style={{ color: "var(--ghost)" }}>·</span>
                )}
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
