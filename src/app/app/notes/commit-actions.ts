"use server";

// =============================================================
// Proofly · 确认卡的入库、撤销、放弃
//
// 入库本身在数据库函数 commit_chat_draft 里做完（supabase/13_chat_commit.sql）：
// 写事实层和写 undo_log 必须在同一个事务里。六秒内可撤销意味着入库那一刻
// 就得知道怎么退回去 —— 事后再猜是猜不出来的（哪条指标是这次插的？
// 待补项原来有几项？）。
//
// 这一层只做三件事：把变更单元翻译成入库函数认识的形状、
// 入库前后各读一次快照算连带影响、把结果写回那张卡。
// =============================================================

import { z } from "zod";

import { obj } from "@/lib/chat/message-shape";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { computeRipple, readRippleState, type RippleEffect } from "@/lib/ripple";
import { startReassess, type ReassessPlan } from "@/app/app/actions/reassess-actions";
import { settleIngestJob } from "@/lib/queries/drafts";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const uuid = z.uuid();

export type CommitResult = {
  /** 入库后那条经历的 id。回流要拿它写 tasks.produces_atom_id。 */
  atomId: string;
  undoId: string;
  /** 撤销窗口的截止时刻。倒计时以它为准，不以点下去那一刻为准。 */
  expiresAt: string;
  ripple: RippleEffect[];
  toast: string;
  /**
   * 这次变更牵动了哪几份 JD。界面拿它去轮询匹配度变化 ——
   * 「渗透率 35%」这句话说完，匹配度应该当场跟着动，
   * 那才是这个产品跟一个记事本的区别。
   */
  reassess: ReassessPlan;
};

export type Choice = { action: "CREATE" | "UPDATE" | "MERGE"; targetAtomId: string | null };

export async function commitCard(
  draftId: string,
  choice?: Choice,
): Promise<ActionResult<CommitResult>> {
  if (!uuid.safeParse(draftId).success) return fail("草稿标识不对");

  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, intent, target_atom_id, payload, diff, review_status, ingest_job_id")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return fail("这条草稿不在了");
  if (draft.review_status !== "pending") return fail("这条已经处理过了");

  const payload = obj(draft.payload);

  // ASK 的卡上用户点的是某个方案。MERGE 就是「并进那一条」，
  // 落到库里和 UPDATE 是同一件事。
  const intent =
    choice === undefined
      ? draft.intent
      : choice.action === "MERGE"
        ? "UPDATE"
        : choice.action;
  if (intent === "ASK") return fail("这条得先选一个方案");

  const target =
    choice === undefined
      ? draft.target_atom_id
      : (choice.targetAtomId ?? draft.target_atom_id);
  if (intent === "UPDATE" && target === null) return fail("没说要更新哪一条");

  const parent = typeof payload.parent_atom_id === "string" ? payload.parent_atom_id : null;
  const atom = toAtomShape(payload, obj(draft.diff).entries);
  if (intent === "CREATE" && String(obj(atom).title ?? "").trim() === "") {
    return fail("这条没有标题，建不了。去经历库手工建一条更快。");
  }

  const messageId = await cardMessageId(draftId);

  // 入库前的样子。写完再读一次做差 —— 证明度不在应用层预测。
  const before = await readRippleState(target === null ? [] : [target]);

  const { data, error } = await supabase.rpc("commit_chat_draft", {
    p_draft_id: draftId,
    p_atom: atom,
    p_intent: intent,
    p_target: intent === "UPDATE" ? target : null,
    p_parent: intent === "CREATE" ? parent : null,
    p_chat_message_id: messageId,
  });
  if (error) return fail(`没能写进去：${error.message}`);

  const out = obj(data as Json);
  const atomId = typeof out.atom_id === "string" ? out.atom_id : null;
  const undoId = typeof out.undo_id === "string" ? out.undo_id : null;
  if (atomId === null || undoId === null) return fail("写进去了，但没拿到回执，先别撤销");

  const ripple = await computeRipple(
    [{ atomId, created: intent === "CREATE" }],
    before,
  );

  const { data: undoRow } = await supabase
    .from("undo_log")
    .select("expires_at")
    .eq("id", undoId)
    .maybeSingle();

  await patchCard(messageId, {
    committed: true,
    undo_id: undoId,
    ripple: ripple as unknown as Json,
  });

  // 这一批卡片都处理完了就把作业收掉。不收的话它会一直挂在
  // awaiting_review，被导入页当成「上次没处理完的上传」捡走。
  await settleIngestJob(draft.ingest_job_id);

  // 重评异步跑，不阻塞这次返回。失败也不回滚 —— 经历已经在库里了。
  const reassess = await startReassess([atomId]);

  return ok({
    atomId,
    reassess: reassess.ok ? reassess.data : { jds: [] },
    undoId,
    expiresAt: undoRow?.expires_at ?? new Date(Date.now() + 6000).toISOString(),
    ripple,
    toast: toastText(intent === "CREATE", ripple),
  });
}

export async function undoCard(undoId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(undoId).success) return fail("撤销标识不对");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("undo_log")
    .select("id, chat_message_id, expires_at, undone_at")
    .eq("id", undoId)
    .maybeSingle();
  if (!row) return fail("找不到这次变更的撤销记录");

  const { data: done, error } = await supabase.rpc("undo_chat", { p_undo_id: undoId });
  if (error) return fail(`没撤回来：${error.message}`);
  // 过期与重复撤销都在函数里拦，这里只是把它的「没做」翻译成人话。
  if (done !== true) {
    return fail(row.undone_at === null ? "这条已经过了撤销时间" : "这条已经撤过了");
  }

  await patchCard(row.chat_message_id, { committed: false, undone: true, ripple: [] });
  return ok(null);
}

/** 「不用了」：不写事实层，只把草稿关掉，卡片留在对话流里。 */
export async function rejectCard(draftId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(draftId).success) return fail("草稿标识不对");

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("drafts")
    .update({ review_status: "rejected" })
    .eq("id", draftId)
    .eq("review_status", "pending")
    .select("ingest_job_id");
  if (error) return fail(`没能放下这条：${error.message}`);

  const jobId = updated?.[0]?.ingest_job_id;
  if (jobId) await settleIngestJob(jobId);

  await patchCard(await cardMessageId(draftId), { rejected: true });
  return ok(null);
}

// ---------------------------------------------------------------

/**
 * 变更单元 → 入库函数认识的经历形状。
 *
 * CREATE 走 new_experience（本来就是 Step 2 抽取输出的形状），
 * 单元自己带的状态和指标补进去 —— 口语里「我新做了个 X，上线了，转化率 8%」
 * 这三件事会分散在两个地方。
 */
function toAtomShape(payload: Record<string, Json | undefined>, diff: Json | undefined): Json {
  const unit = obj(payload.unit);
  const content = obj(unit.content_patch);
  const guards = obj(unit.guards_patch);
  const fresh = obj(unit.new_experience);

  const metrics = Array.isArray(unit.metrics) ? unit.metrics : [];
  const base: Record<string, Json> = {
    _diff: Array.isArray(diff) ? diff : [],
    status: typeof unit.status === "string" ? unit.status : "",
    situation: str(content.situation),
    task: str(content.task),
    actions_add: Array.isArray(content.actions_add) ? content.actions_add : [],
    metrics,
    skills: Array.isArray(fresh.skills) ? fresh.skills : [],
    guards: {
      must_say: Array.isArray(guards.must_say) ? guards.must_say : [],
      never_say: Array.isArray(guards.never_say) ? guards.never_say : [],
      role_framing: str(guards.role_framing),
      probes: [],
    },
  };

  if (Object.keys(fresh).length === 0) return base;

  // 新建：以 new_experience 为主，缺的用单元自己那份补上
  const freshMetrics = Array.isArray(fresh.metrics) ? fresh.metrics : [];
  return {
    ...fresh,
    ...base,
    title: str(fresh.title) === "" ? str(unit.subject_hint) : str(fresh.title),
    status: str(fresh.status) !== "" ? str(fresh.status) : base.status,
    situation: str(fresh.situation) !== "" ? str(fresh.situation) : base.situation,
    task: str(fresh.task) !== "" ? str(fresh.task) : base.task,
    actions: Array.isArray(fresh.actions) ? fresh.actions : [],
    metrics: freshMetrics.length > 0 ? freshMetrics : metrics,
    pending_metrics: Array.isArray(fresh.pending_metrics) ? fresh.pending_metrics : [],
    children: Array.isArray(fresh.children) ? fresh.children : [],
  };
}

function str(v: Json | undefined): string {
  return typeof v === "string" ? v : "";
}

async function cardMessageId(draftId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("kind", "confirm_card")
    .eq("payload->>draft_id", draftId)
    .maybeSingle();
  return data?.id ?? null;
}

/** 把卡片的状态写回消息。刷新页面之后卡还得是这个样子。 */
async function patchCard(
  messageId: string | null,
  patch: Record<string, Json>,
): Promise<void> {
  if (messageId === null) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("payload")
    .eq("id", messageId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("chat_messages")
    .update({ payload: { ...obj(data.payload), ...patch } as Json })
    .eq("id", messageId);
}

function toastText(created: boolean, ripple: RippleEffect[]): string {
  const head = created ? "已新建" : "已更新";
  const g = ripple.find((e) => e.kind === "global_proof_change");
  return g === undefined || g.kind !== "global_proof_change"
    ? head
    : `${head} · 证明度 ${g.from}% → ${g.to}%`;
}
