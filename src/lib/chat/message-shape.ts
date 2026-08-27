// =============================================================
// Proofly · 对话消息的形状与解析
//
// 单独一个文件的原因和 queries/draft-shape.ts 一样：
// 客户端组件要用这些类型和解析函数，而 queries/chat.ts 会经
// @/lib/supabase/server 拉进 next/headers，客户端一 import 就炸。
//
// payload 是无类型 jsonb，读出来一律过解析：坏数据降级为空，
// 不让一条脏消息把整个对话流白屏掉。
// =============================================================

import type { ChatKind, ChatRole, Json } from "@/types/database";

export type ChatMessageView = {
  id: string;
  role: ChatRole;
  kind: ChatKind;
  content: string;
  imagePath: string | null;
  /** 私有桶要签名才能看。签名会过期，所以每次读消息现签，不入库。 */
  imageUrl: string | null;
  payload: Json;
  createdAt: string | null;
};

/** query_answer 消息里可跳转的经历。没有就是空数组，界面不渲染按钮。 */
export type AnswerLink = { atomId: string; title: string };

export function answerLinks(payload: Json): AnswerLink[] {
  const o = obj(payload);
  if (o.kind !== "atoms" || !Array.isArray(o.atoms)) return [];
  const out: AnswerLink[] = [];
  for (const raw of o.atoms) {
    const a = obj(raw);
    if (typeof a.atomId === "string" && typeof a.title === "string") {
      out.push({ atomId: a.atomId, title: a.title });
    }
  }
  return out;
}

export function obj(v: Json | null | undefined): Record<string, Json | undefined> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, Json | undefined>)
    : {};
}

export type ChatMessageRow = {
  id: string;
  role: ChatRole;
  kind: ChatKind;
  content: string | null;
  image_path: string | null;
  payload: Json;
  created_at: string | null;
};

/** 行 → 视图。imageUrl 留空，由拿得到 Storage 的那一层签完再往外送。 */
export function toMessageView(r: ChatMessageRow): ChatMessageView {
  return {
    id: r.id,
    role: r.role,
    kind: r.kind,
    content: r.content ?? "",
    imagePath: r.image_path,
    imageUrl: null,
    payload: r.payload,
    createdAt: r.created_at,
  };
}

// ---- 确认卡 ----
// payload 是模型产出经 zod 后写进 jsonb 的，读回来仍然当无类型处理：
// 中间隔着一次数据库往返，谁都不能保证它还是原来的形状。

export type CardMetric = {
  name: string;
  kind: string;
  fromValue: string;
  toValue: string;
  delta: string;
  evidenceLevel: string;
  method: string;
};

export type CardDiff = {
  type: string;
  field: string;
  before: string;
  after: string;
  note: string;
};

export type CardOption = {
  label: string;
  action: string;
  targetAtomId: string | null;
  consequence: string;
};

export type CardUnit = {
  types: string[];
  subjectHint: string;
  resolvedFromContext: boolean;
  status: string | null;
  metrics: CardMetric[];
  pendingMetrics: string[];
  situation: string;
  task: string;
  actionsAdd: string[];
  mustSay: string[];
  neverSay: string[];
  roleFraming: string;
  userWords: string;
};

export type ConfirmCardView = {
  draftId: string;
  intent: "CREATE" | "UPDATE" | "ASK";
  targetAtomId: string | null;
  targetTitle: string;
  parentAtomId: string | null;
  confidence: number;
  aiNote: string;
  diff: CardDiff[];
  options: CardOption[];
  recallDegraded: boolean;
  imagePath: string | null;
  unit: CardUnit | null;
};

export function confirmCard(payload: Json): ConfirmCardView | null {
  const o = obj(payload);
  const draftId = str(o.draft_id);
  if (draftId === "") return null;

  const intent = o.intent;
  if (intent !== "CREATE" && intent !== "UPDATE" && intent !== "ASK") return null;

  return {
    draftId,
    intent,
    targetAtomId: nullableStr(o.target_atom_id),
    targetTitle: str(o.target_title),
    parentAtomId: nullableStr(o.parent_atom_id),
    confidence: typeof o.confidence === "number" ? o.confidence : 0,
    aiNote: str(o.ai_note),
    diff: list(o.diff).map((raw) => {
      const d = obj(raw);
      return {
        type: str(d.type),
        field: str(d.field),
        before: str(d.before),
        after: str(d.after),
        note: str(d.note),
      };
    }),
    options: list(o.options).map((raw) => {
      const x = obj(raw);
      return {
        label: str(x.label),
        action: str(x.action),
        targetAtomId: nullableStr(x.target_atom_id),
        consequence: str(x.consequence),
      };
    }),
    recallDegraded: o.recall_degraded === true,
    imagePath: nullableStr(o.image_path),
    unit: cardUnit(o.unit),
  };
}

function cardUnit(v: Json | undefined): CardUnit | null {
  if (v === undefined || v === null) return null;
  const u = obj(v);
  const content = obj(u.content_patch);
  const guards = obj(u.guards_patch);
  return {
    types: strList(u.types),
    subjectHint: str(u.subject_hint),
    resolvedFromContext: u.resolved_from_context === true,
    status: nullableStr(u.status),
    metrics: list(u.metrics).map((raw) => {
      const m = obj(raw);
      return {
        name: str(m.name),
        kind: str(m.kind),
        fromValue: str(m.from_value),
        toValue: str(m.to_value),
        delta: str(m.delta),
        evidenceLevel: str(m.evidence_level),
        method: str(m.method),
      };
    }),
    pendingMetrics: strList(u.pending_metrics),
    situation: str(content.situation),
    task: str(content.task),
    actionsAdd: strList(content.actions_add),
    mustSay: strList(guards.must_say),
    neverSay: strList(guards.never_say),
    roleFraming: str(guards.role_framing),
    userWords: str(u.user_words),
  };
}

function str(v: Json | undefined): string {
  return typeof v === "string" ? v : "";
}

function nullableStr(v: Json | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function list(v: Json | undefined): Json[] {
  return Array.isArray(v) ? v : [];
}

function strList(v: Json | undefined): string[] {
  return list(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");
}
