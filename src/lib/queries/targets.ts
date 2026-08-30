// =============================================================
// Proofly · 求职方向读取层
// 多方向平权：这里不排「主方向」，排序只用 sort_order + created_at，
// 任何按分数高低给方向排序的写法都会在界面上制造出主次。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import type { TargetCard } from "@/lib/targets/shape";

export type { TargetCard } from "@/lib/targets/shape";
export { resolveTarget } from "@/lib/targets/shape";

const COLUMNS = "id,name,direction,narrative,sort_order,created_at";

/**
 * 方向卡片列表。匹配度与缺口数取「每份 JD 的最新一次评估」再在方向内取最高，
 * 历史评估只进历史，不参与卡片数字——否则改差了经历分数反而不降。
 */
export async function listTargets(): Promise<TargetCard[]> {
  const supabase = await createClient();

  const { data: targets } = await supabase
    .from("targets")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!targets || targets.length === 0) return [];

  const ids = targets.map((t) => t.id);

  const [jdRes, assessRes] = await Promise.all([
    supabase.from("jds").select("id,target_id").in("target_id", ids),
    supabase
      .from("assessments")
      .select("id,jd_id,target_id,match_score,created_at")
      .in("target_id", ids)
      // created_at 默认 now()，同一事务里插的多条时间戳完全一样。
      // 真实使用中两次评估必然跨事务，但排序不能靠这个假设，补一个 id 兜底。
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  // 同一份 JD 可能评估过多次，只认最新那次。
  const latestByJd = new Map<string, { id: string; target_id: string; match_score: number | null }>();
  for (const a of assessRes.data ?? []) {
    if (!latestByJd.has(a.jd_id)) latestByJd.set(a.jd_id, a);
  }

  const gapCountByAssessment = new Map<string, number>();
  const assessmentIds = [...latestByJd.values()].map((a) => a.id);
  if (assessmentIds.length > 0) {
    const { data: gaps } = await supabase
      .from("gaps")
      .select("assessment_id")
      .in("assessment_id", assessmentIds);
    for (const g of gaps ?? []) {
      gapCountByAssessment.set(g.assessment_id, (gapCountByAssessment.get(g.assessment_id) ?? 0) + 1);
    }
  }

  const jdCountByTarget = new Map<string, number>();
  for (const j of jdRes.data ?? []) {
    jdCountByTarget.set(j.target_id, (jdCountByTarget.get(j.target_id) ?? 0) + 1);
  }

  return targets.map((t) => {
    let best: number | null = null;
    let gapCount = 0;
    for (const a of latestByJd.values()) {
      if (a.target_id !== t.id) continue;
      if (a.match_score !== null && (best === null || a.match_score > best)) best = a.match_score;
      gapCount += gapCountByAssessment.get(a.id) ?? 0;
    }
    return {
      id: t.id,
      name: t.name,
      direction: t.direction,
      narrative: t.narrative,
      jdCount: jdCountByTarget.get(t.id) ?? 0,
      gapCount,
      matchScore: best,
    };
  });
}

/** 顶栏选择器只需要 id + 名称，不查 JD 与评估。 */
export async function listTargetOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("targets")
    .select("id,name,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []).map((t) => ({ id: t.id, name: t.name }));
}
