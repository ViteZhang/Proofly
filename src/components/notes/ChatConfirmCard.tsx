"use client";

// =============================================================
// Proofly · 对话流里的确认卡（切片 3.3 版）
//
// 卡上只放一件事：模型说它要往档案里写什么，以及凭什么这么判。
// 用户原话逐字放出来，是为了让「多写的那一句」一眼能看出来——
// 这些数据会进简历，编出来的每一句都是面试时要承担的风险。
//
// 连带影响（3.4）与确认入库（3.6）还没接，卡片底下先说清楚。
// 按 S5 做的完整样式是 3.5 的活。
// =============================================================

import Link from "next/link";

import { RippleList } from "@/components/notes/RippleList";
import { Button } from "@/components/ui/Button";

import { EVIDENCE_LABEL, METRIC_KIND_LABEL, STATUS_LABEL } from "@/lib/domain";
import type { CardDiff, CardMetric, ConfirmCardView } from "@/lib/chat/message-shape";
import type { Choice } from "@/app/(app)/notes/commit-actions";
import type { AtomStatus, EvidenceLevel, MetricKind } from "@/types/database";

const INTENT_LABEL = {
  UPDATE: "更新已有经历",
  CREATE: "新建一条经历",
  ASK: "拿不准，你来定",
} as const;

// diff.field 是模型填的，中英文都有：status_change 常带 "status"，
// 也常带「状态」。两种都要能对上，否则拼出来是「状态 status：…」。
const FIELD_LABEL: Record<string, string> = {
  status: "状态",
  situation: "背景",
  task: "任务",
  role: "角色",
  org: "组织",
  actions: "动作",
  period_end: "结束时间",
  evidence_level: "证明度",
};

const DIFF_LABEL: Record<string, string> = {
  field_change: "改了",
  metric_add: "加指标",
  pending_resolved: "待补项落地",
  status_change: "状态",
  evidence_change: "证明度",
};

export function ChatConfirmCard({
  card,
  headline,
  imageUrl,
  busy = false,
  onCommit,
  onReject,
}: {
  card: ConfirmCardView;
  /** 助手那句话本身。卡嵌在对话流里，得先读得像一句话，再是一张表。 */
  headline: string;
  imageUrl: string | null;
  busy?: boolean;
  onCommit?: (choice?: Choice) => void;
  onReject?: () => void;
}) {
  const u = card.unit;
  const ask = card.intent === "ASK";
  // 撤销之后卡片变灰留在原地，不删 —— 用户得看得见自己刚撤了什么（验收 35）
  const spent = card.undone || card.rejected;

  return (
    <div
      className="rounded-btn border px-3 py-2.5 text-[13px]"
      style={{
        borderColor: spent ? "var(--line)" : ask ? "var(--warn)" : "var(--line)",
        background: spent ? "var(--line-soft)" : undefined,
        opacity: spent ? 0.6 : 1,
      }}
    >
      {headline.trim() !== "" && (
        <p className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>
          {headline}
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span style={{ color: "var(--slate)" }}>{INTENT_LABEL[card.intent]}</span>
        <span style={{ color: "var(--mute)" }}>置信度 {card.confidence.toFixed(2)}</span>
        {card.targetAtomId !== null && (
          <Link
            href={`/library?atom=${card.targetAtomId}`}
            className="underline"
            style={{ color: "var(--mute)" }}
          >
            去看「{card.targetTitle}」
          </Link>
        )}
      </div>

      {u?.resolvedFromContext && (
        <p className="mt-1" style={{ color: "var(--mute)" }}>
          「{u.subjectHint}」是从上文认出来的，不是你这句里说的。
        </p>
      )}

      {imageUrl !== null && (
        // 图片路径的防幻觉手段就这一个：把原图摆在旁边，让人自己对。
        // 签名 URL 指向 Supabase Storage，next/image 的优化器过不去，用原生 img。
        <a href={imageUrl} target="_blank" rel="noreferrer" className="mt-2 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="你贴的那张图"
            className="max-h-[120px] rounded-btn border"
            style={{ borderColor: "var(--line)" }}
          />
        </a>
      )}

      {card.diff.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {card.diff.map((d, i) => (
            <li key={i} style={{ color: "var(--slate)" }}>
              · {diffLine(d)}
            </li>
          ))}
        </ul>
      )}

      {u !== null && <UnitFacts unit={u} />}

      <RippleList
        effects={card.ripple}
        titles={card.targetAtomId === null ? {} : { [card.targetAtomId]: card.targetTitle }}
      />

      {u !== null && u.userWords.trim() !== "" && (
        <p className="mt-2" style={{ color: "var(--mute)" }}>
          你的原话：{u.userWords}
        </p>
      )}

      {card.aiNote.trim() !== "" && (
        <p className="mt-1.5" style={{ color: "var(--mute)" }}>
          判断依据：{card.aiNote}
        </p>
      )}

      {ask && card.options.length > 0 && (
        <div className="mt-2">
          <p style={{ color: "var(--slate)" }}>可选：</p>
          <ul className="mt-0.5 space-y-0.5">
            {card.options.map((o, i) => (
              <li key={i} style={{ color: "var(--slate)" }}>
                · {o.label}
                {o.consequence !== "" && (
                  <span style={{ color: "var(--mute)" }}>——{o.consequence}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.recallDegraded && (
        <p className="mt-1.5" style={{ color: "var(--warn)" }}>
          向量召回没跑起来，这次是按字面匹配找的候选，多看一眼。
        </p>
      )}

      <Footer
        card={card}
        ask={ask}
        busy={busy}
        onCommit={onCommit}
        onReject={onReject}
      />
    </div>
  );
}

function Footer({
  card,
  ask,
  busy,
  onCommit,
  onReject,
}: {
  card: ConfirmCardView;
  ask: boolean;
  busy: boolean;
  onCommit?: (choice?: Choice) => void;
  onReject?: () => void;
}) {
  if (card.undone) return <State>已撤销</State>;
  if (card.rejected) return <State>没收这条</State>;
  if (card.committed) return <State>已入库</State>;
  if (onCommit === undefined || onReject === undefined) return null;

  // ASK 不给「确认」——它本来就是「我不知道该落到哪」，
  // 给一个默认按钮等于替用户做了那个它自己都没把准的决定。
  if (ask) {
    return (
      <div className="mt-2.5 flex flex-wrap gap-2">
        {card.options.map((o, i) => (
          <Button
            key={i}
            size="sm"
            variant={i === 0 ? "primary" : "secondary"}
            disabled={busy}
            onClick={() =>
              onCommit({
                action: o.action === "UPDATE" || o.action === "MERGE" ? o.action : "CREATE",
                targetAtomId: o.targetAtomId,
              })
            }
          >
            {o.label === "" ? o.action : o.label}
          </Button>
        ))}
        <Button size="sm" variant="text" disabled={busy} onClick={onReject}>
          都不是，先放着
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => onCommit()}>
        确认
      </Button>
      <Button size="sm" variant="text" disabled={busy} onClick={onReject}>
        不用了
      </Button>
    </div>
  );
}

function State({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[12px]" style={{ color: "var(--mute)" }}>
      {children}
    </p>
  );
}

function UnitFacts({ unit }: { unit: NonNullable<ConfirmCardView["unit"]> }) {
  const rows: [string, string][] = [];

  if (unit.status !== null) {
    rows.push(["状态", STATUS_LABEL[unit.status as AtomStatus] ?? unit.status]);
  }
  if (unit.pendingMetrics.length > 0) {
    rows.push(["待补数据", unit.pendingMetrics.join("、")]);
  }
  if (unit.situation !== "") rows.push(["背景", unit.situation]);
  if (unit.task !== "") rows.push(["任务", unit.task]);
  if (unit.actionsAdd.length > 0) rows.push(["动作", unit.actionsAdd.join("；")]);
  if (unit.mustSay.length > 0) rows.push(["必须说", unit.mustSay.join("；")]);
  if (unit.neverSay.length > 0) rows.push(["不能说", unit.neverSay.join("；")]);
  if (unit.roleFraming !== "") rows.push(["角色口径", unit.roleFraming]);

  if (rows.length === 0 && unit.metrics.length === 0) return null;

  return (
    <div className="mt-2 space-y-0.5">
      {unit.metrics.map((m, i) => (
        <p key={i} style={{ color: "var(--slate)" }}>
          指标：{metricLine(m)}
        </p>
      ))}
      {rows.map(([k, v]) => (
        <p key={k} style={{ color: "var(--slate)" }}>
          {k}：{v}
        </p>
      ))}
    </div>
  );
}

function metricLine(m: CardMetric): string {
  const value =
    m.fromValue && m.toValue
      ? `${m.fromValue} → ${m.toValue}${m.delta ? `（${m.delta}）` : ""}`
      : m.delta || m.toValue || m.fromValue;
  const kind = METRIC_KIND_LABEL[m.kind as MetricKind] ?? m.kind;
  const level = EVIDENCE_LABEL[m.evidenceLevel as EvidenceLevel] ?? m.evidenceLevel;
  // 口径为空是正常的——用户没说就不许编。这里如实留白。
  const method = m.method === "" ? "口径未说明" : `口径：${m.method}`;
  return `${m.name} ${value}（${kind} · ${level} · ${method}）`;
}

function diffLine(d: CardDiff): string {
  const head = DIFF_LABEL[d.type] ?? d.type;
  const named = FIELD_LABEL[d.field] ?? d.field;
  // 模型常把 field 填成和这一类同名（status_change 的 field 就是 status／状态），
  // 照直拼出来是「状态 status：…」。同名就只留一个。
  const field = named === "" || named === head ? "" : ` ${named}`;
  const change =
    d.before !== "" && d.after !== ""
      ? `：${d.before} → ${d.after}`
      : d.after !== ""
        ? `：${d.after}`
        : "";
  return `${head}${field}${change}${d.note === "" ? "" : `（${d.note}）`}`;
}
