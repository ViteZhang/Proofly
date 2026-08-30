// =============================================================
// Proofly · 评估结果读取层
// 重新评估会留下新记录，这里一律只取最新一条；历史留着给 Phase 2 做对比。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { aggregate } from "@/lib/scoring";
import { parseResults } from "@/lib/scoring/parse";
import type { LossBucket, RequirementResult } from "@/lib/scoring/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AssessmentView = {
  id: string;
  matchScore: number;
  createdAt: string | null;
  results: RequirementResult[];
  buckets: LossBucket[];
  /** 这份 JD 一共评过几次。>1 时界面上说一句，让人知道历史留着。 */
  runCount: number;
};

export async function getLatestAssessment(jdId: string): Promise<AssessmentView | null> {
  if (!UUID_RE.test(jdId)) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("assessments")
    .select("id,match_score,results,created_at")
    .eq("jd_id", jdId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);

  const row = data?.[0];
  if (!row) return null;

  const { count } = await supabase
    .from("assessments")
    .select("id", { count: "exact", head: true })
    .eq("jd_id", jdId);

  const results = parseResults(row.results);
  return {
    id: row.id,
    matchScore: row.match_score ?? 0,
    createdAt: row.created_at,
    results,
    buckets: aggregate(results),
    runCount: count ?? 1,
  };
}

/** 一个方向下所有 JD 的最新评估，供首页风险提示卡与方向卡片用。 */
export async function latestAssessmentsForTarget(
  targetId: string,
): Promise<AssessmentView[]> {
  if (!UUID_RE.test(targetId)) return [];
  const supabase = await createClient();

  const { data } = await supabase
    .from("assessments")
    .select("id,jd_id,match_score,results,created_at")
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const seen = new Set<string>();
  const out: AssessmentView[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.jd_id)) continue;
    seen.add(row.jd_id);
    const results = parseResults(row.results);
    out.push({
      id: row.id,
      matchScore: row.match_score ?? 0,
      createdAt: row.created_at,
      results,
      buckets: aggregate(results),
      runCount: 1,
    });
  }
  return out;
}
