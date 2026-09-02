// =============================================================
// C8 模型输出校验
//
// 与别处同样的宽松策略：severity 收字符串再在代码里归一。一个拼错的
// 枚举值让整次 strong 档调用作废，是拿钱换洁癖。
//
// 唯独 subject 与 statements 不给默认值：说不清矛盾的是什么、也没有
// 两处原文的「矛盾」，用户没法核对，等于没报。
// =============================================================

import { z } from "zod";

export const statementSchema = z.object({
  source: z.string().default(""),
  claim: z.string().default(""),
});

export const conflictSchema = z.object({
  subject: z.string().min(1),
  severity: z.string().default("low"),
  statements: z.array(statementSchema).default([]),
  why_conflict: z.string().default(""),
  suggested_action: z.string().default(""),
});

export const conflictSetSchema = z.object({
  conflicts: z.array(conflictSchema).max(20),
});

export type PlannedConflict = z.infer<typeof conflictSchema>;
