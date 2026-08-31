"use server";

// =============================================================
// Proofly · 面试题包生成
//
// 分两次模型调用不是为了省钱，是为了质量：项目深挖题要吃经历的全部
// 细节，案例题只要 JD 与技能概览。混在一次里，模型会拿经历去套案例题，
// 也会因为上下文太杂而把深挖题写得泛泛。
//
// 风险等级在这里之后由代码判。模型输出里的风险标记一律不读。
// =============================================================

import { revalidatePath } from "next/cache";
import { callLLM } from "@/lib/llm";
import {
  CASE_SYSTEM,
  PROBE_SYSTEM,
  caseUser,
  probeUser,
} from "@/lib/llm/interview-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { loadKitInput, toRiskAtom, type KitAtom, type KitInput } from "@/lib/queries/interview";
import { caseSetSchema, probeSetSchema } from "@/lib/interview/schema";
import {
  buildCaseQuestions,
  buildProbeQuestions,
  type BuildResult,
  type BuiltQuestion,
  type PlanAtom,
} from "@/lib/interview/plan";
import type { Json } from "@/types/database";

export type KitOutcome = {
  kitId: string;
  total: number;
  probes: number;
  cases: number;
  warnings: string[];
  /** 因为编造 / 踩护栏被丢掉的题。用户有权知道丢了什么。 */
  rejected: { question: string; problems: string[] }[];
};

function refresh() {
  revalidatePath("/interview");
  revalidatePath("/resume");
}

function periodLabel(a: KitAtom): string {
  const s = a.periodStart?.slice(0, 7).replace("-", ".") ?? "";
  const e = a.periodEnd ? a.periodEnd.slice(0, 7).replace("-", ".") : "至今";
  return s === "" ? e : `${s} – ${e}`;
}

/** 这条经历里所有「有出处」的文字。防编造检查拿它当白名单。 */
function sourceTextOf(a: KitAtom): string {
  return [
    a.title,
    a.org,
    a.role,
    a.situation,
    a.task,
    ...a.actions,
    ...a.metrics.flatMap((m) => [m.name, m.fromValue, m.toValue, m.delta, m.method]),
    ...a.probes.flatMap((p) => [p.q, p.a_outline]),
    a.periodStart,
    a.periodEnd,
  ]
    .filter((s): s is string => typeof s === "string" && s !== "")
    .join("\n");
}

function toPlanAtom(a: KitAtom): PlanAtom {
  return {
    ...toRiskAtom(a),
    mustSay: a.mustSay,
    neverSay: a.neverSay,
    probes: a.probes,
    sourceText: sourceTextOf(a),
  };
}

/** 展开程度用块的实际形态说，不用配置里的权重 —— 模型该看到的是简历本身。 */
function spreadOf(a: KitAtom): string {
  if (!a.block) return "未出现在简历中";
  if (a.block.bullets.length === 0) return "只有一行概述";
  return `${a.block.bullets.length} 条要点`;
}

function usedAtomsJson(input: KitInput): string {
  return JSON.stringify(
    input.atoms.map((a) => ({
      id: a.id,
      title: a.title,
      org: a.org,
      role: a.role,
      period: periodLabel(a),
      status: a.status,
      evidence_level: a.evidenceLevel,
      situation: a.situation ?? "",
      task: a.task ?? "",
      actions: a.actions,
      metrics: a.metrics.map((m) => ({
        name: m.name,
        kind: m.kind,
        from: m.fromValue,
        to: m.toValue,
        delta: m.delta,
        evidence_level: m.evidenceLevel,
        // 口径。空的那些正是「有数字但答不上来怎么算的」那一档。
        method: m.method ?? "",
      })),
      guards: {
        must_say: a.mustSay,
        never_say: a.neverSay,
        probes: a.probes,
      },
      resume_spread: spreadOf(a),
      resume_text: a.block
        ? [a.block.title, a.block.summary, ...a.block.bullets].filter(Boolean).join("\n")
        : "",
    })),
  );
}

function requirementsJson(input: KitInput): string {
  return JSON.stringify(
    input.requirements.map((r) => ({
      index: r.index,
      text: r.text,
      kind: r.kind,
      raw_phrase: r.rawPhrase,
    })),
  );
}

/** 丢掉的题喂回模型。只说问题，不给替代答案 —— 替代答案又是一次编造。 */
function rejectFeedback(rejected: { question: string; problems: string[] }[]): string {
  if (rejected.length === 0) return "";
  const lines = rejected.map((r) => `- 「${r.question}」：${r.problems.join("；")}`);
  return `\n\n## 上一次这几道题被丢弃了，重出时避开同样的问题\n\n${lines.join("\n")}\n\n应答要点里的每一个事实都必须能在给定的经历数据里查到。`;
}

async function runProbes(input: KitInput, atoms: PlanAtom[]): Promise<BuildResult | string> {
  const base = probeUser({
    company: input.company || "（未填公司）",
    roleTitle: input.roleTitle || "（未填岗位）",
    requirementsJson: requirementsJson(input),
    usedAtomsJson: usedAtomsJson(input),
    resumeBlocksJson: JSON.stringify(
      input.blocks.map((b) => ({
        block_id: b.id,
        atom_id: b.atomId,
        section: b.section,
        title: b.title,
        meta: b.meta,
        summary: b.summary,
        bullets: b.bullets,
      })),
    ),
  });

  let best: BuildResult | null = null;
  const allRejected: { question: string; problems: string[] }[] = [];

  // 最多两次。第一次有题因为编造被丢才重来 —— 没问题就不该多花一次 strong 档。
  for (let pass = 0; pass < 2; pass++) {
    const res = await callLLM({
      tier: "strong",
      purpose: "interview_probe",
      system: PROBE_SYSTEM,
      user: base + rejectFeedback(allRejected),
      jsonSchema: probeSetSchema,
    });
    if (!res.ok) return res.error;

    const built = buildProbeQuestions(res.data.questions, atoms);
    allRejected.push(...built.rejected);
    // 重试只可能让题变多，所以取题多的那次。
    if (best === null || built.questions.length > best.questions.length) best = built;
    if (built.rejected.length === 0) break;
  }

  if (best === null) return "模型没有产出任何题目";
  return { ...best, rejected: allRejected };
}

async function runCases(
  input: KitInput,
  atoms: PlanAtom[],
  startOrder: number,
): Promise<BuildResult | string> {
  const res = await callLLM({
    tier: "strong",
    purpose: "interview_case",
    system: CASE_SYSTEM,
    user: caseUser({
      company: input.company || "（未填公司）",
      roleTitle: input.roleTitle || "（未填岗位）",
      requirementsJson: requirementsJson(input),
      // 案例题只要标题与技术栈概览。塞进 situation / actions，模型就会
      // 拿经历去套案例题，出来的不是能力题而是又一轮经历题。
      atomSummariesJson: JSON.stringify(
        input.atoms.map((a) => ({
          id: a.id,
          title: a.title,
          org: a.org,
          status: a.status,
          skills: a.skills,
        })),
      ),
      skillsJson: JSON.stringify(
        input.skills.map((s) => ({ label: s.label, category: s.category, depth: s.depth })),
      ),
    }),
    jsonSchema: caseSetSchema,
  });
  if (!res.ok) return res.error;
  return buildCaseQuestions(res.data.questions, atoms, startOrder);
}

async function writeKit(
  input: KitInput,
  questions: BuiltQuestion[],
): Promise<string | null> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("interview_kits")
    .select("id")
    .eq("resume_version_id", input.versionId)
    .maybeSingle();

  let kitId = existing?.id ?? null;
  if (kitId) {
    await supabase
      .from("interview_kits")
      .update({ generated_at: new Date().toISOString(), jd_id: input.jdId })
      .eq("id", kitId);
  } else {
    const { data: created } = await supabase
      .from("interview_kits")
      .insert({
        target_id: input.targetId,
        jd_id: input.jdId,
        resume_version_id: input.versionId,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    kitId = created?.id ?? null;
  }
  if (!kitId) return null;

  // 整包替换。练习状态的继承是 7.5 的事，这一片先把生成跑通。
  await supabase.from("interview_questions").delete().eq("kit_id", kitId);

  const { error } = await supabase.from("interview_questions").insert(
    questions.map((q) => ({
      kit_id: kitId,
      kind: q.kind,
      question: q.question,
      probe_type: q.probeType,
      difficulty: q.difficulty,
      from_atom_id: q.fromAtomId,
      from_existing_probe: q.fromExistingProbe,
      risk_level: q.riskLevel,
      risk_reason: q.riskReason,
      answer_outline: q.answerOutline as unknown as Json,
      dont_do: q.dontDo,
      data_gap_hint: q.dataGapHint,
      gap_metric_id: q.gapMetricId,
      related_atom_ids: q.relatedAtomIds as unknown as Json,
      why_this_question: q.whyThisQuestion,
      sort_order: q.sortOrder,
    })),
  );
  if (error) return null;
  return kitId;
}

/** 为一份投递版本生成题包。 */
export async function generateKit(versionId: string): Promise<ActionResult<KitOutcome>> {
  const input = await loadKitInput(versionId);
  if (!input) return fail("找不到这份投递版本");
  if (input.atoms.length === 0) {
    return fail("这份简历里没有可出题的经历，先去基线里选几条经历");
  }

  const atoms = input.atoms.map(toPlanAtom);

  const probeResult = await runProbes(input, atoms);
  if (typeof probeResult === "string") return fail(probeResult);

  const caseResult = await runCases(input, atoms, probeResult.questions.length);
  if (typeof caseResult === "string") return fail(caseResult);

  const questions = [...probeResult.questions, ...caseResult.questions];
  if (questions.length === 0) return fail("模型没有产出任何可用的题目，再试一次");

  const kitId = await writeKit(input, questions);
  if (!kitId) return fail("题目写入失败");

  refresh();
  return ok({
    kitId,
    total: questions.length,
    probes: probeResult.questions.length,
    cases: caseResult.questions.length,
    warnings: [...probeResult.warnings, ...caseResult.warnings],
    rejected: [...probeResult.rejected, ...caseResult.rejected],
  });
}
