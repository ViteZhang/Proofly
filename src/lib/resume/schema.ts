// =============================================================
// Proofly · 简历生成的模型输出校验
//
// 两处刻意宽松：section 与 template_used 收的是字符串，不是枚举。
// 枚举校验失败会让整次调用作废重试，而这两项本来就能在代码里归一 ——
// 为一个能修的字段重跑一次 strong 档，是拿钱换洁癖。
//
// delta 的 type 同理：不认识的类型在代码里丢弃并记 warning，
// 而不是让一整份增量方案作废。
// =============================================================

import { z } from "zod";

export const baselineBlockSchema = z.object({
  atom_id: z.string(),
  section: z.string().default(""),
  title: z.string().default(""),
  meta: z.string().default(""),
  summary: z.string().default(""),
  bullets: z.array(z.string()).default([]),
  template_used: z.string().default(""),
  must_say_covered: z.array(z.string()).default([]),
});

export const baselineSchema = z.object({
  headline: z.string().default(""),
  // 上限给得比实际经历数宽：超出部分在代码里截断，不在这里失败。
  blocks: z.array(baselineBlockSchema).max(60),
  skills: z.array(z.string()).default([]),
});

export type PlannedBlock = z.infer<typeof baselineBlockSchema>;
export type PlannedBaseline = z.infer<typeof baselineSchema>;

export const deltaItemSchema = z.object({
  type: z.string(),
  target_block_id: z.string().default(""),
  before: z.string().default(""),
  after: z.string().default(""),
  reason: z.string().default(""),
  source_atom_id: z.string().default(""),
  source_ref: z.string().default(""),
});

export const deltaPlanSchema = z.object({
  deltas: z.array(deltaItemSchema).max(40),
  unmatched_requirements: z
    .array(
      z.object({
        requirement_index: z.number(),
        note: z.string().default(""),
      }),
    )
    .default([]),
});

export type PlannedDelta = z.infer<typeof deltaItemSchema>;
export type PlannedDeltaSet = z.infer<typeof deltaPlanSchema>;
