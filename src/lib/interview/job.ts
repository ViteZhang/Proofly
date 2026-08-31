// =============================================================
// Proofly · 面试题包生成作业
//
// 为什么是后台作业：实测一次出题 10–35 分钟（三次真调 1175s / 1209s /
// 2092s）。提示词要「总数 15–20 题」，每道带 3–4 个应答要点，一次生成
// 1.3–1.6 万 completion token；三家供应商里只有一家能稳定在 200s 左右
// 跑完，另两家经常挂到时限再失败。挂在 Server Action 上等于要求用户
// 开着页面干等半小时，关掉就白跑。
//
// 所以照 Step 2 抽取作业那套：活跑在 after() 里，进度落库，页面轮询。
// 三个设计决定：
// 1. 深挖题跑完立刻落库，不等案例题 —— 前 18 道题是最该先看的那些，
//    没道理陪着后一半一起等。
// 2. 按题型分开写：inheritPractice 本来就不跨题型认领，所以深挖题那批
//    单独继承、单独落库，案例题失败也不会把已出的深挖题冲掉。
// 3. 心跳单开一个定时器。这里跟抽取作业不一样 —— 那边是几十条小调用，
//    自然有机会打点；这里整段时间都卡在一次 await 上，不单开就没人报活。
//
// 分两次模型调用不是为了省钱，是为了质量：项目深挖题要吃经历的全部
// 细节，案例题只要 JD 与技能概览。混在一次里，模型会拿经历去套案例题，
// 也会因为上下文太杂而把深挖题写得泛泛。
//
// 风险等级由代码判。模型输出里的风险标记一律不读。
// =============================================================

import { callLLM } from "@/lib/llm";
import {
  CASE_SYSTEM,
  PROBE_SYSTEM,
  caseUser,
  probeUser,
} from "@/lib/llm/interview-prompts";
import { createClient } from "@/lib/supabase/server";
import { parseStringList } from "@/lib/domain";
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
import type { Database, InterviewKind, Json, KitJobStage } from "@/types/database";

export type RejectedQuestion = { question: string; problems: string[] };

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

// ---- 落库 ----

/**
 * 写一批题，并把上一版的练习状态接过来。
 *
 * 按题型分批写：inheritPractice 不跨题型认领，所以深挖题那批可以在
 * 案例题还没跑完时就落库。案例题那次失败，已经出好的深挖题也不会被冲掉。
 */
async function writeKind(
  kitId: string,
  kinds: InterviewKind[],
  fresh: BuiltQuestion[],
  startOrder: number,
): Promise<{ inherited: number; carried: number; written: number } | null> {
  const supabase = await createClient();

  // 先把上一版标过的题读出来，再删。练习状态是用户花时间试出来的，
  // 一次重新生成抹掉它，他下次就不知道自己卡在哪了。
  const { data: priorRows } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("kit_id", kitId)
    .in("kind", kinds)
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

  const merged = inheritPractice(fresh, prior);

  await supabase.from("interview_questions").delete().eq("kit_id", kitId).in("kind", kinds);

  const { error } = await supabase.from("interview_questions").insert(
    merged.questions.map((q, i) => ({
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
      sort_order: startOrder + i,
    })),
  );
  if (error) return null;
  return { inherited: merged.inherited, carried: merged.carried, written: merged.questions.length };
}

// ---- 作业 ----

/** 干活期间多久报一次「我还活着」。要明显小于界面判定断线的阈值。 */
const HEARTBEAT_MS = 30_000;

type KitPatch = Database["public"]["Tables"]["interview_kits"]["Update"];

async function patch(kitId: string, values: KitPatch): Promise<void> {
  const supabase = await createClient();
  await supabase.from("interview_kits").update(values).eq("id", kitId);
}

async function failJob(kitId: string, message: string): Promise<void> {
  await patch(kitId, {
    job_status: "failed",
    job_stage: null,
    error_message: message,
    heartbeat_at: new Date().toISOString(),
  });
}

async function stage(kitId: string, s: KitJobStage): Promise<void> {
  await patch(kitId, { job_stage: s, heartbeat_at: new Date().toISOString() });
}

/**
 * 跑完一个出题作业。不抛异常 —— 失败写进 error_message，让界面有话可说。
 *
 * 可重入：从头再跑一次是安全的，落库按题型整批替换，练习状态照样继承。
 * 重入会重花一次模型钱，所以只在心跳停了、用户明确要求时才续。
 */
export async function runKitJob(kitId: string): Promise<void> {
  const beat = setInterval(() => {
    void patch(kitId, { heartbeat_at: new Date().toISOString() });
  }, HEARTBEAT_MS);

  try {
    const supabase = await createClient();
    const { data: kit } = await supabase
      .from("interview_kits")
      .select("id,resume_version_id,job_status")
      .eq("id", kitId)
      .maybeSingle();
    if (!kit?.resume_version_id) {
      await failJob(kitId, "这个题包没有对应的投递版本");
      return;
    }

    const input = await loadKitInput(kit.resume_version_id);
    if (!input) {
      await failJob(kitId, "找不到这份投递版本");
      return;
    }
    if (input.atoms.length === 0) {
      await failJob(kitId, "这份简历里没有可出题的经历，先去基线里选几条经历");
      return;
    }

    const atoms = input.atoms.map(toPlanAtom);
    const warnings: string[] = [];
    const rejected: RejectedQuestion[] = [];

    // ---- 阶段一：项目深挖题 ----
    await stage(kitId, "probing");
    const probeResult = await runProbes(input, atoms);
    if (typeof probeResult === "string") {
      await failJob(kitId, `出项目深挖题时失败：${probeResult}`);
      return;
    }
    warnings.push(...probeResult.warnings);
    rejected.push(...probeResult.rejected);

    const probeWrite = await writeKind(kitId, ["project_probe"], probeResult.questions, 0);
    if (!probeWrite) {
      await failJob(kitId, "项目深挖题写入失败");
      return;
    }
    if (probeWrite.inherited > 0) {
      warnings.push(`${probeWrite.inherited} 道深挖题继承了上一版的练习状态`);
    }
    if (probeWrite.carried > 0) {
      warnings.push(`${probeWrite.carried} 道标着「答不好」的旧深挖题这一版没再出，已原样保留`);
    }
    // 深挖题先落库先能看：这十几道题正是最该先准备的那些。
    await patch(kitId, {
      probe_count: probeWrite.written,
      warnings: warnings as unknown as Json,
      rejected: rejected as unknown as Json,
      heartbeat_at: new Date().toISOString(),
    });

    // ---- 阶段二：案例题 ----
    await stage(kitId, "casing");
    const caseResult = await runCases(input, atoms, probeWrite.written);
    if (typeof caseResult === "string") {
      // 深挖题已经落库了，不算全盘失败 —— 但要说清楚少了半边。
      await patch(kitId, {
        job_status: "failed",
        job_stage: null,
        error_message: `深挖题已经出好了，案例题这次没出上：${caseResult}`,
        warnings: warnings as unknown as Json,
        rejected: rejected as unknown as Json,
        heartbeat_at: new Date().toISOString(),
      });
      return;
    }
    warnings.push(...caseResult.warnings);
    rejected.push(...caseResult.rejected);

    await stage(kitId, "writing");
    const caseWrite = await writeKind(
      kitId,
      ["product_case", "ai_tech", "data_case"],
      caseResult.questions,
      probeWrite.written,
    );
    if (!caseWrite) {
      await failJob(kitId, "案例题写入失败");
      return;
    }
    if (caseWrite.inherited > 0) {
      warnings.push(`${caseWrite.inherited} 道案例题继承了上一版的练习状态`);
    }
    if (caseWrite.carried > 0) {
      warnings.push(`${caseWrite.carried} 道标着「答不好」的旧案例题这一版没再出，已原样保留`);
    }

    await patch(kitId, {
      job_status: "done",
      job_stage: null,
      error_message: null,
      probe_count: probeWrite.written,
      case_count: caseWrite.written,
      generated_at: new Date().toISOString(),
      warnings: warnings as unknown as Json,
      rejected: rejected as unknown as Json,
      heartbeat_at: new Date().toISOString(),
    });
  } catch (e) {
    // 后台作业没人接住异常。吞掉但写进 error_message，
    // 否则作业会一直标着 running，界面看着跟死了一样还不报错。
    await failJob(kitId, e instanceof Error ? e.message : "出题时出了意外");
  } finally {
    clearInterval(beat);
  }
}
