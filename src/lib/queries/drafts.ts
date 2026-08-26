// =============================================================
// Proofly · 草稿队列的读取
//
// 分组顺序是固定的：需你判断 → 更新 → 新增。
// 需要动脑的排前面，闭着眼能过的排后面。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

import { toDraft, type ReviewDraft } from "./draft-shape";

export type { ReviewDraft };

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

