"use server";

import { after } from "next/server";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/domain";
import {
  markCandidatePending,
  parseCandidates,
  retryCandidate,
  runJob,
  type Candidate,
} from "@/lib/ingest/pipeline";
import { createClient } from "@/lib/supabase/server";

// 作业跑在 after() 里：响应先回给页面，活在后台接着做。
// 所以关掉页面作业不会停，重新打开时靠轮询把进度捡回来。

const uuid = z.uuid();

// 心跳超过这么久没动，就当跑作业的进程已经没了。
// 阈值要大于「单条最慢一次跑完」：Pass 2 实测最慢 1m31s，加上 Pass 3，
// 一条最坏 3 分钟左右。取 6 分钟，宁可晚一点发现，也别把还活着的作业重复跑。
const STALE_MS = 6 * 60_000;

export type JobProgress = {
  id: string;
  status: "extracting" | "awaiting_review" | "committed" | "discarded";
  stage: "segmenting" | "extracting" | "finishing" | null;
  current: number;
  total: number;
  draftCount: number;
  errorMessage: string | null;
  candidates: Candidate[];
  /** 界面上直接显示这句，必须是真实数字 */
  headline: string;
  /** 作业跑完了，可以去校对了 */
  settled: boolean;
  /** 还标着 extracting，但心跳早停了——跑它的进程多半已经没了 */
  stalled: boolean;
};

export async function startJob(sourceDocId: string): Promise<ActionResult<string>> {
  if (!uuid.safeParse(sourceDocId).success) return fail("文档标识不对");

  const supabase = await createClient();

  // 同一份文档已经有在跑或待校对的作业，就接着用，别重复烧钱
  const { data: existing } = await supabase
    .from("ingest_jobs")
    .select("id")
    .eq("source_doc_id", sourceDocId)
    .in("status", ["extracting", "awaiting_review"])
    .maybeSingle();
  if (existing) {
    after(() => runJob(existing.id));
    return ok(existing.id);
  }

  const { data, error } = await supabase
    .from("ingest_jobs")
    .insert({
      input_type: "upload",
      source_doc_id: sourceDocId,
      status: "extracting",
      progress_stage: "segmenting",
      heartbeat_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return fail(`没能建起抽取作业：${error?.message ?? "未知原因"}`);

  after(() => runJob(data.id));
  return ok(data.id);
}

export async function getJobProgress(jobId: string): Promise<ActionResult<JobProgress>> {
  if (!uuid.safeParse(jobId).success) return fail("作业标识不对");

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("ingest_jobs")
    .select(
      "id, status, progress_stage, progress_current, progress_total, error_message, candidates, heartbeat_at, created_at",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return fail("找不到这个作业");

  // 只数还没处理的。数全部的话，确认了两条再回来，
  // 界面还写着「抽出 5 条，等你确认」，按钮点进去队列里只剩 3 条。
  const { count } = await supabase
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("ingest_job_id", jobId)
    .eq("review_status", "pending");

  const candidates = parseCandidates(job.candidates);
  const current = job.progress_current ?? 0;
  const total = job.progress_total ?? 0;
  const drafts = count ?? 0;
  const settled = job.status !== "extracting";

  // 没有心跳的（这个字段加进来之前建的作业）拿建作业时间顶上，
  // 否则这种作业永远判不出断线，会一直挂在那儿。
  const beat = Date.parse(job.heartbeat_at ?? job.created_at ?? "");
  const stalled = !settled && Number.isFinite(beat) && Date.now() - beat > STALE_MS;

  return ok({
    id: job.id,
    status: job.status,
    stage: job.progress_stage,
    current,
    total,
    draftCount: drafts,
    errorMessage: job.error_message,
    candidates,
    settled,
    stalled,
    headline: headline(job.progress_stage, job.status, current, total, drafts),
  });
}

function headline(
  stage: JobProgress["stage"],
  status: JobProgress["status"],
  current: number,
  total: number,
  drafts: number,
): string {
  if (status !== "extracting") {
    return drafts === 0 ? "这份文档里没找到经历" : `抽出 ${drafts} 条，等你确认`;
  }
  if (stage === "segmenting" || total === 0) return "正在通读文档…";
  return `已抽出 ${current} / ${total} 条`;
}

export async function retryOne(jobId: string, index: number): Promise<ActionResult<null>> {
  if (!uuid.safeParse(jobId).success) return fail("作业标识不对");
  if (!Number.isInteger(index)) return fail("条目序号不对");
  // 先同步把状态推回 extracting，再把活扔到后台。
  // 顺序反了前端会以为作业已经结束，停掉轮询。
  const okMark = await markCandidatePending(jobId, index);
  if (!okMark) return fail("找不到这一条");
  after(() => retryCandidate(jobId, index));
  return ok(null);
}

/** Pass 1 失败后整个作业重来。已有的草稿先清掉，别留半截。 */
export async function restartJob(jobId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(jobId).success) return fail("作业标识不对");
  const supabase = await createClient();
  await supabase.from("drafts").delete().eq("ingest_job_id", jobId);
  const { error } = await supabase
    .from("ingest_jobs")
    .update({
      status: "extracting",
      progress_stage: "segmenting",
      progress_current: 0,
      progress_total: 0,
      error_message: null,
      candidates: [],
    })
    .eq("id", jobId);
  if (error) return fail(`重来失败：${error.message}`);
  after(() => runJob(jobId));
  return ok(null);
}

/**
 * 接着上次继续跑。已经 done 的候选不会重跑（runJob 本身可重入）。
 *
 * 用心跳做独占认领：只有心跳「还是旧的」这次更新才会命中行，
 * 命中了才把活扔到后台。两个标签页同时发现作业断了，也只有一个跑得起来——
 * 不这样做就会同一条抽两遍，出两份重复草稿。
 */
export async function resumeJob(jobId: string): Promise<ActionResult<boolean>> {
  if (!uuid.safeParse(jobId).success) return fail("作业标识不对");
  const supabase = await createClient();

  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await supabase
    .from("ingest_jobs")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "extracting")
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${cutoff}`)
    .select("id");
  if (error) return fail(`没能接着抽：${error.message}`);

  // 没命中：要么已经有人接手了，要么作业其实还活着。两种都不该再跑一遍。
  if (data === null || data.length === 0) return ok(false);

  after(() => runJob(jobId));
  return ok(true);
}

/** 放弃这个作业，回到上传区。Pass 1 就挂掉时，重试之外总得有条退路。 */
export async function discardJob(jobId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(jobId).success) return fail("作业标识不对");
  const supabase = await createClient();
  await supabase.from("drafts").delete().eq("ingest_job_id", jobId);
  const { error } = await supabase
    .from("ingest_jobs")
    .update({ status: "discarded" })
    .eq("id", jobId);
  return error ? fail(`没能放弃这个作业：${error.message}`) : ok(null);
}

// 多久以前的作业就不再往回捡了。断线续跑说的是「刚才那次」，
// 上周挂掉的作业早就不是用户此刻想接着做的事——每次打开导入页
// 都先甩他一条隔了一周的报错，比直接给上传区还糟。
// 行不删：同一份文档再传一次，startJob 照样会认领它。
const ADOPT_WINDOW_MS = 24 * 60 * 60_000;

/**
 * 打开导入页时找回上一个没处理完的作业。
 *
 * 只认 input_type='upload'。随手记走的是同一张 ingest_jobs，
 * 它的作业确认完卡片也不会改状态，会一直挂在 awaiting_review——
 * 不挡住的话导入页会把别人的活捡过来，点进去又是空队列。
 */
export async function findOpenJob(): Promise<ActionResult<string | null>> {
  const supabase = await createClient();
  const cut = new Date(Date.now() - ADOPT_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("ingest_jobs")
    .select("id")
    .eq("input_type", "upload")
    .in("status", ["extracting", "awaiting_review"])
    .or(`heartbeat_at.gte.${cut},and(heartbeat_at.is.null,created_at.gte.${cut})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ok(data?.id ?? null);
}
