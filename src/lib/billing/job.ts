// =============================================================
// Proofly · 异步作业的账
//
// 长任务的账要跨进程活着：预扣在「用户点确认」那次请求里发生，结算在
// 几分钟后 after() 的另一次执行里。中间这段时间，三件事必须能被查到：
//
//   这笔钱挂在哪（hold）· 跑到第几段了（segments）· 什么时候算超时
//
// 这个模块不替换 Step 7 / Step 8 已有的进度机制 —— 那些跑得好好的，
// 动它们是「顺手重构」。这里只补计费需要的那一层。
//
// 上游：《商业化技术方案 v1.0》3.3 ·《商业化 C2》2.2、切片 C2.4
// =============================================================

import { LIMITS } from "@/config/plan";
import { createSink, totals, withUsageSink, type UsageSink } from "@/lib/telemetry/usage";
import type { Json } from "@/types/database";

import { idempotencyKey } from "./action";
import { holdForJob, releaseJob, settleJob, type HoldOutcome } from "./async";

async function db() {
  return (await import("@/lib/supabase/server")).createClient();
}

export type SegmentStatus = "pending" | "done" | "failed";
export type Segment = { name: string; label: string; status: SegmentStatus; note?: string };
export type JobKind = "interview_kit" | "health_deep_scan";

/** 作业超时时长。跑过头就当它死了，退分。 */
const JOB_TTL_MIN = 20;

export type StartOutcome =
  | { ok: true; resumed: boolean; segments: Segment[] }
  | { ok: false; code: "INSUFFICIENT" | "FAILED"; error: string; required?: number; available?: number };

/**
 * 开一个作业并预扣。
 *
 * 同一个 jobId 重复开 → 复用原来那笔预扣，段落状态原样带回。
 * **断点续跑不重复扣分**（C2 七、5）就落在这里：重试时钱不再动，
 * 已完成的段跳过。
 */
export async function startJob(opts: {
  jobId: string;
  kind: JobKind;
  actionCode: string;
  credits?: number;
  fingerprint?: string;
  inputRef?: Record<string, unknown>;
  segments: { name: string; label: string }[];
}): Promise<StartOutcome> {
  const supabase = await db();

  const { data: existing } = await supabase
    .from("async_jobs")
    .select("id,status,segments")
    .eq("id", opts.jobId)
    .maybeSingle();

  const held: HoldOutcome = await holdForJob({
    jobRef: opts.jobId,
    actionCode: opts.actionCode,
    credits: opts.credits,
    fingerprint: opts.fingerprint,
    idempotencyKey: idempotencyKey(opts.actionCode, [opts.jobId]),
    ttlMin: JOB_TTL_MIN + 5, // 预扣要比作业活得久一点，否则作业还在跑钱先退了
  });
  if (!held.ok) return held;

  const expiresAt = new Date(Date.now() + JOB_TTL_MIN * 60_000).toISOString();

  if (existing) {
    const merged = mergeSegments(parseSegments(existing.segments), opts.segments);
    await supabase
      .from("async_jobs")
      .update({
        status: "running",
        segments: merged as unknown as Json,
        error_message: null,
        started_at: new Date().toISOString(),
        finished_at: null,
        expires_at: expiresAt,
        hold_id: held.holdId,
      })
      .eq("id", opts.jobId);
    return { ok: true, resumed: merged.some((s) => s.status === "done"), segments: merged };
  }

  const fresh: Segment[] = opts.segments.map((s) => ({ ...s, status: "pending" }));
  await supabase.from("async_jobs").insert({
    id: opts.jobId,
    kind: opts.kind,
    status: "running",
    hold_id: held.holdId,
    input_ref: (opts.inputRef ?? {}) as Json,
    segments: fresh as unknown as Json,
    started_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  return { ok: true, resumed: false, segments: fresh };
}

/**
 * 续跑时的段落合并：**已完成的原样保留，其余重置成待跑。**
 *
 * 失败的段要重置，不能留着 failed —— 否则重试时它会被当成「跑过了」
 * 跳过去，用户付了钱拿到半份结果。
 */
export function mergeSegments(
  prior: Segment[],
  wanted: { name: string; label: string }[],
): Segment[] {
  return wanted.map((s) => {
    const was = prior.find((p) => p.name === s.name);
    return was?.status === "done"
      ? { ...s, status: "done" as SegmentStatus, note: was.note }
      : { ...s, status: "pending" as SegmentStatus };
  });
}

export function parseSegments(v: unknown): Segment[] {
  return Array.isArray(v) ? (v as Segment[]) : [];
}

/** 这一段跑完了没有。续跑时用它决定跳不跳过。 */
export async function segmentDone(jobId: string, name: string): Promise<boolean> {
  const supabase = await db();
  const { data } = await supabase
    .from("async_jobs")
    .select("segments")
    .eq("id", jobId)
    .maybeSingle();
  return parseSegments(data?.segments).find((s) => s.name === name)?.status === "done";
}

/** 标记一段的结果，并顺手续一次超时。 */
export async function markSegment(
  jobId: string,
  name: string,
  status: SegmentStatus,
  note?: string,
): Promise<void> {
  const supabase = await db();
  const { data } = await supabase
    .from("async_jobs")
    .select("segments")
    .eq("id", jobId)
    .maybeSingle();
  const segs = parseSegments(data?.segments).map((s) =>
    s.name === name ? { ...s, status, note } : s,
  );
  await supabase
    .from("async_jobs")
    .update({
      segments: segs as unknown as Json,
      current_segment: segs.filter((s) => s.status === "done").length,
      // 有进展就往后推超时。卡住的作业才该被扫走，跑得慢的不该。
      expires_at: new Date(Date.now() + JOB_TTL_MIN * 60_000).toISOString(),
    })
    .eq("id", jobId);
}

/** 作业成功：结算。 */
export async function succeedJob(jobId: string, usage?: UsageSink): Promise<void> {
  const supabase = await db();
  await settleJob(jobId, undefined, usage ? totals(usage) : undefined);
  await supabase
    .from("async_jobs")
    .update({ status: "succeeded", finished_at: new Date().toISOString(), error_message: null })
    .eq("id", jobId);
}

/**
 * 作业失败：退分。
 *
 * 已完成的段**保留**，下次重试可以跳过 —— 用户已经等过那段时间了，
 * 让他再等一遍是第二次伤害。
 */
export async function failJob(
  jobId: string,
  message: string,
  usage?: UsageSink,
): Promise<void> {
  const supabase = await db();
  await releaseJob(jobId, "failed", usage ? totals(usage) : undefined);
  await supabase
    .from("async_jobs")
    .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

/** 用户取消：退分，已完成的段同样保留。 */
export async function cancelJob(jobId: string): Promise<{ ok: boolean; refunded: number }> {
  const supabase = await db();
  const r = await releaseJob(jobId, "cancelled");
  await supabase
    .from("async_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", jobId);
  return { ok: r.ok, refunded: r.refunded };
}

export type JobView = {
  id: string;
  kind: JobKind;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  segments: Segment[];
  errorMessage: string | null;
  startedAt: string | null;
  /** 预扣还在不在。界面据此显示「N 分预扣中」。 */
  heldCredits: number | null;
};

export async function getJob(jobId: string): Promise<JobView | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("async_jobs")
    .select("id,kind,status,segments,error_message,started_at,hold_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;

  const { jobHoldStatus } = await import("./async");
  const hold = await jobHoldStatus(jobId);

  return {
    id: data.id,
    kind: data.kind,
    status: data.status,
    segments: parseSegments(data.segments),
    errorMessage: data.error_message,
    startedAt: data.started_at,
    heldCredits: hold.found && hold.status === "held" ? hold.credits : null,
  };
}

/** 在收集单里跑一段活，段内的模型调用会记进这次作业的账。 */
export function inJobUsage<T>(sink: UsageSink, fn: () => Promise<T>): Promise<T> {
  return withUsageSink(sink, fn);
}

export { createSink };
export const JOB_HOLD_TTL_MIN = LIMITS.hold_ttl_async_min;
