"use server";

// =============================================================
// Proofly · 重新评估（异步）
//
// 入库确认立刻返回，重评在后面慢慢跑。界面上先出证明度变化，
// 下面一行「正在重新评估 N 份 JD…」，跑完原地替换成
// 「C 端 68 → 79 · Agent 71 → 80」。
//
// 不做成阻塞：一次重评是一份 JD 一次模型调用，三份就是十几秒，
// 让人对着转圈等十几秒才敢关页面，是在惩罚认真记录的人。
//
// 重评失败不回滚已入库的数据。经历已经在库里了，因为一次模型超时
// 就把它撤掉，那才是真的丢东西。
// =============================================================

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ok, type ActionResult } from "@/lib/domain";
import { affectedAssessments, closeResolvedGaps, type AffectedJd } from "@/lib/planning/reassess";
import { matchAndScore, recallAtoms } from "@/app/(app)/targets/assess-actions";
import type { RippleEffect } from "@/lib/ripple/types";

export type ReassessPlan = {
  /** 要重评的 JD。空数组表示这次变更没影响任何评估，界面上什么都不用说。 */
  jds: AffectedJd[];
};

/**
 * 第一步：算出要重评哪些，立刻返回。
 * 真正的重评挂在 after() 里，响应发出去之后才跑。
 */
export async function startReassess(
  atomIds: string[],
): Promise<ActionResult<ReassessPlan>> {
  const parsed = z.array(z.uuid()).max(20).safeParse(atomIds);
  if (!parsed.success) return ok({ jds: [] });

  const jds = await affectedAssessments(parsed.data);
  if (jds.length === 0) return ok({ jds: [] });

  after(async () => {
    for (const jd of jds) {
      try {
        await reassessOne(jd);
      } catch (e) {
        // 一份挂了不影响另外几份。界面会因为分数没变而显示「可重试」。
        console.error("[reassess] 这份没重评成", jd.jdId, e);
      }
    }
    revalidatePath("/actions");
    revalidatePath("/targets");
    revalidatePath("/");
  });

  return ok({ jds });
}

/**
 * 第二步：界面轮询。返回每份 JD 现在的分数与是否已经跑完。
 *
 * 判据是「有没有出现比 assessmentId 更新的一次评估」，不是时间戳 ——
 * 时间戳在同一事务里会撞，之前已经栽过一次。
 */
export async function pollReassess(
  plan: ReassessPlan,
): Promise<
  ActionResult<{
    done: boolean;
    effects: RippleEffect[];
    pending: number;
  }>
> {
  if (plan.jds.length === 0) return ok({ done: true, effects: [], pending: 0 });

  const supabase = await createClient();
  const effects: RippleEffect[] = [];
  let pending = 0;

  for (const jd of plan.jds) {
    const { data } = await supabase
      .from("assessments")
      .select("id,match_score")
      .eq("jd_id", jd.jdId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);

    const latest = data?.[0];
    if (!latest || latest.id === jd.assessmentId) {
      pending++;
      continue;
    }
    effects.push({
      kind: "match_score_change",
      targetId: jd.targetId,
      targetName: jd.targetName,
      from: jd.scoreBefore,
      to: latest.match_score ?? 0,
    });
  }

  // 缺口关闭与自动完成只在全部跑完之后结算一次，
  // 免得中途结算出一个「补上了一半」的自动完成。
  if (pending === 0) {
    for (const jd of plan.jds) {
      const r = await closeResolvedGaps(jd);
      effects.push(...r.effects);
    }
  }

  return ok({ done: pending === 0, effects, pending });
}

/** 重评一份 JD：解析结果不变，只重跑匹配判定。 */
async function reassessOne(jd: AffectedJd): Promise<void> {
  const recall = await recallAtoms(jd.jdId);
  if (!recall.ok) throw new Error(recall.error);
  const scored = await matchAndScore(jd.jdId, recall.data.atomIds);
  if (!scored.ok) throw new Error(scored.error);
}

/** 「重新评估失败，可重试」的重试入口。 */
export async function retryReassess(
  plan: ReassessPlan,
): Promise<ActionResult<null>> {
  if (plan.jds.length === 0) return ok(null);
  after(async () => {
    for (const jd of plan.jds) {
      try {
        await reassessOne(jd);
      } catch (e) {
        console.error("[reassess] 重试还是没成", jd.jdId, e);
      }
    }
    revalidatePath("/actions");
    revalidatePath("/targets");
    revalidatePath("/");
  });
  return ok(null);
}
