"use server";

// =============================================================
// Proofly · 匹配评估
//
// 拆成三个动作，是为了进度能真的一步步走完：解析要求 → 检索经历 →
// 计算匹配。放在一个动作里就只能转圈，用户不知道卡在哪一步。
//
// 分数一律由 src/lib/scoring 算。模型输出里如果出现分数，忽略它。
// =============================================================

import { revalidatePath } from "next/cache";
import { billedAction, fingerprintFor, idempotencyKey } from "@/lib/billing/action";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { MATCH_SYSTEM, matchUser } from "@/lib/llm/jd-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { findSimilarAtoms } from "@/lib/ingest/embedding";
import { buildCandidates, loadSkills } from "@/lib/assess/payload";
import { matchSchema } from "@/lib/jd/schema";
import { score } from "@/lib/scoring";
import { gapRows } from "@/lib/scoring/gaps";
import { getRequirements } from "@/lib/queries/jds";
import type { Json } from "@/types/database";
import type { RequirementInput, Verdict } from "@/lib/scoring/types";

/** 召回取 top 15。JD 全文截到 2000 字再做向量。 */
const RECALL_N = 15;
const JD_EMBED_CHARS = 2000;

function refresh() {
  revalidatePath("/app/targets");
  revalidatePath("/");
}

/** 第二步：用 JD 全文召回最相关的经历。返回 id 列表交给第三步。 */
export async function recallAtoms(
  jdId: string,
): Promise<ActionResult<{ atomIds: string[]; degraded: boolean }>> {
  if (!z.uuid().safeParse(jdId).success) return fail("这份 JD 不存在");
  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("raw_text")
    .eq("id", jdId)
    .maybeSingle();
  if (!jd) return fail("这份 JD 已经不在了");

  const { atoms, degraded } = await findSimilarAtoms(
    jd.raw_text.slice(0, JD_EMBED_CHARS),
    RECALL_N,
  );
  return ok({ atomIds: atoms.map((a) => a.id), degraded });
}

/**
 * 第三步：一次调用判定全部要求，然后代码算分、归因、写库。
 *
 * 故意做成一次性全局调用。逐条调用时每条要求都会去抢同一条最强的经历，
 * 模型看不到全局就没法合理分配；而且成本翻十几倍。
 */
/**
 * 计费入口：解析并评估 ⬡5。
 *
 * 5 分覆盖 JD 拆解与匹配两步（C2 接入清单）。拆解那一次调用记成
 * bundled（见 jd-actions），钱只在这里收一次。
 *
 * 只加包装，业务逻辑一行没动 —— 下面的 runMatchAndScore 就是原来的
 * matchAndScore。
 */
export async function matchAndScore(
  jdId: string,
  atomIds: string[],
  clientReqId?: string,
): Promise<ActionResult<{ assessmentId: string; matchScore: number }>> {
  return billedAction({
    actionCode: "target_assess",
    fingerprint: await fingerprintFor("target_assess", { jdId }),
    idempotencyKey: idempotencyKey("target_assess", [jdId], clientReqId),
    run: () => runMatchAndScore(jdId, atomIds),
  });
}

async function runMatchAndScore(
  jdId: string,
  atomIds: string[],
): Promise<ActionResult<{ assessmentId: string; matchScore: number }>> {
  if (!z.uuid().safeParse(jdId).success) return fail("这份 JD 不存在");
  const parsedIds = z.array(z.uuid()).max(50).safeParse(atomIds);
  if (!parsedIds.success) return fail("召回结果不对，重新评估一次");

  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("id,target_id")
    .eq("id", jdId)
    .maybeSingle();
  if (!jd) return fail("这份 JD 已经不在了");

  const requirements = await getRequirements(jdId);
  if (requirements.length === 0) return fail("这份 JD 还没解析出要求，先解析一次");

  const [{ candidates, facts }, skills] = await Promise.all([
    buildCandidates(parsedIds.data),
    loadSkills(),
  ]);

  const res = await callLLM({
    tier: "strong",
    purpose: "jd_match",
    system: MATCH_SYSTEM,
    user: matchUser({
      requirementsJson: JSON.stringify(
        requirements.map((r) => ({
          index: r.idx,
          text: r.text,
          raw_phrase: r.rawPhrase,
          kind: r.kind,
          is_structural: r.isStructural,
        })),
        null,
        2,
      ),
      atomsJson:
        candidates.length === 0
          ? "（经历库是空的，或者没有与这个岗位相关的条目）"
          : JSON.stringify(candidates, null, 2),
      skillsJson:
        skills.length === 0 ? "（还没有技能标签）" : JSON.stringify(skills, null, 2),
    }),
    jsonSchema: matchSchema,
  });
  if (!res.ok) return fail(res.error);

  const inputs: RequirementInput[] = requirements.map((r) => ({
    id: r.id,
    index: r.idx,
    text: r.text,
    rawPhrase: r.rawPhrase,
    kind: r.kind,
    isStructural: r.isStructural,
  }));

  const verdicts: Verdict[] = res.data.results.map((v) => ({
    requirementIndex: v.requirement_index,
    coverage: v.coverage,
    matchedAtomIds: v.matched_atom_ids,
    reason: v.reason,
    relatedSkillLabels: v.related_skill_labels,
  }));

  // 恒等式不成立时 score() 会抛。这里不吞掉，让它变成一句能看懂的错误——
  // 静默容忍等于把一份算错的分数当成真的。
  let scored;
  try {
    scored = score(inputs, verdicts, facts, skills);
  } catch (e) {
    console.error("[assess] 归因对不上", e);
    return fail(e instanceof Error ? e.message : "算分出错了，再试一次");
  }

  // 重新评估留下新记录，旧的不动 —— 这是两周后看进步的唯一依据。
  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      target_id: jd.target_id,
      jd_id: jdId,
      match_score: scored.matchScore,
      results: scored.results as unknown as Json,
      strengths: scored.results
        .filter((r) => r.gapType === null && r.coverage === "full")
        .map((r) => r.requirementIndex) as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !assessment) return fail("算出来了，但没存进去，再试一次");

  const rows = gapRows(scored.results).map((g) => ({ ...g, assessment_id: assessment.id }));
  if (rows.length > 0) {
    const { error: gapErr } = await supabase.from("gaps").insert(rows);
    if (gapErr) console.error("[assess] 缺口没写进去", gapErr);
  }

  refresh();
  return ok({ assessmentId: assessment.id, matchScore: scored.matchScore });
}
