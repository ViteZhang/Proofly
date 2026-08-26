// =============================================================
// Proofly · 一行草稿 → 界面用的形状
//
// 这里不碰数据库、不认识 Next，所以脚本能直接 import 来测。
// drafts.ts 只管取数，取回来的每一行都过这里。
// =============================================================

import type { DraftIntent, Json } from "@/types/database";
import {
  diffEntry,
  optionEntry,
  pass2Schema,
  type DiffEntry,
  type ExtractedAtom,
  type OptionEntry,
} from "@/lib/ingest/schema";
import { providersFor } from "@/lib/llm/config";
import { z } from "zod";

export type ReviewDraft = {
  id: string;
  intent: DraftIntent;
  confidence: number | null;
  aiNote: string;
  atom: ExtractedAtom;
  parentAtomId: string | null;
  targetAtomId: string | null;
  targetTitle: string | null;
  diff: DiffEntry[];
  options: OptionEntry[];
  /** Pass 1 的标记没对上，片段是粗切的——值得让人多看一眼原文 */
  locateFuzzy: boolean;
  /** 向量召回不可用，Pass 3 是在退化模式下判的 */
  recallDegraded: boolean;
  /** 能力点超过 8 个 —— 切得太细，值得人工看一眼 */
  tooManyChildren: boolean;
  /** 这条是哪家抽的。老草稿没记，是 null。 */
  servedBy: { extract: string; verdict: string; isHead: boolean } | null;
};

export type DraftRow = {
  id: string;
  intent: DraftIntent;
  confidence: number | null;
  ai_note: string | null;
  target_atom_id: string | null;
  payload: Json;
  diff: Json;
};

export function toDraft(r: DraftRow): ReviewDraft | null {
  const payload = obj(r.payload);
  const parsed = pass2Schema.safeParse(payload.atom);
  if (!parsed.success) return null; // 结构坏掉的草稿不显示，也不让页面白屏

  return {
    id: r.id,
    intent: r.intent,
    confidence: r.confidence,
    aiNote: r.ai_note ?? "",
    atom: parsed.data,
    parentAtomId: typeof payload.parent_atom_id === "string" ? payload.parent_atom_id : null,
    targetAtomId: r.target_atom_id,
    targetTitle: null,
    diff: z.array(diffEntry).safeParse(obj(r.diff).entries).data ?? [],
    options: z.array(optionEntry).safeParse(payload.options).data ?? [],
    locateFuzzy: payload.locate_fuzzy === true,
    recallDegraded: payload.recall_degraded === true,
    tooManyChildren: payload.too_many_children === true,
    servedBy: servedBy(payload.served_by),
  };
}

// 「哪家抽的」本身不值钱，「是不是主用那家」才值钱：换了家就意味着
// 这条是备用模型的产出，值得多看一眼。主用是谁按当前配置算，不写死。
function servedBy(v: Json | undefined): ReviewDraft["servedBy"] {
  const o = obj(v ?? null);
  const extract = typeof o.extract === "string" ? o.extract : "";
  const verdict = typeof o.verdict === "string" ? o.verdict : "";
  if (extract === "" || verdict === "") return null;

  const head = providersFor("strong")[0]?.name ?? "";
  return { extract, verdict, isHead: extract === head && verdict === head };
}

function obj(v: Json): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, Json | undefined>)
    : {};
}
