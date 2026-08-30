// =============================================================
// Proofly · 变更之后的重新评估
//
// 触发场景有两个，不只是任务回流：
//   1. 行动回流入库
//   2. 随手记更新经历 —— 用户说「渗透率 35%」，匹配度应该当场变化
//
// 成本控制：只重评「受影响的」评估。一条经历改了，跟它无关的 JD
// 没有任何理由重跑一次模型。
//
// 入库和重评是两件事。重评异步跑，不阻塞入库确认；重评失败不回滚
// 已入库的数据 —— 经历已经在库里了，因为一次模型超时就把它撤掉，
// 那才是真的丢东西。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parseResults } from "@/lib/scoring/parse";
import { GAP_RESOLVED_THRESHOLD } from "./config";
import type { RippleEffect } from "@/lib/ripple/types";
import type { Json } from "@/types/database";

export type AffectedJd = {
  jdId: string;
  targetId: string;
  targetName: string;
  jdLabel: string;
  assessmentId: string;
  /** 重评之前的分数，用来显示「68 → 79」。 */
  scoreBefore: number;
};

/**
 * 哪些评估受这次变更影响。
 *
 * 判据：该评估的 results 里，任何一条要求命中了本次变更的经历。
 * 这一条同时覆盖了方案说的两种情况 —— 缺口关联了这条经历，
 * 以及这条经历出现在 strengths 里：strengths 本来就是从 results
 * 里筛出来的，命中列表是同一份。
 */
export async function affectedAssessments(atomIds: string[]): Promise<AffectedJd[]> {
  const ids = new Set(atomIds.filter((s) => s));
  if (ids.size === 0) return [];

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("assessments")
    .select("id,jd_id,target_id,match_score,results,created_at")
    // created_at 默认 now() 是事务时间，同一事务插的多条会撞，补 id 兜底。
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (!rows || rows.length === 0) return [];

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.jd_id)) latest.set(r.jd_id, r);

  const hits = [...latest.values()].filter((a) =>
    parseResults(a.results as Json).some((r) => r.matchedAtomIds.some((x) => ids.has(x))),
  );
  if (hits.length === 0) return [];

  const [{ data: targets }, { data: jds }] = await Promise.all([
    supabase.from("targets").select("id,name"),
    supabase
      .from("jds")
      .select("id,company,role_title")
      .in("id", hits.map((h) => h.jd_id)),
  ]);
  const targetName = new Map((targets ?? []).map((t) => [t.id, t.name]));
  const jdLabel = new Map(
    (jds ?? []).map((j) => [j.id, [j.company, j.role_title].filter(Boolean).join(" · ") || "这份 JD"]),
  );

  return hits.map((a) => ({
    jdId: a.jd_id,
    targetId: a.target_id,
    targetName: targetName.get(a.target_id) ?? "未知方向",
    jdLabel: jdLabel.get(a.jd_id) ?? "这份 JD",
    assessmentId: a.id,
    scoreBefore: a.match_score ?? 0,
  }));
}

/**
 * 重评之后关闭已经补上的缺口，并把因此清空的行动自动标完成。
 *
 * 缺口挂在旧那次评估上，重评会产生一批新的 gap 行；这里按
 * requirement_index 去新结果里找对应那条要求现在到了什么水平。
 * 达到门槛就写 resolved_at —— 它是「补上了」，跟 dismissed_at
 * 的「不打算补」是两件事，不能混。
 */
export async function closeResolvedGaps(
  jd: AffectedJd,
): Promise<{ resolved: number; effects: RippleEffect[] }> {
  const supabase = await createClient();

  // 重评后这份 JD 的最新一次评估。
  const { data: fresh } = await supabase
    .from("assessments")
    .select("id,results,match_score")
    .eq("jd_id", jd.jdId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  const latest = fresh?.[0];
  if (!latest || latest.id === jd.assessmentId) return { resolved: 0, effects: [] };

  const now = parseResults(latest.results as Json);
  const levelByIndex = new Map(
    now.map((r) => [r.requirementIndex, r.coverageValue * r.evidenceMultiplier]),
  );

  const { data: old } = await supabase
    .from("gaps")
    .select("id,requirement_index")
    .eq("assessment_id", jd.assessmentId)
    .is("resolved_at", null)
    .is("dismissed_at", null);

  const resolvedIds = (old ?? [])
    .filter((g) => {
      const level = levelByIndex.get(g.requirement_index ?? -1);
      return level !== undefined && level >= GAP_RESOLVED_THRESHOLD;
    })
    .map((g) => g.id);

  if (resolvedIds.length > 0) {
    await supabase
      .from("gaps")
      .update({ resolved_at: new Date().toISOString() })
      .in("id", resolvedIds);
  }

  const effects = await autoCompleteTasks();
  return { resolved: resolvedIds.length, effects };
}

/**
 * 关联缺口全部解决的行动自动完成。
 *
 * actual_hours 留空 —— 这条不是人做完的，是数据补齐带出来的，
 * 编一个工时进去会污染以后的估时参考。
 * auto_completed 标住，撤销时才能干净地退回待办。
 */
export async function autoCompleteTasks(): Promise<RippleEffect[]> {
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,task_targets(gap_id)")
    .is("dismissed_at", null)
    .in("status", ["todo", "doing"]);
  if (!tasks || tasks.length === 0) return [];

  const gapIds = tasks.flatMap((t) =>
    (t.task_targets ?? []).map((x) => x.gap_id).filter((x): x is string => !!x),
  );
  if (gapIds.length === 0) return [];

  const { data: gaps } = await supabase
    .from("gaps")
    .select("id,resolved_at,dismissed_at")
    .in("id", gapIds);
  const openGap = new Set(
    (gaps ?? []).filter((g) => !g.resolved_at && !g.dismissed_at).map((g) => g.id),
  );

  const effects: RippleEffect[] = [];
  for (const t of tasks) {
    const mine = (t.task_targets ?? []).map((x) => x.gap_id).filter((x): x is string => !!x);
    // 一条关联都没有的行动不在这里处理：它可能是手动加的，
    // 「没有缺口」不等于「缺口都补上了」。
    if (mine.length === 0) continue;
    if (mine.some((id) => openGap.has(id))) continue;

    const { error } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        actual_hours: null,
        auto_completed: true,
      })
      .eq("id", t.id);
    if (!error) effects.push({ kind: "task_auto_complete", taskId: t.id, title: t.title });
  }
  return effects;
}
