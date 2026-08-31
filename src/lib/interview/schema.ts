// =============================================================
// Proofly · 面试题模型输出校验
//
// 与简历那边同样的宽松策略：枚举列（probe_type / difficulty / kind）
// 收字符串再在代码里归一。一个拼错的枚举值让整次 strong 档调用作废重试，
// 是拿钱换洁癖 —— 何况归一之后信息一点没丢。
//
// 唯独 question 不给默认值：没有题干的题不是残缺，是不存在。
// =============================================================

import { z } from "zod";

export const answerPointSchema = z.object({
  label: z.string().default(""),
  content: z.string().default(""),
});

export const probeQuestionSchema = z.object({
  question: z.string().min(1),
  probe_type: z.string().default(""),
  from_atom_id: z.string().default(""),
  from_existing_probe: z.boolean().default(false),
  answer_outline: z.array(answerPointSchema).default([]),
  dont_do: z.string().default(""),
  data_gap_hint: z.string().default(""),
});

export const probeSetSchema = z.object({
  // 上限给到 40：提示词要 15–20 题，超出部分在代码里截断，不在这里失败。
  questions: z.array(probeQuestionSchema).max(40),
});

export const caseQuestionSchema = z.object({
  kind: z.string().default(""),
  question: z.string().min(1),
  difficulty: z.string().default(""),
  answer_outline: z.array(answerPointSchema).default([]),
  related_atom_ids: z.array(z.string()).default([]),
  why_this_question: z.string().default(""),
});

export const caseSetSchema = z.object({
  questions: z.array(caseQuestionSchema).max(40),
});

export type PlannedProbe = z.infer<typeof probeQuestionSchema>;
export type PlannedCase = z.infer<typeof caseQuestionSchema>;
export type AnswerPoint = z.infer<typeof answerPointSchema>;

const PROBE_TYPES = ["effect", "attribution", "decision", "boundary", "role", "progress"] as const;
const DIFFICULTIES = ["basic", "standard", "deep"] as const;
const CASE_KINDS = ["product_case", "ai_tech", "data_case"] as const;

export function normalizeProbeType(s: string): (typeof PROBE_TYPES)[number] | null {
  const v = s.trim().toLowerCase();
  return (PROBE_TYPES as readonly string[]).includes(v)
    ? (v as (typeof PROBE_TYPES)[number])
    : null;
}

export function normalizeDifficulty(s: string): (typeof DIFFICULTIES)[number] {
  const v = s.trim().toLowerCase();
  // 认不出来就按常规档收。落进 standard 比丢掉一道题好。
  return (DIFFICULTIES as readonly string[]).includes(v)
    ? (v as (typeof DIFFICULTIES)[number])
    : "standard";
}

/** 案例题的三类。认不出来返回 null，由调用方丢弃并记 warning。 */
export function normalizeCaseKind(s: string): (typeof CASE_KINDS)[number] | null {
  const v = s.trim().toLowerCase();
  return (CASE_KINDS as readonly string[]).includes(v)
    ? (v as (typeof CASE_KINDS)[number])
    : null;
}
