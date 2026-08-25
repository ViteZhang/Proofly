// =============================================================
// Proofly · 三段提示词的输出结构
//
// 校验的松紧是有讲究的：
// - 结构性字段（intent / kind / evidence_level）严格，错了必须重试
// - 描述性字段给默认值，模型漏填一个空字符串不值得再烧一次钱
// - 数值一律 coerce，模型偶尔会把 "0.82" 写成字符串
// =============================================================

import { z } from "zod";

// ---- Pass 1 ----

export const pass1Item = z.object({
  index: z.coerce.number().int(),
  title: z.string().default(""),
  org: z.string().default(""),
  start_marker: z.string().default(""),
  end_marker: z.string().default(""),
  rough_char_count: z.coerce.number().int().default(0),
  note: z.string().default(""),
});

export const pass1Schema = z.array(pass1Item);
export type Pass1Item = z.output<typeof pass1Item>;

// ---- Pass 2 ----

const LEVEL = z.enum(["project", "capability_slice"]);
const CONTEXT = z.enum(["employment", "side_project", "volunteer", "community"]);
const STATUS = z.enum(["concept", "design_done", "in_dev", "shipped", "sunset"]);
const KIND = z.enum(["outcome", "output"]);
const EVIDENCE = z.enum(["measured", "estimated", "designed_only"]);

// 模型可能给 "" / "null" / "2024-03" / "2024-03-01"
const monthish = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const s = v.trim();
    if (s === "" || s.toLowerCase() === "null") return null;
    const m = s.match(/^(\d{4})[-/.](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
  });

export const metricSchema = z.object({
  name: z.string().min(1),
  kind: KIND.default("outcome"),
  from_value: z.string().default(""),
  to_value: z.string().default(""),
  delta: z.string().default(""),
  evidence_level: EVIDENCE.default("measured"),
  method: z.string().default(""),
});

export const guardsSchema = z.object({
  must_say: z.array(z.string()).default([]),
  never_say: z.array(z.string()).default([]),
  role_framing: z.string().default(""),
  probes: z
    .array(
      z.object({
        q: z.string().default(""),
        a_outline: z.string().default(""),
      }),
    )
    .default([]),
});

const atomCore = {
  title: z.string().default(""),
  level: LEVEL.default("project"),
  context: CONTEXT.default("employment"),
  org: z.string().default(""),
  role: z.string().default(""),
  period_start: monthish.default(null),
  period_end: monthish.default(null),
  status: STATUS.default("design_done"),
  situation: z.string().default(""),
  task: z.string().default(""),
  actions: z.array(z.string()).default([]),
  metrics: z.array(metricSchema).default([]),
  pending_metrics: z.array(z.string()).default([]),
  guards: guardsSchema.default({
    must_say: [],
    never_say: [],
    role_framing: "",
    probes: [],
  }),
  skills: z.array(z.string()).default([]),
  source_excerpt: z.string().default(""),
  ai_note: z.string().default(""),
};

export const childSchema = z.object(atomCore);
export const pass2Schema = z.object({
  ...atomCore,
  children: z.array(childSchema).default([]),
});

export type ExtractedAtom = z.output<typeof pass2Schema>;
export type ExtractedChild = z.output<typeof childSchema>;

// ---- Pass 3 ----

const nullableId = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const s = v.trim();
    return s === "" || s.toLowerCase() === "null" ? null : s;
  });

export const diffEntry = z.object({
  type: z.enum(["field_change", "metric_add", "pending_resolved", "status_change"]),
  field: z.string().default(""),
  before: z.string().default(""),
  after: z.string().default(""),
  note: z.string().default(""),
});

export const optionEntry = z.object({
  label: z.string().default(""),
  action: z.enum(["CREATE", "UPDATE", "MERGE"]).default("CREATE"),
  target_atom_id: nullableId.default(null),
  consequence: z.string().default(""),
});

export const pass3Schema = z.object({
  intent: z.enum(["CREATE", "UPDATE", "ASK"]),
  target_atom_id: nullableId.default(null),
  parent_atom_id: nullableId.default(null),
  confidence: z.coerce.number().min(0).max(1),
  diff: z.array(diffEntry).default([]),
  options: z.array(optionEntry).default([]),
  ai_note: z.string().default(""),
});

export type Verdict = z.output<typeof pass3Schema>;
export type DiffEntry = z.output<typeof diffEntry>;
export type OptionEntry = z.output<typeof optionEntry>;
