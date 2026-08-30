// =============================================================
// Proofly · JD 解析与匹配判定的输出形状
// 校验失败会触发 callLLM 的重试，所以这里的约束就是「模型必须交出什么」。
// =============================================================

import { z } from "zod";

export const KINDS = ["hard", "implicit", "nice_to_have"] as const;
export const COVERAGES = ["full", "partial", "weak", "none"] as const;

// 拆分后 8–15 条，超过 18 条说明拆得过细。上限放到 30：
// 宁可收下再让人删，也不要因为模型多拆两条就整份 JD 解析失败。
export const MAX_REQUIREMENTS = 30;

export const requirementSchema = z.object({
  index: z.number().int().min(1),
  text: z.string().trim().min(1),
  raw_phrase: z.string().trim().default(""),
  kind: z.enum(KINDS),
  is_structural: z.boolean().default(false),
  derived_from: z.string().trim().nullish().transform((v) => v || null),
});

export const parseSchema = z.array(requirementSchema).min(1).max(MAX_REQUIREMENTS);

export type ParsedRequirement = z.infer<typeof requirementSchema>;

// ---- 4.2 匹配判定 ----

export const matchResultSchema = z.object({
  requirement_index: z.number().int().min(1),
  coverage: z.enum(COVERAGES),
  // 最多 3 条。模型多给了就截断，不为这个判整次调用失败。
  matched_atom_ids: z.array(z.string()).default([]),
  reason: z.string().trim().default(""),
  related_skill_labels: z.array(z.string()).default([]),
});

export const matchSchema = z.object({
  results: z.array(matchResultSchema),
});

export type MatchResult = z.infer<typeof matchResultSchema>;

export const MAX_MATCHED_ATOMS = 3;
