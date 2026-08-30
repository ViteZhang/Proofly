// =============================================================
// Proofly · 随手记的 Stage B → Stage C
//
// Stage B 把一句话拆成 N 个变更单元，每个单元各自走一遍 Stage C
// 定位到某条已有经历（UPDATE）、判为新经历（CREATE）、或者拿不准（ASK）。
// 每个单元产出一张确认卡，在对话流里依次排开，用户逐条处理。
//
// 复用 Step 2 的两样东西：findSimilarAtoms 做召回，drafts 表做暂存。
// 不另起一套平行结构——入库、撤销、校对都还得认同一张表。
//
// 这一片只到「卡片摆出来」为止。连带影响是 3.4，确认入库是 3.6。
// =============================================================

import { fail, ok, type ActionResult } from "@/lib/domain";
import { findSimilarAtoms, type SimilarAtom } from "@/lib/ingest/embedding";
import { callLLM } from "@/lib/llm";
import {
  STAGE_B_SYSTEM,
  STAGE_C_SYSTEM,
  stageBUser,
  stageCUser,
} from "@/lib/llm/chat-prompts";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { toMessageView, type ChatMessageView } from "./message-shape";
import { MAX_UNITS, stageBSchema, stageCSchema, type ChangeUnit } from "./schema";

const RECALL_N = 5;
const UNIT_CONCURRENCY = 3;

// 0.75 是硬线，与 Step 2 和 drafts 表上的 CHECK 一致。
// 判错的代价不对称：该更新却新建，档案里会长出重复条目，用户很难发现。
const CONFIDENCE_GATE = 0.75;

export type RecordResult = {
  messages: ChatMessageView[];
  /** 拆出来的单元数，用来在界面上说「拆成了 2 条」 */
  units: number;
};

/**
 * 回流时带上的任务上下文（Step 5 · 5.5）。
 *
 * 有它，Stage C 的判定准确率会明显不一样：这段内容本来就是围着某个项目做的，
 * 把那条经历顶到候选第一位、并在 user 里点明来源，UPDATE 才判得对；
 * 否则模型很容易把「给知识宇宙做了评测」判成一条新经历，档案里长出重复。
 */
export type TaskContext = {
  taskTitle: string;
  anchorAtomId: string | null;
  anchorTitle: string | null;
};

export async function runRecord(v: {
  userMessage: string;
  recentTurns: string;
  imagePath: string | null;
  imageOcrText: string;
  taskContext?: TaskContext | null;
}): Promise<ActionResult<RecordResult>> {
  const supabase = await createClient();

  // ---- Stage B ----
  const split = await callLLM({
    tier: "strong",
    purpose: "chat_stage_b",
    system: STAGE_B_SYSTEM,
    user: stageBUser({
      recentTurns: v.recentTurns,
      userMessage: v.userMessage,
      imageOcrText: v.imageOcrText,
    }),
    jsonSchema: stageBSchema,
  });
  if (!split.ok) return fail(split.error);

  const all = split.data.units;
  const units = all.slice(0, MAX_UNITS);
  // 「不超过 4 个」由代码兜底。模型一兴奋能拆出十个来，
  // 提示词让它自己把多的写进 overflow_note，但那是它自觉的事，不能指望。
  const overflow =
    all.length > MAX_UNITS
      ? [split.data.overflow_note, `还有 ${all.length - MAX_UNITS} 件事这次没处理，分开说一次吧。`]
          .filter((s) => s.trim() !== "")
          .join(" ")
      : split.data.overflow_note;

  if (units.length === 0) {
    return ok({ messages: [], units: 0 });
  }

  // ---- 作业：对话摄入复用 ingest_jobs，input_type = 'chat' ----
  const { data: job, error: jobError } = await supabase
    .from("ingest_jobs")
    .insert({
      input_type: "chat",
      raw_input: v.userMessage,
      status: "extracting",
      progress_stage: "extracting",
      progress_total: units.length,
      progress_current: 0,
      heartbeat_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobError || !job) return fail(`没能开始处理：${jobError?.message ?? "未知错误"}`);

  // ---- Stage C：逐个单元 ----
  // 并发跑，但结果按单元顺序摆卡——用户说的第一件事就该排在第一张。
  const results: (Placed | { error: string })[] = new Array(units.length);
  await inBatches(units.length, UNIT_CONCURRENCY, async (i) => {
    try {
      results[i] = await locateOne(job.id, units[i], i, v, split.usage.provider);
    } catch (e) {
      results[i] = { error: e instanceof Error ? e.message : "处理这条时出了意外" };
    }
  });

  const messages: ChatMessageView[] = [];
  let done = 0;
  for (const r of results) {
    if ("error" in r) {
      const m = await say(job.id, `有一条没处理成：${r.error}`, "text", {});
      if (m) messages.push(m);
      continue;
    }
    done++;
    const m = await say(job.id, r.summary, "confirm_card", r.payload);
    if (m) messages.push(m);
  }

  if (overflow.trim() !== "") {
    const m = await say(job.id, overflow.trim(), "text", {});
    if (m) messages.push(m);
  }

  await supabase
    .from("ingest_jobs")
    .update({
      status: done > 0 ? "awaiting_review" : "discarded",
      progress_stage: "finishing",
      progress_current: done,
    })
    .eq("id", job.id);

  return ok({ messages, units: units.length });
}

// ---------------------------------------------------------------

type Placed = { summary: string; payload: Json };

async function locateOne(
  jobId: string,
  unit: ChangeUnit,
  index: number,
  v: { userMessage: string; imagePath: string | null; taskContext?: TaskContext | null },
  splitProvider: string,
): Promise<Placed | { error: string }> {
  const probe = [unit.subject_hint, unit.user_words].filter((s) => s.trim() !== "").join(" ");
  const { atoms, degraded } = await findSimilarAtoms(
    probe === "" ? v.userMessage : probe,
    RECALL_N,
  );
  // 回流：挂靠项目顶到候选第一位。召回没捞到它也补进来 —— 这段内容
  // 本来就是围着它做的，它不在候选里，UPDATE 根本无从判起。
  const ranked = await pinAnchor(atoms, v.taskContext?.anchorAtomId ?? null);
  const candidates = await withEvidence(ranked);

  // 提示词本身逐字不动，只在 user 末尾附一句来源说明。
  const stageCUserText =
    stageCUser({
      unitJson: JSON.stringify(unit, null, 2),
      userMessage: v.userMessage,
      candidatesJson:
        candidates.length === 0
          ? "（使用者的经历库是空的，或者没有相似的条目）"
          : JSON.stringify(candidates, null, 2),
    }) + taskContextLine(v.taskContext ?? null);

  const verdict = await callLLM({
    tier: "strong",
    purpose: "chat_stage_c",
    system: STAGE_C_SYSTEM,
    user: stageCUserText,
    jsonSchema: stageCSchema,
  });
  if (!verdict.ok) return { error: verdict.error };

  const c = verdict.data;

  // 目标 id 必须真的在候选里——模型偶尔会编一个 uuid 出来
  const known = new Set(ranked.map((a) => a.id));
  const target = c.target_atom_id && known.has(c.target_atom_id) ? c.target_atom_id : null;
  const parent = c.parent_atom_id && known.has(c.parent_atom_id) ? c.parent_atom_id : null;

  // 三道降级，都往 ASK 走：置信度不够、说要更新却没给目标、给的目标是编的。
  let intent: "CREATE" | "UPDATE" | "ASK" = c.intent;
  if (intent !== "ASK" && c.confidence < CONFIDENCE_GATE) intent = "ASK";
  if (intent === "UPDATE" && target === null) intent = "ASK";

  const supabase = await createClient();
  const { data: draft, error } = await supabase
    .from("drafts")
    .insert({
      ingest_job_id: jobId,
      intent,
      target_atom_id: target,
      payload: {
        source: "chat",
        unit,
        unit_index: index,
        parent_atom_id: parent,
        options: c.options,
        user_words: unit.user_words,
        image_path: v.imagePath,
        recall_degraded: degraded,
        served_by: { split: splitProvider, locate: verdict.usage.provider },
      } as unknown as Json,
      diff: { entries: c.diff } as unknown as Json,
      confidence: c.confidence,
      ai_note: c.ai_note,
    })
    .select("id")
    .single();
  if (error || !draft) return { error: `存草稿失败：${error?.message ?? "未知错误"}` };

  const title =
    intent === "UPDATE"
      ? (ranked.find((a) => a.id === target)?.title ?? unit.subject_hint)
      : unit.subject_hint;

  return {
    summary: headline(intent, title),
    payload: {
      draft_id: draft.id,
      intent,
      target_atom_id: target,
      parent_atom_id: parent,
      target_title: ranked.find((a) => a.id === target)?.title ?? "",
      confidence: c.confidence,
      ai_note: c.ai_note,
      unit: unit as unknown as Json,
      diff: c.diff,
      options: c.options,
      recall_degraded: degraded,
      image_path: v.imagePath,
      // 3.4 补上连带影响后往这里填，界面按 kind 渲染
      ripple: [],
    } as unknown as Json,
  };
}

function headline(intent: "CREATE" | "UPDATE" | "ASK", title: string): string {
  const name = title.trim() === "" ? "这件事" : `「${title.trim()}」`;
  if (intent === "UPDATE") return `要更新 ${name}`;
  if (intent === "CREATE") return `这是一条新经历：${name}`;
  return `${name}我没把准该落到哪条，你来定`;
}

/**
 * 给召回结果补上 evidence_level 与最近更新时间。
 *
 * 不去改 findSimilarAtoms 的返回结构：那份结构同时喂着 Step 2 的 Pass 3，
 * 而 Pass 3 的提示词里写死了「每条候选包含」哪几项。往那边多塞两个字段，
 * 等于在没改提示词的情况下改了它看到的东西。
 */
/** 挂靠项目置顶；召回没带上就补一条进来。 */
async function pinAnchor(
  atoms: SimilarAtom[],
  anchorId: string | null,
): Promise<SimilarAtom[]> {
  if (!anchorId) return atoms;

  const hit = atoms.find((a) => a.id === anchorId);
  if (hit) return [hit, ...atoms.filter((a) => a.id !== anchorId)];

  const supabase = await createClient();
  const { data } = await supabase
    .from("atoms")
    .select("id, title, org, role, level, status, period_start, period_end, situation")
    .eq("id", anchorId)
    .maybeSingle();
  if (!data) return atoms;

  // similarity 填 1：它不是召回来的，是任务指名的，理应排在最前。
  const pinned: SimilarAtom = {
    id: data.id,
    title: data.title,
    org: data.org,
    role: data.role,
    level: data.level,
    status: data.status,
    period: `${data.period_start ?? "?"} ~ ${data.period_end ?? "至今"}`,
    situation: data.situation ?? "",
    metricNames: [],
    pendingNames: [],
    similarity: 1,
  };
  return [pinned, ...atoms];
}

function taskContextLine(ctx: TaskContext | null): string {
  if (!ctx) return "";
  const anchor = ctx.anchorTitle ? `，挂靠项目为 ${ctx.anchorTitle}` : "";
  return `\n\n这段内容来自一项针对『${ctx.taskTitle}』的工作${anchor}。`;
}

async function withEvidence(atoms: SimilarAtom[]): Promise<Record<string, unknown>[]> {
  if (atoms.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("atoms")
    .select("id, evidence_level, updated_at")
    .in("id", atoms.map((a) => a.id));

  const extra = new Map((data ?? []).map((r) => [r.id, r]));
  return atoms.map((a) => {
    const e = extra.get(a.id);
    return {
      id: a.id,
      title: a.title,
      org: a.org ?? "",
      role: a.role ?? "",
      period: a.period,
      status: a.status,
      evidence_level: e?.evidence_level ?? "",
      situation: a.situation,
      metric_names: a.metricNames,
      pending_metrics: a.pendingNames,
      last_updated: lastUpdated(e?.updated_at ?? null),
      similarity: a.similarity,
    };
  });
}

function lastUpdated(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  return `${iso.slice(0, 10)}（${days} 天前）`;
}

async function say(
  jobId: string,
  content: string,
  kind: "text" | "confirm_card",
  payload: Json,
): Promise<ChatMessageView | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .insert({ role: "assistant", kind, content, payload, ingest_job_id: jobId })
    .select("id, role, kind, content, image_path, payload, created_at")
    .single();
  return data === null ? null : toMessageView(data);
}

async function inBatches(
  n: number,
  concurrency: number,
  run: (i: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, n) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= n) return;
        await run(i);
      }
    }),
  );
}
