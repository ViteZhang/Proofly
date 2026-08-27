// =============================================================
// Proofly · 随手记链路的输出结构
//
// 松紧口径与 ingest/schema.ts 一致：
// 结构性字段（intent）严格，错了必须重试；描述性字段给默认值。
// =============================================================

import { z } from "zod";

import { metricSchema, pass2Schema } from "@/lib/ingest/schema";

// ---- Stage A · 会话意图分类 ----

export const CHAT_INTENTS = ["RECORD", "QUERY", "CHITCHAT", "AMBIGUOUS"] as const;

export const stageASchema = z.object({
  intent: z.enum(CHAT_INTENTS),
  clarify: z.string().default(""),
  query_subject: z.string().default(""),
});

export type ChatIntent = (typeof CHAT_INTENTS)[number];
export type StageAResult = z.output<typeof stageASchema>;

// ---- Stage B · 拆分与结构化 ----

export const UNIT_TYPES = [
  "status_update",
  "metric_add",
  "content_update",
  "new_experience",
  "guard_update",
] as const;

// 一句话最多拆 4 个单元（方案 4.2）。超出的部分进 overflow_note，
// 由代码截断而不是指望模型自觉——它一兴奋能拆出十个来。
export const MAX_UNITS = 4;

const STATUS = z.enum(["concept", "design_done", "in_dev", "shipped", "sunset"]);

// 模型会写 null、"null"、""，三种都当没说状态
const nullableStatus = z
  .union([STATUS, z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const t = String(v).trim();
    return STATUS.safeParse(t).success ? (t as z.infer<typeof STATUS>) : null;
  })
  .default(null);

export const unitSchema = z.object({
  types: z.array(z.enum(UNIT_TYPES)).default([]),
  subject_hint: z.string().default(""),
  resolved_from_context: z.coerce.boolean().default(false),
  status: nullableStatus,
  metrics: z.array(metricSchema).default([]),
  pending_metrics: z.array(z.string()).default([]),
  content_patch: z
    .object({
      situation: z.string().default(""),
      task: z.string().default(""),
      actions_add: z.array(z.string()).default([]),
    })
    .default({ situation: "", task: "", actions_add: [] }),
  guards_patch: z
    .object({
      must_say: z.array(z.string()).default([]),
      never_say: z.array(z.string()).default([]),
      role_framing: z.string().default(""),
    })
    .default({ must_say: [], never_say: [], role_framing: "" }),
  // 「结构与 Step 2 抽取输出的原子结构一致但可留空大量字段」——
  // pass2Schema 每个字段都有默认值，{} 也能过，正好是这个意思。
  new_experience: z.union([pass2Schema, z.null()]).default(null),
  user_words: z.string().default(""),
});

export const stageBSchema = z.object({
  units: z.array(unitSchema).default([]),
  overflow_note: z.string().default(""),
});

export type ChangeUnit = z.output<typeof unitSchema>;
export type StageBResult = z.output<typeof stageBSchema>;

// ---- Stage C · 定位与差异 ----
//
// 与 Step 2 的 pass3Schema 只差一处：diff 多了 evidence_change。
// 不去改那个——Step 2 的提示词里没有这一类，放宽了等于允许它多输出一种。

const nullableId = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const t = v.trim();
    return t === "" || t.toLowerCase() === "null" ? null : t;
  });

export const chatDiffEntry = z.object({
  type: z.enum([
    "field_change",
    "metric_add",
    "pending_resolved",
    "status_change",
    "evidence_change",
  ]),
  field: z.string().default(""),
  before: z.string().default(""),
  after: z.string().default(""),
  note: z.string().default(""),
});

export const chatOptionEntry = z.object({
  label: z.string().default(""),
  action: z.enum(["CREATE", "UPDATE", "MERGE"]).default("CREATE"),
  target_atom_id: nullableId.default(null),
  consequence: z.string().default(""),
});

export const stageCSchema = z.object({
  intent: z.enum(["CREATE", "UPDATE", "ASK"]),
  target_atom_id: nullableId.default(null),
  parent_atom_id: nullableId.default(null),
  confidence: z.coerce.number().min(0).max(1),
  diff: z.array(chatDiffEntry).default([]),
  options: z.array(chatOptionEntry).default([]),
  ai_note: z.string().default(""),
});

export type ChatDiffEntry = z.output<typeof chatDiffEntry>;
export type ChatOptionEntry = z.output<typeof chatOptionEntry>;
export type StageCResult = z.output<typeof stageCSchema>;
