// =============================================================
// Proofly · 草稿队列的读取
//
// 分组顺序是固定的：需你判断 → 更新 → 新增。
// 需要动脑的排前面，闭着眼能过的排后面。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import type { DraftIntent, Json } from "@/types/database";
import {
  diffEntry,
  optionEntry,
  pass2Schema,
  type DiffEntry,
  type ExtractedAtom,
  type OptionEntry,
} from "@/lib/ingest/schema";
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
};

export type ProjectOption = { id: string; title: string; org: string | null };

export type ReviewQueue = {
  jobId: string;
  status: string;
  ask: ReviewDraft[];
  update: ReviewDraft[];
  create: ReviewDraft[];
  /** 还没处理的总数 */
  pending: number;
  /** 可以一键接受的新增条数（CREATE 且置信度 ≥ 0.9） */
  bulkCount: number;
  projects: ProjectOption[];
  docName: string | null;
};

export const BULK_THRESHOLD = 0.9;

export async function getReviewQueue(jobId: string): Promise<ReviewQueue | null> {
  if (!z.uuid().safeParse(jobId).success) return null;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("ingest_jobs")
    .select("id, status, source_doc_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const { data: rows } = await supabase
    .from("drafts")
    .select("id, intent, confidence, ai_note, payload, diff, target_atom_id, created_at")
    .eq("ingest_job_id", jobId)
    .eq("review_status", "pending")
    .order("created_at", { ascending: true });

  const drafts = (rows ?? []).map(toDraft).filter((d): d is ReviewDraft => d !== null);

  // UPDATE 卡片要显示改的是哪一条，把标题捞出来
  const targetIds = [...new Set(drafts.map((d) => d.targetAtomId).filter((s): s is string => !!s))];
  if (targetIds.length > 0) {
    const { data: targets } = await supabase
      .from("atoms")
      .select("id, title")
      .in("id", targetIds);
    const byId = new Map((targets ?? []).map((t) => [t.id, t.title]));
    for (const d of drafts) {
      if (d.targetAtomId) d.targetTitle = byId.get(d.targetAtomId) ?? null;
    }
  }

  // 「这是新经历」要重新选父级，列出所有项目
  const { data: projects } = await supabase
    .from("atoms")
    .select("id, title, org")
    .eq("level", "project")
    .order("sort_order", { ascending: true });

  let docName: string | null = null;
  if (job.source_doc_id) {
    const { data: doc } = await supabase
      .from("source_docs")
      .select("filename")
      .eq("id", job.source_doc_id)
      .maybeSingle();
    docName = doc?.filename ?? null;
  }

  const ask = drafts.filter((d) => d.intent === "ASK");
  const update = drafts.filter((d) => d.intent === "UPDATE");
  const create = drafts.filter((d) => d.intent === "CREATE");

  return {
    jobId,
    status: job.status,
    ask,
    update,
    create,
    pending: drafts.length,
    bulkCount: create.filter((d) => (d.confidence ?? 0) >= BULK_THRESHOLD).length,
    projects: projects ?? [],
    docName,
  };
}

type Row = {
  id: string;
  intent: DraftIntent;
  confidence: number | null;
  ai_note: string | null;
  payload: Json;
  diff: Json;
  target_atom_id: string | null;
};

function toDraft(r: Row): ReviewDraft | null {
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
  };
}

function obj(v: Json): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, Json | undefined>)
    : {};
}
