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
