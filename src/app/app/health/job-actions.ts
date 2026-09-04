"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runDeepScan } from "@/lib/health/deep-job";
import { fingerprintFor } from "@/lib/billing/action";
import { startJob as startBilledJob } from "@/lib/billing/job";
import { selectDeepScanBatch } from "@/lib/health/c8-conflict";
import { loadHealthContext } from "@/lib/queries/health";
import { STALE_MS } from "@/lib/health/deep-job";

export type DeepScanProgress = {
  scanId: string;
  status: "running" | "done" | "failed";
  done: number;
  total: number;
  /** 页面直接显示这一句。 */
  headline: string;
  settled: boolean;
  stalled: boolean;
  warnings: string[];
  /** 这次没扫完、还剩几条。用来提示「再来一次 5 分」。 */
  remaining: number;
};

/** 起一次深扫。已经在跑就返回那一次，不重复起。 */
export async function startDeepScan(): Promise<{ scanId: string } | { error: string }> {
  const supabase = await createClient();

  const { data: live } = await supabase
    .from("health_scans")
    .select("id,heartbeat_at")
    .eq("kind", "deep")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (live && Date.parse(live.heartbeat_at ?? "") > Date.now() - STALE_MS) {
    return { scanId: live.id };
  }

  const ctx = await loadHealthContext();
  const { batch, remaining } = selectDeepScanBatch(ctx);

  // 一条都不用扫就别起作业、别收钱。
  if (batch.length === 0) {
    return { error: "该扫的经历上次都扫过了，之后也没改动过 —— 这次不用再扫。" };
  }

  const { data, error } = await supabase
    .from("health_scans")
    .insert({ kind: "deep" as const, status: "running" as const, total_count: batch.length })
    .select("id")
    .single();

  if (error || !data) return { error: `起不了深度扫描：${error?.message ?? "未知原因"}` };

  const held = await startBilledJob({
    jobId: data.id,
    kind: "health_deep_scan",
    actionCode: "health_deep_scan",
    fingerprint: await fingerprintFor("health_deep_scan", {
      atomIds: batch.map((a) => a.id),
    }),
    inputRef: { atom_ids: batch.map((a) => a.id), remaining },
    segments: [{ name: "conflict", label: "语义冲突比对" }],
  });
  if (!held.ok) {
    await supabase.from("health_scans").delete().eq("id", data.id);
    return { error: held.error };
  }

  after(() => runDeepScan(data.id));
  return { scanId: data.id };
}

export async function getDeepScanProgress(scanId: string): Promise<DeepScanProgress | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("health_scans")
    .select("id,status,done_count,total_count,heartbeat_at,error_message,coverage")
    .eq("id", scanId)
    .maybeSingle();

  if (!data) return null;

  const settled = data.status !== "running";
  const stalled =
    !settled && Date.parse(data.heartbeat_at ?? "") < Date.now() - STALE_MS;

  const cover = (data.coverage ?? {}) as { remaining?: number };

  return {
    scanId: data.id,
    status: data.status,
    done: data.done_count,
    total: data.total_count,
    remaining: typeof cover.remaining === "number" ? cover.remaining : 0,
    settled,
    stalled,
    warnings: (data.error_message ?? "").split("\n").filter((s) => s.trim() !== ""),
    headline: headlineOf(data.status, data.done_count, data.total_count, stalled),
  };
}

function headlineOf(
  status: "running" | "done" | "failed",
  done: number,
  total: number,
  stalled: boolean,
): string {
  if (status === "failed") return "深度扫描没跑完";
  if (stalled) return "扫描像是断了 —— 服务重启或进程退出都会这样";
  if (status === "done") {
    return total === 0
      ? "没有关联了两份及以上材料的经历 —— 单一来源不可能自相矛盾，这一轮不用扫"
      : `${total} 条经历都比对过了`;
  }
  // 转圈说不出还要等多久，这一步的等待是有尽头的。
  return total === 0 ? "正在准备…" : `正在检查第 ${Math.min(done + 1, total)} / ${total} 条经历…`;
}
