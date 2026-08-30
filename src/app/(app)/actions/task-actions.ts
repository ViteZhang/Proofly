"use server";

// =============================================================
// Proofly · 行动的手动管理
//
// 新增 · 编辑 · 放弃 · 置顶 · 忽略关联缺口。
//
// impact 一律走 planning/impact.ts 的公式，手动新增的也一样：
// 让人手填一个「预期提升 12 分」，等于在一个「分数由代码算」的系统里
// 开一个后门，排序立刻就不可信了。没关联缺口的手动行动 impact 就是 0,
// 排在最后但仍可置顶 —— 这正是置顶存在的理由。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { listOpenGaps, type OpenGap } from "@/lib/queries/plan";
import { ACTION_FOR_GAP, LEARN_MIN_HOURS } from "@/lib/planning/config";
import { computeImpact } from "@/lib/planning/impact";
import type { Json } from "@/types/database";

const ACTION_TYPES = ["collect_data", "build_evidence", "rewrite_narrative", "learn"] as const;

const taskInput = z.object({
  title: z.string().trim().min(1, "给它起个名字").max(120),
  rationale: z.string().trim().max(2000).default(""),
  actionType: z.enum(ACTION_TYPES),
  estimatedHours: z.number().int().min(0).max(2000),
  deliverable: z.string().trim().max(500).default(""),
  anchorAtomId: z.uuid().nullish().transform((v) => v ?? null),
  gapIds: z.array(z.uuid()).max(25).default([]),
});

export type TaskInput = z.input<typeof taskInput>;

function refresh() {
  revalidatePath("/actions");
  revalidatePath("/");
}

/** learn 类工时下限，跟生成时同一条规则 —— 手填也不许低估。 */
function hoursOf(actionType: string, h: number): number {
  if (actionType === "learn") return Math.max(LEARN_MIN_HOURS, h);
  return Math.max(1, h);
}

/** 手动新增的关联缺口下拉用。 */
export async function gapOptions(): Promise<
  ActionResult<{ id: string; targetName: string; text: string; gapType: string }[]>
> {
  const gaps = await listOpenGaps();
  return ok(
    gaps.map((g) => ({
      id: g.id,
      targetName: g.targetName,
      text: g.text,
      gapType: g.gapType,
    })),
  );
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填的内容不对");
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: v.title,
      rationale: v.rationale,
      action_type: v.actionType,
      estimated_hours: hoursOf(v.actionType, v.estimatedHours),
      deliverable: v.deliverable,
      anchor_atom_id: v.anchorAtomId,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !data) return fail("没存进去，再试一次");

  await syncTargets(data.id, v.gapIds);
  refresh();
  return ok({ id: data.id });
}

/**
 * 编辑。AI 生成的任务允许全字段编辑，编辑后 source 仍是 ai_generated，
 * 但打上 edited —— 重新生成时靠这个标记决定不覆盖用户的修改。
 */
export async function updateTask(
  id: string,
  input: TaskInput,
): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(id).success) return fail("这条行动不存在");
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填的内容不对");
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      title: v.title,
      rationale: v.rationale,
      action_type: v.actionType,
      estimated_hours: hoursOf(v.actionType, v.estimatedHours),
      deliverable: v.deliverable,
      anchor_atom_id: v.anchorAtomId,
      edited: true,
    })
    .eq("id", id);
  if (error) return fail("没改成，再试一次");

  await syncTargets(id, v.gapIds);
  refresh();
  return ok(null);
}

/** 放弃。二次确认在界面上做，这里只落状态。 */
export async function dropTask(id: string): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(id).success) return fail("这条行动不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status: "dropped" }).eq("id", id);
  if (error) return fail("没改成，再试一次");
  refresh();
  return ok(null);
}

export async function pinTask(id: string, pinned: boolean): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(id).success) return fail("这条行动不存在");
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ pinned }).eq("id", id);
  if (error) return fail("没改成，再试一次");
  refresh();
  return ok(null);
}

/**
 * 「这条不重要」：写 gaps.dismissed_at，并把它从这条行动的关联里摘掉。
 * 摘掉那一行 task_targets，impact 自然就少了对应的一份 —— 总和就是各条之和，
 * 不需要另算一遍。
 *
 * 返回 remaining，界面据此决定要不要问「关联缺口都没了，一并放弃吗？」
 */
export async function dismissGap(
  taskId: string,
  gapId: string,
): Promise<ActionResult<{ remaining: number }>> {
  if (!z.uuid().safeParse(taskId).success || !z.uuid().safeParse(gapId).success) {
    return fail("这条缺口不存在");
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("gaps")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", gapId);
  if (error) return fail("没改成，再试一次");

  // 这条缺口在别的行动里也不该再出现 —— 它已经被判定为不重要。
  await supabase.from("task_targets").delete().eq("gap_id", gapId);

  const { count } = await supabase
    .from("task_targets")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);

  refresh();
  return ok({ remaining: count ?? 0 });
}

// ---- 内部 ----

/**
 * 按选中的缺口重建 task_targets。整段删掉重插，不做增量 diff：
 * 关联最多二十来行，增量的复杂度换不来什么，反而容易留下孤行。
 */
async function syncTargets(taskId: string, gapIds: string[]) {
  const supabase = await createClient();
  await supabase.from("task_targets").delete().eq("task_id", taskId);
  if (gapIds.length === 0) return;

  const gaps = await listOpenGaps();
  const byId = new Map(gaps.map((g) => [g.id, g]));
  const mine = gapIds.map((id) => byId.get(id)).filter((g): g is OpenGap => !!g);
  if (mine.length === 0) return;

  const rows = mine.map((g) => {
    const basis = computeImpact(ACTION_FOR_GAP[g.gapType], g.state);
    return {
      task_id: taskId,
      target_id: g.targetId,
      gap_id: g.id,
      impact: basis.result,
      impact_basis: basis as unknown as Json,
    };
  });

  const { error } = await supabase.from("task_targets").insert(rows);
  if (error) console.error("[task] 方向关联没写进去", error);
}
