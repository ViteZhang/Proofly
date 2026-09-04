// =============================================================
// Proofly · 抽取作业编排
//
// Pass 1 切分（一次）→ Pass 2 结构化（并发 3）→ Pass 3 意图判定 → 写 drafts。
//
// 三个设计决定：
// 1. 用 after() 把活留在响应之后跑，页面关掉作业照样继续。
// 2. Pass 1 的候选清单落库（ingest_jobs.candidates），带每条的状态。
//    有它才能做到「某条失败单独重试」和「刷新页面进度不丢」。
// 3. 每条 Pass 2 完成后立刻接 Pass 3 并写 draft，边抽边出结果，
//    不等全部跑完——进度条上的数字才是真的。
// =============================================================

import { callLLM } from "@/lib/llm";
import {
  PASS1_SYSTEM,
  PASS2_SYSTEM,
  PASS3_SYSTEM,
  pass1User,
  pass2User,
  pass3User,
} from "@/lib/llm/prompts";
import { releaseJob, settleJob } from "@/lib/billing/async";
import { quoteParse } from "@/lib/billing/estimate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { findSimilarAtoms } from "./embedding";
import { locate } from "./locate";
import { pass1Schema, pass2Schema, pass3Schema, type ExtractedAtom } from "./schema";

export type CandidateState = "pending" | "done" | "failed";

export type Candidate = {
  index: number;
  title: string;
  org: string;
  start_marker: string;
  end_marker: string;
  note: string;
  state: CandidateState;
  error: string | null;
};

const PASS2_CONCURRENCY = 3;

// 干活期间多久报一次「我还活着」。要明显小于界面判定断线的 6 分钟。
const HEARTBEAT_MS = 30_000;

// 单份文档最多抽这么多条。Pass 1 偶尔会把目录当成经历切出几十条，
// 真跑起来又慢又贵，先截断并在界面上说清楚。
const MAX_CANDIDATES = 40;

/**
 * 跑完一个作业。可重入：已经 done 的候选不会重跑。
 * 不抛异常——失败写进 ingest_jobs.error_message，让界面有话可说。
 */
export async function runJob(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("ingest_jobs")
    .select("id, status, candidates, source_doc_id, raw_input")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.status === "committed" || job.status === "discarded") return;

  const fullText = await loadText(job.source_doc_id, job.raw_input);
  if (fullText === null || fullText.trim() === "") {
    await failJob(jobId, "这份文档没有可读的正文");
    return;
  }
  const docTitle = await loadTitle(job.source_doc_id);

  let candidates = parseCandidates(job.candidates);

  // ---- Pass 1：只在还没切过时跑 ----
  if (candidates.length === 0) {
    await supabase
      .from("ingest_jobs")
      .update({ progress_stage: "segmenting", heartbeat_at: new Date().toISOString() })
      .eq("id", jobId);

    const r = await callLLM({
      tier: "light",
      purpose: "pass1_segment",
      system: PASS1_SYSTEM,
      user: pass1User(fullText),
      jsonSchema: pass1Schema,
    });
    if (!r.ok) {
      await failJob(jobId, `通读文档时出错：${r.error}`);
      return;
    }

    candidates = r.data.slice(0, MAX_CANDIDATES).map((c, i) => ({
      index: c.index || i + 1,
      title: c.title,
      org: c.org,
      start_marker: c.start_marker,
      end_marker: c.end_marker,
      note: c.note,
      state: "pending" as CandidateState,
      error: null,
    }));

    await supabase
      .from("ingest_jobs")
      .update({
        candidates: candidates as unknown as Json,
        progress_stage: "extracting",
        progress_total: candidates.length,
        progress_current: 0,
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // 一条经历都没有也是正常结果，不硬凑。
    // 直接标 discarded：没有草稿可校对，留在 awaiting_review 会让导入页
    // 每次打开都把这个空作业顶出来，挡住上传区。
    if (candidates.length === 0) {
      // 一条都没切出来，用户什么也没得到 —— 全额退回。
      await releaseJob(jobId, "no_segments");
      await supabase
        .from("ingest_jobs")
        .update({ status: "discarded", progress_stage: "finishing" })
        .eq("id", jobId);
      return;
    }
  }

  // ---- Pass 2 + Pass 3：逐条，并发 3 ----
  await runCandidates(jobId, fullText, docTitle, candidates);
}

/**
 * 把某一条标回待处理，并把作业推回 extracting。
 *
 * 必须在 Server Action 里同步做完再调 retryCandidate——否则前端下一次轮询
 * 看到的还是 awaiting_review，会立刻停掉轮询，界面就卡在旧数字上。
 */
export async function markCandidatePending(
  jobId: string,
  index: number,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("ingest_jobs")
    .select("candidates")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return false;

  const all = parseCandidates(job.candidates);
  const one = all.find((c) => c.index === index);
  if (!one) return false;

  one.state = "pending";
  one.error = null;
  await writeCandidates(jobId, all);
  await supabase
    .from("ingest_jobs")
    .update({ status: "extracting", error_message: null })
    .eq("id", jobId);
  return true;
}

/** 单独重跑某一条，其余不动。调用前先 markCandidatePending。 */
export async function retryCandidate(jobId: string, index: number): Promise<void> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("ingest_jobs")
    .select("id, candidates, source_doc_id, raw_input")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;

  const all = parseCandidates(job.candidates);
  if (!all.some((c) => c.index === index)) return;

  const fullText = await loadText(job.source_doc_id, job.raw_input);
  if (fullText === null) return;
  const docTitle = await loadTitle(job.source_doc_id);

  await runCandidates(jobId, fullText, docTitle, all, [index]);
}

// ---------------------------------------------------------------

async function runCandidates(
  jobId: string,
  fullText: string,
  docTitle: string,
  all: Candidate[],
  onlyIndexes?: number[],
): Promise<void> {
  const todo = all.filter(
    (c) =>
      c.state !== "done" &&
      (onlyIndexes === undefined || onlyIndexes.includes(c.index)),
  );

  // 干活期间一直跳心跳。只在「一条抽完」时才跳是不够的：一条慢的调用要几分钟，
  // 期间心跳不动，界面会判定作业断了并自动续跑——于是同一批候选被两个 worker
  // 同时抽，钱翻倍。心跳的含义必须是「进程还活着」，不是「又抽完一条」。
  const beat = setInterval(() => void touch(jobId), HEARTBEAT_MS);
  try {
    await inBatches(todo.length, PASS2_CONCURRENCY, async (i) => {
      const c = todo[i];
      // handleOne 约定是返回错误而不是抛，但它下面还有一串调用。
      // 真抛出来一个，Promise.all 会整批拒掉，剩下的候选全留在 pending——
      // 界面上就是「进度停住、没有错误、也没有按钮」，最难查的那种。
      let err: string | null;
      try {
        err = await handleOne(jobId, fullText, docTitle, c, all.length);
      } catch (e) {
        err = e instanceof Error ? e.message : "抽这条时出了意外";
      }
      c.state = err === null ? "done" : "failed";
      c.error = err;
      await writeCandidates(jobId, all);
      await bumpProgress(jobId, all);
    });
  } finally {
    clearInterval(beat);
  }

  await finishIfDone(jobId, all);
}

async function touch(jobId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ingest_jobs")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function handleOne(
  jobId: string,
  fullText: string,
  docTitle: string,
  c: Candidate,
  total: number,
): Promise<string | null> {
  const at = locate(fullText, { start: c.start_marker, end: c.end_marker }, {
    index: c.index,
    total,
  });

  // ---- Pass 2 ----
  const extract = await callLLM({
    tier: "strong",
    purpose: "pass2_extract",
    system: PASS2_SYSTEM,
    user: pass2User({
      contextBefore: at.contextBefore,
      targetText: at.target,
      contextAfter: at.contextAfter,
      docTitle,
    }),
    jsonSchema: pass2Schema,
  });
  if (!extract.ok) return extract.error;

  const atom = extract.data;
  if (atom.title.trim() === "") return "抽出来没有标题，这条不可用";

  // ---- Pass 3 ----
  const { atoms: similar, degraded } = await findSimilarAtoms(
    [atom.title, atom.org, atom.situation].filter(Boolean).join(" "),
  );

  const verdict = await callLLM({
    tier: "strong",
    purpose: "pass3_intent",
    system: PASS3_SYSTEM,
    user: pass3User({
      newAtomJson: JSON.stringify(forVerdict(atom), null, 2),
      candidatesJson:
        similar.length === 0
          ? "（使用者的经历库是空的，或者没有相似的条目）"
          : JSON.stringify(similar, null, 2),
    }),
    jsonSchema: pass3Schema,
  });
  if (!verdict.ok) return verdict.error;

  const v = verdict.data;

  // 数据库那条约束（intent<>ASK 时 confidence 必须 ≥0.75）是最后一道闸。
  // 与其让插入报错，不如在这里如实降级成 ASK——这正是提示词要求的保守行为。
  const intent = v.intent !== "ASK" && v.confidence < 0.75 ? "ASK" : v.intent;

  // 目标 id 必须真的在候选里，模型偶尔会编一个 uuid
  const known = new Set(similar.map((s) => s.id));
  const target = v.target_atom_id && known.has(v.target_atom_id) ? v.target_atom_id : null;
  const parent = v.parent_atom_id && known.has(v.parent_atom_id) ? v.parent_atom_id : null;

  // Pass 3 判定这条挂在某个项目下时，它就是一个能力点。
  // Pass 2 看到的是孤立片段，只会说 project——不在这里改过来，
  // 入库时会变成「项目套项目」，树的层级就乱了。
  const payloadAtom =
    parent !== null && atom.level === "project"
      ? { ...atom, level: "capability_slice" as const, children: [] }
      : atom;

  const supabase = await createClient();

  // 续跑 / 重试同一条时，把上一轮留下的待校对草稿先清掉。
  // 「写完草稿」和「标记这条完成」是两次写，中间断电就会留下一份孤儿草稿，
  // 不清就会在校对队列里出现两条一样的。只删 pending——已经确认过的不能碰。
  await supabase
    .from("drafts")
    .delete()
    .eq("ingest_job_id", jobId)
    .eq("review_status", "pending")
    .eq("payload->>candidate_index", String(c.index));

  const { error } = await supabase.from("drafts").insert({
    ingest_job_id: jobId,
    intent: intent === "UPDATE" && target === null ? "ASK" : intent,
    target_atom_id: target,
    payload: {
      atom: payloadAtom,
      parent_atom_id: parent,
      options: v.options,
      candidate_index: c.index,
      locate_fuzzy: at.fuzzy,
      recall_degraded: degraded,
      // 记下这两步各是哪家做的。链上换了家，卡片要说出来——
      // 上一次兜底整晚没生效，界面上一点痕迹都没有，只能翻数据库才发现。
      served_by: { extract: extract.usage.provider, verdict: verdict.usage.provider },
      // 提示词写死了单个项目下的能力点不超过 8 个。超了就是切得太细，
      // 不拦下来，但要在卡片上说一句，让人扫一眼再收。
      too_many_children: payloadAtom.children.length > 8,
    } as unknown as Json,
    diff: { entries: v.diff } as unknown as Json,
    confidence: v.confidence,
    ai_note: v.ai_note,
  });
  return error ? `存草稿失败：${error.message}` : null;
}

// 送进 Pass 3 的是抽取结果本身，但去掉 source_excerpt / ai_note——
// 那两个字段是给人看的，塞进去只会干扰判定。
function forVerdict(a: ExtractedAtom): Omit<ExtractedAtom, "source_excerpt" | "ai_note"> {
  const rest = { ...a };
  delete (rest as Partial<ExtractedAtom>).source_excerpt;
  delete (rest as Partial<ExtractedAtom>).ai_note;
  return rest;
}

// ---------------------------------------------------------------

async function loadText(
  sourceDocId: string | null,
  rawInput: string | null,
): Promise<string | null> {
  if (rawInput && rawInput.trim() !== "") return rawInput;
  if (!sourceDocId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("source_docs")
    .select("parsed_text")
    .eq("id", sourceDocId)
    .maybeSingle();
  return data?.parsed_text ?? null;
}

async function loadTitle(sourceDocId: string | null): Promise<string> {
  if (!sourceDocId) return "（对话输入）";
  const supabase = await createClient();
  const { data } = await supabase
    .from("source_docs")
    .select("filename")
    .eq("id", sourceDocId)
    .maybeSingle();
  return data?.filename ?? "（未命名文档）";
}

export function parseCandidates(v: Json | null | undefined): Candidate[] {
  if (!Array.isArray(v)) return [];
  const out: Candidate[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json | undefined>;
    if (typeof o.index !== "number") continue;
    out.push({
      index: o.index,
      title: str(o.title),
      org: str(o.org),
      start_marker: str(o.start_marker),
      end_marker: str(o.end_marker),
      note: str(o.note),
      state:
        o.state === "done" || o.state === "failed" ? o.state : "pending",
      error: typeof o.error === "string" ? o.error : null,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

const str = (v: Json | undefined): string => (typeof v === "string" ? v : "");

async function writeCandidates(jobId: string, all: Candidate[]): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ingest_jobs")
    .update({
      candidates: all as unknown as Json,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function bumpProgress(jobId: string, all: Candidate[]): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ingest_jobs")
    .update({
      progress_current: all.filter((c) => c.state === "done").length,
      progress_total: all.length,
    })
    .eq("id", jobId);
}

async function finishIfDone(jobId: string, all: Candidate[]): Promise<void> {
  if (all.some((c) => c.state === "pending")) return;
  const supabase = await createClient();
  const failed = all.filter((c) => c.state === "failed");

  // 按**真实段数**结算。少于预估就退差额，多于预估仍按预估收 ——
  // 预估偏差是我们的问题，不该用户买单（C2 2.1）。
  await settleParse(jobId, all.filter((c) => c.state === "done").length);

  // 一条草稿都没产出（全失败，或候选全被判定为不可用）→ 没什么可校对的。
  // 但如果是「有失败可重试」，就还得留在 awaiting_review，否则重试按钮没了。
  const { count } = await supabase
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("ingest_job_id", jobId)
    .eq("review_status", "pending");
  const barren = (count ?? 0) === 0 && failed.length === 0;

  await supabase
    .from("ingest_jobs")
    .update({
      status: barren ? "discarded" : "awaiting_review",
      progress_stage: "finishing",
      error_message:
        failed.length === 0
          ? null
          : `有 ${failed.length} 条没抽出来，可以单独重试`,
    })
    .eq("id", jobId);
}

/** 按真实段数结算这次解析。 */
async function settleParse(jobId: string, doneSegments: number): Promise<void> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("ingest_jobs")
    .select("source_doc_id")
    .eq("id", jobId)
    .maybeSingle();
  let scanPages = 0;
  if (job?.source_doc_id) {
    const { data: doc } = await supabase
      .from("source_docs")
      .select("scan_pages")
      .eq("id", job.source_doc_id)
      .maybeSingle();
    scanPages = doc?.scan_pages ?? 0;
  }
  await settleJob(jobId, quoteParse(Math.max(doneSegments, 1), scanPages).total);
}

async function failJob(jobId: string, message: string): Promise<void> {
  // 解析失败全额退回。用户没拿到东西，就不该付钱。
  await releaseJob(jobId, "failed");
  const supabase = await createClient();
  await supabase
    .from("ingest_jobs")
    .update({ error_message: message, progress_stage: null })
    .eq("id", jobId);
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
