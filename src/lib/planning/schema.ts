// =============================================================
// Proofly · 行动生成的输出形状
// 校验失败会触发 callLLM 的重试，所以这里的约束就是「模型必须交出什么」。
//
// 注意没有 impact 字段：impact 由代码算。模型即使多给了这个键，
// zod 也会把它剥掉 —— 让它连进入代码的机会都没有。
// =============================================================

import { z } from "zod";
import { MAX_TASKS_OUT } from "./config";

export const ACTION_TYPES = [
  "collect_data",
  "build_evidence",
  "rewrite_narrative",
  "learn",
] as const;

export const plannedTaskSchema = z.object({
  title: z.string().trim().min(1),
  rationale: z.string().trim().default(""),
  action_type: z.enum(ACTION_TYPES),
  estimated_hours: z.number().min(0).default(1),
  deliverable: z.string().trim().default(""),
  anchor_atom_id: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  gap_ids: z.array(z.string().trim()).default([]),
});

export const planSchema = z.object({
  // 上限 10 条是方案的硬要求，但多给两条不该让整次生成失败 ——
  // 收下再截断，截断在 plan-actions 里做，那边能顺带记一句日志。
  tasks: z.array(plannedTaskSchema).max(MAX_TASKS_OUT * 2),
  dropped_gap_ids: z.array(z.string().trim()).default([]),
});

export type PlannedTask = z.infer<typeof plannedTaskSchema>;
