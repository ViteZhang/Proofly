"use server";

// =============================================================
// Proofly · 完成回流
//
// 这一片是整个产品闭环能否成立的关键：任务做完了，产出物要变成一条
// 能写进简历的经历，而不是一个被划掉的复选框。
//
// 回流链路一概复用已有能力，不另起一套：
//   直接描述 → Step 3 的 Stage B/C 拆分与定位（runRecord）
//   上传交付物 → Step 2 的文件解析 + 抽取链路（registerUpload / startJob）
//
// 入库和重评是两件事：入库确认立刻返回，重评异步跑，重评失败不回滚
// 已入库的数据。见 5.6。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { runRecord, type TaskContext } from "@/lib/chat/pipeline";
import { commitCard, type Choice } from "@/app/app/notes/commit-actions";
import type { ChatMessageView } from "@/lib/chat/message-shape";
import type { ReassessPlan } from "@/app/app/actions/reassess-actions";

const uuid = z.uuid();
const MAX_LEN = 2000;

function refresh() {
  revalidatePath("/app/actions");
  revalidatePath("/");
}

async function taskContextOf(taskId: string): Promise<TaskContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("title,anchor_atom_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!data) return null;

  let anchorTitle: string | null = null;
  if (data.anchor_atom_id) {
    const { data: a } = await supabase
      .from("atoms")
      .select("title")
      .eq("id", data.anchor_atom_id)
      .maybeSingle();
    anchorTitle = a?.title ?? null;
  }
  return { taskTitle: data.title, anchorAtomId: data.anchor_atom_id, anchorTitle };
}

/**
 * 「直接描述」：走 Stage B/C，产出确认卡。
 * 这里只到「卡片摆出来」为止 —— 入库要用户按下确认，跟随手记完全一致。
 */
export async function describeReflow(
  taskId: string,
  text: string,
): Promise<ActionResult<{ messages: ChatMessageView[]; units: number }>> {
  if (!uuid.safeParse(taskId).success) return fail("这条行动不存在");
  const body = text.trim();
  if (body === "") return fail("说说这条行动产出了什么");
  if (body.length > MAX_LEN) return fail(`一次最多 ${MAX_LEN} 字，这条太长了`);

  const ctx = await taskContextOf(taskId);
  if (!ctx) return fail("这条行动已经不在了");

  const res = await runRecord({
    userMessage: body,
    recentTurns: "",
    imagePath: null,
    imageOcrText: "",
    taskContext: ctx,
  });
  if (!res.ok) return fail(res.error);
  return ok({ messages: res.data.messages, units: res.data.units });
}

/**
 * 回流卡确认入库，然后按顺序完成连锁反应的前两步：
 *   1. 写入／更新经历 → tasks.produces_atom_id
 *   2. status = done，completed_at、actual_hours 写入
 * 第 3–5 步（触发重评、关闭缺口、Toast）在 5.6。
 *
 * 入库那一步失败就整体失败；入库成功之后再失败，任务照样标完成 ——
 * 经历已经在库里了，把任务留在待办上只会让人以为没做。
 */
export async function commitReflow(
  taskId: string,
  draftId: string,
  actualHours: number | null,
  choice?: Choice,
): Promise<
  ActionResult<{ atomId: string; undoId: string; expiresAt: string; reassess: ReassessPlan }>
> {
  if (!uuid.safeParse(taskId).success) return fail("这条行动不存在");

  const res = await commitCard(draftId, choice);
  if (!res.ok) return fail(res.error);

  const done = await completeTaskWithAtom(taskId, res.data.atomId, actualHours);
  if (!done.ok) return fail(done.error);

  return ok({
    atomId: res.data.atomId,
    undoId: res.data.undoId,
    expiresAt: res.data.expiresAt,
    // commitCard 已经把重评排上了，这里把计划透出去给面板轮询。
    reassess: res.data.reassess,
  });
}

/** 上传路径回来之后、以及回流入库之后共用的收尾。 */
export async function completeTaskWithAtom(
  taskId: string,
  atomId: string | null,
  actualHours: number | null,
): Promise<ActionResult<null>> {
  if (!uuid.safeParse(taskId).success) return fail("这条行动不存在");
  if (atomId !== null && !uuid.safeParse(atomId).success) return fail("经历标识不对");

  const hours = normalizeHours(actualHours);
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      actual_hours: hours,
      produces_atom_id: atomId,
      auto_completed: false,
    })
    .eq("id", taskId);
  if (error) return fail("经历存进去了，但行动没标成完成，去清单里手动标一下");

  refresh();
  return ok(null);
}

/**
 * 「只标记完成」。允许存在，但界面上是文字按钮不是主按钮 ——
 * 不强迫回流，默认路径是回流。
 */
export async function markDone(
  taskId: string,
  actualHours: number | null,
): Promise<ActionResult<null>> {
  return completeTaskWithAtom(taskId, null, actualHours);
}

/** 退回待办。自动完成判错了要能改回来（5.6），手动标错了也一样。 */
export async function reopenTask(taskId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(taskId).success) return fail("这条行动不存在");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "todo", completed_at: null, auto_completed: false })
    .eq("id", taskId);
  if (error) return fail("没改成，再试一次");
  refresh();
  return ok(null);
}

function normalizeHours(h: number | null): number | null {
  if (h === null || !Number.isFinite(h) || h <= 0) return null;
  return Math.min(2000, Math.round(h));
}
