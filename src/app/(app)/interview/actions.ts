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
import { fail, ok, parseStringList, type ActionResult } from "@/lib/domain";
import {
  loadKitInput,
  parseOutline,
  toRiskAtom,
  type KitAtom,
  type KitInput,
} from "@/lib/queries/interview";
import { inheritPractice, type PriorQuestion } from "@/lib/interview/inherit";
import { caseSetSchema, probeSetSchema } from "@/lib/interview/schema";
import {
  buildCaseQuestions,
  buildProbeQuestions,
  techVocabulary,
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
    ...a.metrics.flatMap((m) => [
      m.name,
      m.fromValue,
      m.toValue,
      m.delta,
      m.method,
    ]),
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
        ? [a.block.title, a.block.summary, ...a.block.bullets]
            .filter(Boolean)
            .join("\n")
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

/**
 * 项目深挖题：一次调用，长时限。
 *
 * 实测这一段是全项目最重的一次生成 —— 提示词要「总数 15–20 题」，每道
 * 带 3–4 个应答要点、别做的事与缺数据提示，单次输出上万 token，从头到尾
 * 300–500 秒。默认的 5 分钟总时限会把它当成卡死掐掉。
 *
 * 试过按经历切批并行，没用：模型是照着「15–20 题」这条数量要求写的，
 * 给它一条经历它照样出 18 道题（实测 486s）。切批只会把同样的输出量
 * 乘上批数。所以还是一次调用，把时限放到 10 分钟。
 */
const PROBE_DEADLINE_MS = 600_000;

async function runProbes(
  input: KitInput,
  atoms: PlanAtom[],
): Promise<BuildResult | string> {
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

  const res = await callLLM({
    tier: "strong",
    purpose: "interview_probe",
    system: PROBE_SYSTEM,
    user: base,
    jsonSchema: probeSetSchema,
    deadlineMs: PROBE_DEADLINE_MS,
    // 默认 16000 不够：实测输出打到 13–15k token 就被截断，截断的那一份
    // 连 JSON 都不完整，等于整次白跑。推理模型的思考 token 也算在这里，
    // 所以要留出两倍余量。
    maxTokens: 32000,
    // 校验失败不再补一轮。这一次已经十分钟了，再来一轮等于二十分钟，
    // 那时候用户早就走开了 —— 不如让他看到失败，自己决定要不要重来。
    maxRetries: 0,
  });
  if (!res.ok) return res.error;

  return buildProbeQuestions(res.data.questions, atoms);
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
        input.skills.map((s) => ({
          label: s.label,
          category: s.category,
          depth: s.depth,
        })),
      ),
    }),
    jsonSchema: caseSetSchema,
    // 比深挖题轻（不吃经历细节），但同样是 15–24 道题的结构化输出。
    deadlineMs: 480_000,
    maxTokens: 32000,
  });
  if (!res.ok) return res.error;

  // 技术词表 = 技能标签 + 经历正文 + JD 原文。三边都没有的技术名，
  // 就是模型自己想出来的。
  const vocab = techVocabulary([
    ...input.skills.map((s) => s.label),
    ...input.atoms.flatMap((a) => [
      a.title,
      ...a.skills,
      ...a.actions,
      a.situation ?? "",
      a.task ?? "",
    ]),
    ...input.requirements.flatMap((r) => [r.text, r.rawPhrase]),
  ]);
  return buildCaseQuestions(res.data.questions, atoms, startOrder, vocab);
}

async function writeKit(
  input: KitInput,
  questions: BuiltQuestion[],
): Promise<{ kitId: string; inherited: number; carried: number } | null> {
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

  // 先把上一版标过的题读出来，再删。练习状态是用户花时间试出来的，
  // 一次重新生成抹掉它，下次他就不知道自己卡在哪了。
  const { data: priorRows } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("kit_id", kitId)
    .neq("practice_status", "untouched");

  const prior: PriorQuestion[] = (priorRows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    question: r.question,
    probeType: r.probe_type,
    difficulty: r.difficulty,
    fromAtomId: r.from_atom_id,
    fromExistingProbe: r.from_existing_probe ?? false,
    riskLevel: r.risk_level,
    riskReason: r.risk_reason,
    answerOutline: parseOutline(r.answer_outline),
    dontDo: r.dont_do,
    dataGapHint: r.data_gap_hint,
    gapMetricId: r.gap_metric_id,
    relatedAtomIds: parseStringList(r.related_atom_ids),
    whyThisQuestion: r.why_this_question,
    practiceStatus: r.practice_status,
    practiceNote: r.practice_note,
  }));

  const merged = inheritPractice(questions, prior);

  await supabase.from("interview_questions").delete().eq("kit_id", kitId);

  const { error } = await supabase.from("interview_questions").insert(
    merged.questions.map((q) => ({
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
      practice_status: q.practiceStatus,
      practice_note: q.practiceNote,
      carried_over: q.carriedOver,
      sort_order: q.sortOrder,
    })),
  );
  if (error) return null;
  return { kitId, inherited: merged.inherited, carried: merged.carried };
}

/** 为一份投递版本生成题包。 */
export async function generateKit(
  versionId: string,
): Promise<ActionResult<KitOutcome>> {
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
  if (questions.length === 0)
    return fail("模型没有产出任何可用的题目，再试一次");

  const written = await writeKit(input, questions);
  if (!written) return fail("题目写入失败");

  const warnings = [...probeResult.warnings, ...caseResult.warnings];
  if (written.inherited > 0) {
    warnings.push(`${written.inherited} 道题继承了上一版的练习状态`);
  }
  if (written.carried > 0) {
    warnings.push(
      `${written.carried} 道标着「答不好」的旧题这一版没再出，已原样保留`,
    );
  }

  refresh();
  return ok({
    kitId: written.kitId,
    total: questions.length,
    probes: probeResult.questions.length,
    cases: caseResult.questions.length,
    warnings,
    rejected: [...probeResult.rejected, ...caseResult.rejected],
  });
}
