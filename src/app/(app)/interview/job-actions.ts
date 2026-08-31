"use server";

// =============================================================
// Proofly · 出题作业的启动与进度
//
// 作业跑在 after() 里：响应先回给页面，活在后台接着做。所以关掉页面
// 作业不会停，重新打开时靠轮询把进度捡回来。
//
// 这一步跟抽取作业最大的不同是时长：抽取是几十条小调用，这里是两次
// 十几分钟的大调用。所以断线阈值给得更宽，而且不自动重试 ——
// 重跑一次是十几分钟的模型钱，得由人来点。
// =============================================================

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/domain";
import { runKitJob, type RejectedQuestion } from "@/lib/interview/job";
import { createClient } from "@/lib/supabase/server";
import type { Json, KitJobStage, KitJobStatus } from "@/types/database";

const uuid = z.uuid();

/**
 * 心跳超过这么久没动，就当跑作业的进程已经没了。
 * 心跳每 30 秒一次，给到 3 分钟：宁可晚一点发现，也别把还活着的
 * 作业判成死的 —— 那会让用户白花一次十几分钟的重跑。
 */
const STALE_MS = 3 * 60_000;

export type KitJobProgress = {
  kitId: string;
  status: KitJobStatus;
  stage: KitJobStage | null;
  probeCount: number;
  caseCount: number;
  startedAt: string | null;
  errorMessage: string | null;
  warnings: string[];
  rejected: RejectedQuestion[];
  /** 界面上直接显示这句。 */
  headline: string;
  /** 作业停了（跑完或失败），可以停止轮询。 */
  settled: boolean;
  /** 还标着 running，但心跳早停了 —— 跑它的进程多半已经没了。 */
  stalled: boolean;
};

const STAGE_COPY: Record<KitJobStage, string> = {
  probing: "正在出项目深挖题",
  casing: "正在出案例题",
  writing: "正在落库",
};

function elapsed(startedAt: string | null): string {
  if (!startedAt) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `已等 ${m} 分 ${s % 60} 秒` : `已等 ${s} 秒`;
}

function parseWarnings(v: Json | null): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parseRejected(v: Json | null): RejectedQuestion[] {
  if (!Array.isArray(v)) return [];
  const out: RejectedQuestion[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json | undefined>;
    if (typeof o.question !== "string") continue;
    out.push({
      question: o.question,
      problems: Array.isArray(o.problems)
        ? o.problems.filter((p): p is string => typeof p === "string")
        : [],
    });
  }
  return out;
}

/**
 * 给一份投递版本起一个出题作业。
 * 已经在跑就返回那一个，不重复起 —— 一次十几分钟的模型钱，不该按两次。
 */
export async function startKitJob(versionId: string): Promise<ActionResult<string>> {
  if (!uuid.safeParse(versionId).success) return fail("投递版本标识不对");

  const supabase = await createClient();

  const { data: version } = await supabase
    .from("resume_versions")
    .select("id,jd_id,baseline_id")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return fail("找不到这份投递版本");

  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("target_id")
    .eq("id", version.baseline_id)
    .maybeSingle();
  if (!baseline) return fail("找不到这份版本的基线");

  const { data: existing } = await supabase
    .from("interview_kits")
    .select("id,job_status,heartbeat_at")
    .eq("resume_version_id", versionId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const beat = existing.heartbeat_at ? Date.parse(existing.heartbeat_at) : 0;
    const alive = existing.job_status === "running" && Date.now() - beat < STALE_MS;
    if (alive) return ok(existing.id);

    await supabase
      .from("interview_kits")
      .update({
        jd_id: version.jd_id,
        job_status: "running",
        job_stage: "probing",
        job_started_at: now,
        heartbeat_at: now,
        error_message: null,
        warnings: [] as unknown as Json,
        rejected: [] as unknown as Json,
      })
      .eq("id", existing.id);
    after(() => runKitJob(existing.id));
    revalidatePath("/interview");
    return ok(existing.id);
  }

  const { data: created, error } = await supabase
    .from("interview_kits")
    .insert({
      target_id: baseline.target_id,
      jd_id: version.jd_id,
      resume_version_id: versionId,
      job_status: "running",
      job_stage: "probing",
      job_started_at: now,
      heartbeat_at: now,
    })
    .select("id")
    .single();
  if (error || !created) return fail(`没能建起出题作业：${error?.message ?? "未知原因"}`);

  after(() => runKitJob(created.id));
  revalidatePath("/interview");
  return ok(created.id);
}

export async function getKitJobProgress(kitId: string): Promise<ActionResult<KitJobProgress>> {
  if (!uuid.safeParse(kitId).success) return fail("题包标识不对");

  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("interview_kits")
    .select(
      "id,job_status,job_stage,job_started_at,heartbeat_at,error_message,probe_count,case_count,warnings,rejected",
    )
    .eq("id", kitId)
    .maybeSingle();
  if (!kit) return fail("找不到这个题包");

  const beat = kit.heartbeat_at ? Date.parse(kit.heartbeat_at) : 0;
  const stalled = kit.job_status === "running" && Date.now() - beat > STALE_MS;
  const settled = kit.job_status === "done" || kit.job_status === "failed";

  // 进度必须是真实数字，不是转圈：说清楚在哪一步、已经等了多久、
  // 已经出了几道。两次大调用，没有更细的刻度可给 —— 那就不假装有。
  let headline: string;
  if (kit.job_status === "failed") {
    headline = kit.error_message ?? "出题失败了";
  } else if (kit.job_status === "done") {
    headline = `出好了：项目深挖 ${kit.probe_count} 道 · 案例题 ${kit.case_count} 道`;
  } else if (kit.job_status === "idle") {
    headline = "还没开始出题";
  } else if (stalled) {
    headline = "作业像是断了 —— 服务重启或进程退出都会这样";
  } else {
    const s = kit.job_stage ? STAGE_COPY[kit.job_stage] : "正在出题";
    const done = kit.probe_count > 0 ? `项目深挖 ${kit.probe_count} 道已出，` : "";
    headline = `${done}${s}…${elapsed(kit.job_started_at)}`;
  }

  return ok({
    kitId: kit.id,
    status: kit.job_status,
    stage: kit.job_stage,
    probeCount: kit.probe_count,
    caseCount: kit.case_count,
    startedAt: kit.job_started_at,
    errorMessage: kit.error_message,
    warnings: parseWarnings(kit.warnings),
    rejected: parseRejected(kit.rejected),
    headline,
    settled,
    stalled,
  });
}

/**
 * 断了之后接着跑。整段重来 —— 深挖题那一半已经落库，重跑会把它替换掉，
 * 练习状态照样继承。不自动触发：重跑一次是十几分钟的模型钱，得由人来点。
 */
export async function resumeKitJob(kitId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(kitId).success) return fail("题包标识不对");

  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("interview_kits")
    .select("id,resume_version_id,job_status")
    .eq("id", kitId)
    .maybeSingle();
  if (!kit?.resume_version_id) return fail("找不到这个题包");

  const now = new Date().toISOString();
  await supabase
    .from("interview_kits")
    .update({
      job_status: "running",
      job_stage: "probing",
      job_started_at: now,
      heartbeat_at: now,
      error_message: null,
    })
    .eq("id", kitId);

  after(() => runKitJob(kitId));
  revalidatePath("/interview");
  return ok(null);
}
