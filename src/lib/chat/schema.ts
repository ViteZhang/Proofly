// =============================================================
// Proofly · 随手记链路的输出结构
//
// 松紧口径与 ingest/schema.ts 一致：
// 结构性字段（intent）严格，错了必须重试；描述性字段给默认值。
// =============================================================

import { z } from "zod";

// ---- Stage A · 会话意图分类 ----

export const CHAT_INTENTS = ["RECORD", "QUERY", "CHITCHAT", "AMBIGUOUS"] as const;

export const stageASchema = z.object({
  intent: z.enum(CHAT_INTENTS),
  clarify: z.string().default(""),
  query_subject: z.string().default(""),
});

export type ChatIntent = (typeof CHAT_INTENTS)[number];
export type StageAResult = z.output<typeof stageASchema>;
