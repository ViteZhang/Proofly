"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/domain";
import { refreshAtomEmbedding } from "@/lib/ingest/embedding";
import { diffEntry, pass2Schema } from "@/lib/ingest/schema";
import { getProofSummary } from "@/lib/queries/atoms";
import { BULK_THRESHOLD, settleIngestJob } from "@/lib/queries/drafts";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

// 入库统一走数据库函数 commit_draft：一条经历带指标、护栏、技能、来源
// 四张表，必须在一个事务里，中途失败不能留半条。

const uuid = z.uuid();

export type CommitResult = {
  /** 「已入库 · 证明度 46% → 54%」里的两个数 */
  scoreBefore: number;
  scoreAfter: number;
  atomId: string;
  /** 队列里还剩几条 */
  remaining: number;
  jobCommitted: boolean;
};

const acceptSchema = z.object({
  draftId: z.uuid(),
  /** 用户在卡片里改过就传改后的；没改传 null，用草稿里的原样 */
  atom: z.unknown().nullable(),
  /** ASK 卡片选了「这是新经历」时指定父级 */
  parentAtomId: z.uuid().nullable(),
  /** 把 UPDATE 转成 CREATE */
  asCreate: z.boolean(),
});

export async function acceptDraft(
  input: z.input<typeof acceptSchema>,
): Promise<ActionResult<CommitResult>> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return fail("这条草稿的信息不完整，刷新页面再试");
  const { draftId, atom: edited, parentAtomId, asCreate } = parsed.data;

  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, intent, target_atom_id, payload, diff, review_status, ingest_job_id")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return fail("找不到这条草稿");
  if (draft.review_status !== "pending") return fail("这条已经处理过了");

  const payload = obj(draft.payload);
  const source = edited ?? payload.atom;
  const atomParsed = pass2Schema.safeParse(source);
  if (!atomParsed.success) return fail("内容结构不对，改一下再存");

  const intent = asCreate || draft.intent === "CREATE" ? "CREATE" : "UPDATE";

  // 选了父级就是能力点。留成 project 会在树里变成「项目套项目」。
  const parent =
    parentAtomId ??
    (typeof payload.parent_atom_id === "string" ? payload.parent_atom_id : null);
  const atomToWrite =
    intent === "CREATE" && parent !== null && atomParsed.data.level === "project"
      ? { ...atomParsed.data, level: "capability_slice" as const, children: [] }
      : atomParsed.data;
  if (intent === "UPDATE" && !draft.target_atom_id) {
    return fail("这条没有明确要更新哪一条，选「这是新经历」或者自己指一条");
  }

  const before = await getProofSummary();

  const { data: sourceDocId } = await supabase
    .from("ingest_jobs")
    .select("source_doc_id")
    .eq("id", draft.ingest_job_id)
    .maybeSingle();

  const { data: atomId, error } = await supabase.rpc("commit_draft", {
    p_draft_id: draftId,
    p_atom: atomToWrite as unknown as Json,
    p_intent: intent,
    p_target: intent === "UPDATE" ? draft.target_atom_id : null,
    p_parent: intent === "CREATE" ? parent : null,
    p_source_doc_id: sourceDocId?.source_doc_id ?? null,
    p_diff: (z.array(diffEntry).safeParse(obj(draft.diff).entries).data ?? []) as unknown as Json,
    p_edited: edited !== null,
  });

  if (error || !atomId) return fail(dbError(error?.message ?? "未知原因"));

  // 向量在后台补，不让用户等
  after(() => refreshAtomEmbedding(atomId));

  const after_ = await getProofSummary();
  const rest = await settleIngestJob(draft.ingest_job_id);

  revalidatePath("/app/library");
  revalidatePath("/");

  return ok({
    scoreBefore: before.score,
    scoreAfter: after_.score,
    atomId,
    remaining: rest.remaining,
    jobCommitted: rest.committed,
  });
}

export async function rejectDraft(draftId: string): Promise<ActionResult<CommitResult>> {
  if (!uuid.safeParse(draftId).success) return fail("草稿标识不对");
  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, ingest_job_id, review_status")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return fail("找不到这条草稿");
  if (draft.review_status !== "pending") return fail("这条已经处理过了");

  const { error } = await supabase
    .from("drafts")
    .update({ review_status: "rejected" })
    .eq("id", draftId);
  if (error) return fail(`没能丢掉这条：${error.message}`);

  const score = await getProofSummary();
  const rest = await settleIngestJob(draft.ingest_job_id);
  return ok({
    scoreBefore: score.score,
    scoreAfter: score.score,
    atomId: "",
    remaining: rest.remaining,
    jobCommitted: rest.committed,
  });
}

/** 一键接受：只对 CREATE 且置信度 ≥ 0.9。更新永远没有批量。 */
export async function acceptAllCreates(jobId: string): Promise<ActionResult<CommitResult>> {
  if (!uuid.safeParse(jobId).success) return fail("作业标识不对");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("drafts")
    .select("id, confidence")
    .eq("ingest_job_id", jobId)
    .eq("review_status", "pending")
    .eq("intent", "CREATE")
    .gte("confidence", BULK_THRESHOLD);

  const before = await getProofSummary();
  let last: string | null = null;
  for (const r of rows ?? []) {
    const res = await acceptDraft({
      draftId: r.id,
      atom: null,
      parentAtomId: null,
      asCreate: false,
    });
    if (res.ok) last = res.data.atomId;
  }
  const after_ = await getProofSummary();
  const rest = await settleIngestJob(jobId);

  return ok({
    scoreBefore: before.score,
    scoreAfter: after_.score,
    atomId: last ?? "",
    remaining: rest.remaining,
    jobCommitted: rest.committed,
  });
}

function obj(v: Json): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, Json | undefined>)
    : {};
}

function dbError(msg: string): string {
  if (msg.includes("只允许两层嵌套")) return "能力点不能再挂子级，先选一个项目做父级";
  if (msg.includes("更新目标为空")) return "这条没有明确要更新哪一条";
  if (msg.includes("23505")) return "这条已经存在了";
  return `入库失败：${msg}`;
}
