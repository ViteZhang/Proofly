// =============================================================
// Proofly · JD 与要求项读取层
// =============================================================

import { createClient } from "@/lib/supabase/server";
import type { RequirementKind } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// S6 区块二的绑定状态。resume_versions 要到 Step 6 才有数据，
// 但判定逻辑现在就写对，那时自动生效。
export type BindState = "none" | "draft" | "submitted";

export type JdCard = {
  id: string;
  company: string | null;
  roleTitle: string | null;
  sourceUrl: string | null;
  createdAt: string | null;
  requirementCount: number;
  // 最新一次评估的分数；没评估过是 null
  matchScore: number | null;
  assessmentId: string | null;
  gapCount: number;
  bind: BindState;
};

export async function listJds(targetId: string): Promise<JdCard[]> {
  if (!UUID_RE.test(targetId)) return [];
  const supabase = await createClient();

  const { data: jds } = await supabase
    .from("jds")
    .select("id,company,role_title,source_url,created_at")
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });

  if (!jds || jds.length === 0) return [];
  const ids = jds.map((j) => j.id);

  const [reqRes, assessRes, resumeRes] = await Promise.all([
    supabase.from("requirements").select("id,jd_id").in("jd_id", ids),
    supabase
      .from("assessments")
      .select("id,jd_id,match_score,created_at")
      .in("jd_id", ids)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("resume_versions").select("id,jd_id,submitted_at").in("jd_id", ids),
  ]);

  const reqCount = new Map<string, number>();
  for (const r of reqRes.data ?? []) reqCount.set(r.jd_id, (reqCount.get(r.jd_id) ?? 0) + 1);

  // 每份 JD 只认最新一次评估
  const latest = new Map<string, { id: string; match_score: number | null }>();
  for (const a of assessRes.data ?? []) if (!latest.has(a.jd_id)) latest.set(a.jd_id, a);

  const gapCount = new Map<string, number>();
  const assessmentIds = [...latest.values()].map((a) => a.id);
  if (assessmentIds.length > 0) {
    const { data: gaps } = await supabase
      .from("gaps")
      .select("assessment_id")
      .in("assessment_id", assessmentIds);
    for (const g of gaps ?? []) {
      gapCount.set(g.assessment_id, (gapCount.get(g.assessment_id) ?? 0) + 1);
    }
  }

  const bind = new Map<string, BindState>();
  for (const v of resumeRes.data ?? []) {
    // 已投递优先：同一份 JD 下有已投递版本就算已投递
    if (v.submitted_at) bind.set(v.jd_id, "submitted");
    else if (bind.get(v.jd_id) !== "submitted") bind.set(v.jd_id, "draft");
  }

  return jds.map((j) => {
    const a = latest.get(j.id) ?? null;
    return {
      id: j.id,
      company: j.company,
      roleTitle: j.role_title,
      sourceUrl: j.source_url,
      createdAt: j.created_at,
      requirementCount: reqCount.get(j.id) ?? 0,
      matchScore: a?.match_score ?? null,
      assessmentId: a?.id ?? null,
      gapCount: a ? (gapCount.get(a.id) ?? 0) : 0,
      bind: bind.get(j.id) ?? "none",
    };
  });
}

export type RequirementRow = {
  id: string;
  idx: number;
  text: string;
  rawPhrase: string | null;
  kind: RequirementKind;
  isStructural: boolean;
  derivedFrom: string | null;
};

export type JdDetail = {
  id: string;
  targetId: string;
  company: string | null;
  roleTitle: string | null;
  rawText: string;
  sourceUrl: string | null;
  requirements: RequirementRow[];
};

export async function getJd(jdId: string): Promise<JdDetail | null> {
  if (!UUID_RE.test(jdId)) return null;
  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("id,target_id,company,role_title,raw_text,source_url")
    .eq("id", jdId)
    .maybeSingle();
  if (!jd) return null;

  return {
    id: jd.id,
    targetId: jd.target_id,
    company: jd.company,
    roleTitle: jd.role_title,
    rawText: jd.raw_text,
    sourceUrl: jd.source_url,
    requirements: await getRequirements(jdId),
  };
}

export async function getRequirements(jdId: string): Promise<RequirementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("requirements")
    .select("id,idx,text,raw_phrase,kind,is_structural,derived_from")
    .eq("jd_id", jdId)
    .order("idx", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((r, i) => ({
    id: r.id,
    // idx 为空（手动添加过、老数据）时按当前顺序补号，界面上不出现空序号
    idx: r.idx ?? i + 1,
    text: r.text,
    rawPhrase: r.raw_phrase,
    kind: r.kind,
    isStructural: r.is_structural,
    derivedFrom: r.derived_from,
  }));
}
