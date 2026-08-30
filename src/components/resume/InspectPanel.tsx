"use client";

// =============================================================
// Proofly · 块级检查面板（S8-A 右侧）
//
// 跟随选中的块：来源经历、证明度、措辞模板、为啥选它、校验结果。
// 底部固定「本版取舍」—— 它回答的是「我那条经历去哪了」，
// 这个问题不回答，用户就会怀疑系统把东西弄丢了。
// =============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProofDot } from "@/components/library/ProofDot";
import { EVIDENCE_LABEL } from "@/lib/domain";
import { editBlock } from "@/app/(app)/resume/block-actions";
import type { GateResult } from "@/lib/resume/gate";
import type { BaselineBlockView, BaselineView } from "@/lib/queries/resume";
import type { SelectionPreview } from "@/app/(app)/resume/baseline-actions";
import type { EvidenceLevel } from "@/types/database";

// 2.1 四档规则，逐条对应。面板上写出来，用户改文本时才知道边界在哪。
const TEMPLATE_RULE: Record<EvidenceLevel, string> = {
  measured: "可以写精确数字、变化幅度、绝对量级",
  estimated: "只能用「约」「内部测算」这类限定词，不许精确到小数的百分比",
  designed_only: "禁止出现任何结果数字；交付物数量是事实，可以写",
  absent: "只写动作与设计，不提任何数字化的结果",
};

export function InspectPanel({
  baseline,
  preview,
  block,
  locked,
  onMove,
  canMoveUp,
  canMoveDown,
  readOnly = false,
}: {
  baseline: BaselineView | null;
  preview: SelectionPreview | null;
  block: BaselineBlockView | null;
  locked: boolean;
  /** 投递版本详情页复用这块面板，那里一切只读。 */
  readOnly?: boolean;
  onMove: (delta: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const tradeoffs = baseline?.tradeoffs ?? preview?.tradeoffs ?? [];
  const checks = baseline?.checks ?? [];
  const blocking = checks.filter((c) => c.level === "blocking");
  const why = block?.atomId ? baseline?.why[block.atomId] ?? [] : [];
  const mine = block
    ? checks.filter((c) => c.blockId === block.id || c.blockId === block.atomId)
    : [];

  return (
    <div className="space-y-4">
      {blocking.length > 0 && (
        <Panel title={`必须先解决 ${blocking.length} 处`} tone="danger">
          {blocking.map((c) => (
            <p key={c.id} className="text-[12.5px] leading-relaxed">
              <b>{c.code}</b> {c.title}
              <span className="block" style={{ color: "var(--slate)" }}>
                {c.detail}
              </span>
            </p>
          ))}
        </Panel>
      )}

      {block ? (
        <BlockInspector
          block={block}
          why={why}
          checks={mine}
          locked={locked || readOnly}
          onMove={onMove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
      ) : (
        baseline &&
        baseline.blocks.length > 0 && (
          <Panel title="点一块看它的来历">
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              左边点任意一块，这里会显示它来自哪条经历、用的哪档措辞模板、
              为什么被选进来，以及校验有没有过。
            </p>
          </Panel>
        )
      )}

      {!readOnly && (
      <Panel title="本版取舍">
        {tradeoffs.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--mute)" }}>
            这个方向下没有落选的经历，技能栏也没有被过滤的标签。
          </p>
        ) : (
          tradeoffs.map((t, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed">
              <span
                className="mr-1.5 rounded-pill px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--bg)", color: "var(--slate)" }}
              >
                {t.kind === "exclusive" ? "互斥" : t.kind === "omit" ? "省略" : "空标签"}
              </span>
              <b>{t.title}</b>
              <span className="block" style={{ color: "var(--slate)" }}>
                {t.detail}
              </span>
            </p>
          ))
        )}
      </Panel>
      )}

      {!readOnly && (
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--mute)" }}>
        选材、互斥消解、技能过滤全部由代码判定，同样的策略配置生成十次得到同样的名单。
        模型只负责措辞。
        <Link href="/targets/strategy" className="ml-1 underline" style={{ color: "var(--ink)" }}>
          去改策略
        </Link>
      </p>
      )}
    </div>
  );
}

function BlockInspector({
  block,
  why,
  checks,
  locked,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  block: BaselineBlockView;
  why: string[];
  checks: { id: string; level: string; title: string; detail: string | null }[];
  locked: boolean;
  onMove: (delta: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Panel title={block.title}>
      <Row label="来源经历">{block.atomTitle}</Row>
      <Row label="证明度">
        <span className="inline-flex items-center gap-1.5">
          <ProofDot level={block.evidenceLevel} size={9} />
          {EVIDENCE_LABEL[block.evidenceLevel]}
        </span>
      </Row>
      <Row label="措辞模板">
        {block.templateUsed}
        <span className="mt-0.5 block" style={{ color: "var(--slate)" }}>
          {TEMPLATE_RULE[block.templateUsed]}
        </span>
      </Row>
      <Row label="为啥选它">
        {why.length > 0 ? (
          why.map((w, i) => (
            <span key={i} className="block">
              {w}
            </span>
          ))
        ) : (
          <span style={{ color: "var(--slate)" }}>
            这个方向下还没有已评估的 JD。现在它出现在这里，是因为方向策略里配了展开权重。
          </span>
        )}
      </Row>
      <Row label="校验">
        {checks.length === 0 ? (
          <span style={{ color: "var(--proof)" }}>✓ 未触发护栏禁词，数字都有出处</span>
        ) : (
          checks.map((c) => (
            <span
              key={c.id}
              className="block"
              style={{ color: c.level === "blocking" ? "var(--danger)" : "var(--warn)" }}
            >
              {c.level === "blocking" ? "✕" : "!"} {c.title}
            </span>
          ))
        )}
      </Row>

      {!locked && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "收起" : "改这一块"}
          </Button>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label="上移这一块"
            className="rounded-btn px-2 py-1 text-[13px] disabled:opacity-40"
            style={{ border: "1px solid var(--line)" }}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label="下移这一块"
            className="rounded-btn px-2 py-1 text-[13px] disabled:opacity-40"
            style={{ border: "1px solid var(--line)" }}
          >
            ↓
          </button>
        </div>
      )}

      {editing && !locked && <BlockEditor block={block} onDone={() => setEditing(false)} />}
    </Panel>
  );
}

function BlockEditor({ block, onDone }: { block: BaselineBlockView; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(block.title);
  const [meta, setMeta] = useState(block.meta);
  const [summary, setSummary] = useState(block.summary);
  const [bullets, setBullets] = useState(block.bullets.join("\n"));
  const [rejected, setRejected] = useState<GateResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function save() {
    setError(null);
    setRejected([]);
    start(async () => {
      const r = await editBlock(block.id, {
        title,
        meta,
        summary,
        bullets: bullets.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data.status === "rejected") {
        setRejected(r.data.results.filter((x) => x.level === "blocking"));
        return;
      }
      onDone();
      router.refresh();
    });
  }

  const bad = rejected.length > 0;
  const field = {
    background: "var(--bg)",
    border: `1px solid ${bad ? "var(--danger)" : "var(--line)"}`,
  };

  return (
    <div className="space-y-2 pt-1">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="块标题"
        className="w-full rounded-btn px-2 py-1 text-[13px]"
        style={field}
      />
      <input
        value={meta}
        onChange={(e) => setMeta(e.target.value)}
        aria-label="时间或角色标注"
        className="w-full rounded-btn px-2 py-1 text-[12.5px]"
        style={field}
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        aria-label="一行概述"
        placeholder="一行概述（one_line 权重时只填这个）"
        className="w-full rounded-btn px-2 py-1 text-[12.5px] leading-relaxed"
        style={field}
      />
      <textarea
        value={bullets}
        onChange={(e) => setBullets(e.target.value)}
        rows={5}
        aria-label="bullet，一行一条"
        placeholder="一行一条 bullet"
        className="w-full rounded-btn px-2 py-1 text-[12.5px] leading-relaxed"
        style={field}
      />

      {bad && (
        <div
          className="rounded-btn px-2 py-1.5"
          style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)" }}
        >
          <p className="text-[12px] font-medium" style={{ color: "var(--danger)" }}>
            没保存 —— 这样写过不了门禁：
          </p>
          {rejected.map((r, i) => (
            <p key={i} className="mt-0.5 text-[12px] leading-relaxed">
              [{r.code}] {r.message}
            </p>
          ))}
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--slate)" }}>
            {/* 提示要对得上拦下来的那一条。禁词被拦时说「去经历库把数字记下来」，
                用户会照做，然后发现还是存不上。 */}
            {rejected.some((r) => r.code === "G2")
              ? "护栏是你自己定的：这条经历的 never_say 里有这个词。要改，去经历库改护栏。"
              : "手工编辑不是绕过门禁的后门。要写这个数字，先去经历库把它记下来。"}
          </p>
        </div>
      )}
      {error && (
        <p className="text-[12px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "校验中…" : "保存"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-[12.5px] hover:underline"
          style={{ color: "var(--mute)" }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[12.5px] leading-relaxed">
      <span className="w-[52px] shrink-0" style={{ color: "var(--mute)" }}>
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Panel({
  title,
  tone = "plain",
  children,
}: {
  title: string;
  tone?: "plain" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const border =
    tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--line)";
  const bg =
    tone === "danger" ? "var(--danger-soft)" : tone === "warn" ? "var(--warn-soft)" : "var(--card)";
  return (
    <section
      className="rounded-card px-4 py-3"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <h3 className="text-[12.5px] font-semibold">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
