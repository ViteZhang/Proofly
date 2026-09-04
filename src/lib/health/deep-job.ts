// =============================================================
// Proofly · C8 深扫作业
//
// 二十到六十秒，一条经历一次调用，并发 2。比出题作业轻得多，但仍然
// 不该挂在一次点击上等着——所以照同一套：活跑在 after() 里，进度落库，
// 页面轮询。
//
// 进度要显示真实的「第 3 / 8 条」，不要转圈。转圈只说明程序还活着，
// 说不出还要等多久；而这一步的等待是有尽头的，用户有权知道尽头在哪。
//
// 失败不清空已有结果：跑到第 6 条挂了，前 5 条查出来的冲突照样落库。
// =============================================================

import { releaseJob } from "@/lib/billing/async";
import {
  createSink,
  failJob as billingFailJob,
  succeedJob,
} from "@/lib/billing/job";
import { callLLM } from "@/lib/llm";
import { CONFLICT_SYSTEM, conflictUser } from "@/lib/llm/health-prompts";
import { createClient } from "@/lib/supabase/server";
import { withUsageSink } from "@/lib/telemetry/usage";
import { conflictSetSchema } from "./c8-schema";
import {
  atomJson,
  selectDeepScanBatch,
  buildConflictIssues,
  resumeTextsJson,
  sourceExcerptsJson,
} from "./c8-conflict";
import { loadHealthContext, replaceHealthIssues } from "@/lib/queries/health";
import type { HealthAtom, HealthContext, HealthIssue } from "./types";
import type { Database, Json } from "@/types/database";

/** 一条经历一次调用，上下文不大，一分钟足够。 */
export const ATOM_DEADLINE_MS = 120_000;

/** 并发 2。再高没有意义——限流之后总时长反而更长。 */
export const CONCURRENCY = 2;

/**
 * 心跳超过这么久没动，就当作业已经断了（服务重启、进程退出都会这样）。
 * 放在这里而不是 job-actions.ts：那是个 "use server" 文件，每个导出都
 * 必须是 async 函数，导出一个常量整页就 500。
 */
export const STALE_MS = 3 * 60_000;

type ScanPatch = Database["public"]["Tables"]["health_scans"]["Update"];

async function patch(scanId: string, p: ScanPatch): Promise<void> {
  const supabase = await createClient();
  await supabase.from("health_scans").update(p).eq("id", scanId);
}

async function scanOne(
  ctx: HealthContext,
  atom: HealthAtom,
): Promise<{ issues: HealthIssue[]; warnings: string[] }> {
  const res = await callLLM({
    tier: "strong",
    purpose: "health_conflict",
    system: CONFLICT_SYSTEM,
    user: conflictUser({
      atomJson: atomJson(atom),
      sourceExcerptsJson: sourceExcerptsJson(ctx, atom),
      resumeTextsJson: resumeTextsJson(ctx, atom),
    }),
    jsonSchema: conflictSetSchema,
    deadlineMs: ATOM_DEADLINE_MS,
  });

  if (!res.ok) {
    // 一条经历失败不该拖垮整轮。如实记下来，别的接着扫。
    return { issues: [], warnings: [`「${atom.title}」这条没扫成：${res.error}`] };
  }

  const { issues, dropped } = buildConflictIssues(atom, res.data.conflicts);
  return { issues, warnings: dropped };
}

/**
 * 深扫主流程。可重入、不抛异常 —— 它跑在 after() 里，抛出去没人接得住，
 * 用户只会看到进度永远停在某一条。
 */
/** 这条经历这次扫过了，记下当时的版本，下次没改就跳过。 */
async function markScanned(atomId: string, rev: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("atoms")
    .update({ last_deep_scan_at: new Date().toISOString(), last_deep_scan_rev: rev })
    .eq("id", atomId);
}

export async function runDeepScan(scanId: string): Promise<void> {
  // 这一轮所有模型调用的用量记进这张单子，结算时一起落账。
  const sink = createSink();

  try {
    const ctx = await loadHealthContext();
    // 单次最多 10 条，扫过且没改过的跳过（C2 2.3）。
    const { batch: targets, skipped, remaining } = selectDeepScanBatch(ctx);

    await patch(scanId, {
      total_count: targets.length,
      done_count: 0,
      heartbeat_at: new Date().toISOString(),
    });

    if (targets.length === 0) {
      // 一条都不用扫也是一次有效的深扫：它说明「没有多来源的经历」，
      // 或者「该扫的上次都扫过了、之后一个字没改」。
      // 这两种都没调模型 —— 不该收钱。
      await replaceHealthIssues(["C8"], []);
      await releaseJob(scanId, "nothing_to_scan");
      await patch(scanId, {
        status: "done",
        finished_at: new Date().toISOString(),
        coverage: { scanned: 0, skipped: skipped.length, remaining } as unknown as Json,
      });
      return;
    }

    const issues: HealthIssue[] = [];
    const warnings: string[] = [];
    let done = 0;
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= targets.length) return;
        const r = await withUsageSink(sink, () => scanOne(ctx, targets[i]));
        issues.push(...r.issues);
        warnings.push(...r.warnings);
        await markScanned(targets[i].id, targets[i].updatedAt);
        done++;
        // 每条完成都打点：进度是这一步唯一能给的确定感。
        await patch(scanId, { done_count: done, heartbeat_at: new Date().toISOString() });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

    await replaceHealthIssues(["C8"], issues);
    await succeedJob(scanId, sink);
    await patch(scanId, {
      status: "done",
      done_count: done,
      finished_at: new Date().toISOString(),
      error_message: warnings.length > 0 ? warnings.join("\n") : null,
      coverage: {
        atoms: targets.length,
        scanned: done,
        skipped: skipped.length,
        remaining,
      } as unknown as Json,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await billingFailJob(scanId, msg, sink);
    await patch(scanId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: msg,
    });
  }
}
