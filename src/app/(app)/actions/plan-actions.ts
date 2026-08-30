"use server";

// =============================================================
// Proofly · 行动生成
//
// 一次 strong 档调用，把全部方向的未解决缺口聚类成一份行动清单。
//
// 为什么不逐个缺口生成：C 端方向的「建立 AI 功能效果评估体系」和
// Agent 平台方向的「有 LLM 效果评测经验」本质是同一件事。逐 gap 生成
// 会产出两条几乎一样的任务，更要命的是「跨方向复用度」这个排序依据
// 会直接失效 —— 它恰恰来自「一条任务同时补多个方向的缺口」。
//
// impact 一律由 planning/impact.ts 按公式算。模型输出里若出现 impact
// 数值，schema 会把它剥掉，连进入代码的机会都没有。
//
// 不自动静默生成：清单是要人去执行的东西，得让人知道它什么时候变了。
// =============================================================

import { revalidatePath } from "next/cache";
import { callLLM } from "@/lib/llm";
import { PLAN_SYSTEM, planUser } from "@/lib/llm/task-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { loadSkills } from "@/lib/assess/payload";
import { listAnchorAtoms, listOpenGaps, type OpenGap } from "@/lib/queries/plan";
import { ACTION_FOR_GAP, LEARN_MIN_HOURS, MAX_TASKS_OUT } from "@/lib/planning/config";
import { computeImpact, type ImpactBasis } from "@/lib/planning/impact";
import { findDuplicate, type ExistingTask } from "@/lib/planning/dedupe";
import { planSchema, type PlannedTask } from "@/lib/planning/schema";
import type { Json, TaskActionType } from "@/types/database";

export type PlanSummary = {
  created: number;
  updated: number;
  gapsIn: number;
  droppedGapIds: string[];
};

function refresh() {
  revalidatePath("/actions");
  revalidatePath("/");
}

/** 有多少条缺口在等着 —— 评估完之后弹「发现 N 处缺口，要生成行动清单吗？」用。 */
export async function countOpenGaps(): Promise<ActionResult<{ count: number }>> {
  const gaps = await listOpenGaps();
  return ok({ count: gaps.length });
}

export async function generatePlan(): Promise<ActionResult<PlanSummary>> {
  const supabase = await createClient();

  const gaps = await listOpenGaps();
  // 一条缺口都没有就不生成。造几条假任务出来比空清单更糟。
  if (gaps.length === 0) {
    return ok({ created: 0, updated: 0, gapsIn: 0, droppedGapIds: [] });
  }

  const [anchors, skills] = await Promise.all([listAnchorAtoms(), loadSkills()]);
  const gapById = new Map(gaps.map((g) => [g.id, g]));
  const anchorIds = new Set(anchors.map((a) => a.id));

  const res = await callLLM({
    tier: "strong",
    purpose: "task_plan",
    system: PLAN_SYSTEM,
    user: planUser({
      gapsJson: JSON.stringify(
        gaps.map((g) => ({
          gap_id: g.id,
          target_name: g.targetName,
          requirement_text: g.text,
          gap_type: g.gapType,
          severity: g.severity,
          score_loss: Number(g.scoreLoss.toFixed(2)),
          related_skill_labels: g.emptySkillLabels,
        })),
        null,
        2,
      ),
      anchorAtomsJson:
        anchors.length === 0
          ? "（经历库里没有可挂靠的在做项目）"
          : JSON.stringify(
              anchors.map((a) => ({
                id: a.id,
                title: a.title,
                status: a.status,
                evidence_level: a.evidenceLevel,
                situation: a.situation,
                pending_metrics: a.pendingMetrics,
              })),
              null,
              2,
            ),
      skillsJson:
        skills.length === 0 ? "（还没有技能标签）" : JSON.stringify(skills, null, 2),
    }),
    jsonSchema: planSchema,
  });
  if (!res.ok) return fail(res.error);

  // 模型给多了就截断，不为这个判整次生成失败。清单太长等于没有清单。
  const planned = res.data.tasks.slice(0, MAX_TASKS_OUT);
  if (res.data.tasks.length > MAX_TASKS_OUT) {
    console.warn(`[plan] 模型给了 ${res.data.tasks.length} 条，截到 ${MAX_TASKS_OUT}`);
  }

  // 已有的未完成任务，用来去重。
  const { data: existingRows } = await supabase
    .from("tasks")
    .select("id,title,task_targets(gap_id)")
    .is("dismissed_at", null)
    .in("status", ["todo", "doing"]);

  const existing: ExistingTask[] = (existingRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    requirementTexts: (t.task_targets ?? [])
      .map((tt) => (tt.gap_id ? gapById.get(tt.gap_id)?.text : null))
      .filter((s): s is string => typeof s === "string"),
  }));

  // 已有任务关联的缺口可能来自上一轮评估，gapById 里查不到；补一次要求原文，
  // 否则重合度判据永远是 0，去重就只剩标题一条腿。
  await fillHistoricRequirementTexts(existing, existingRows ?? []);

  let created = 0;
  let updated = 0;

  for (const t of planned) {
    const mine = t.gap_ids.map((id) => gapById.get(id)).filter((g): g is OpenGap => !!g);
    // 一条缺口都对不上，说明 gap_id 是编的。这样的任务写进去也没法算 impact。
    if (mine.length === 0) {
      console.warn(`[plan] 丢弃「${t.title}」：gap_ids 全部对不上`);
      continue;
    }

    const dup = findDuplicate(
      { title: t.title, requirementTexts: mine.map((g) => g.text) },
      existing,
    );

    const taskId = dup
      ? await touchTask(supabase, dup.existingId)
      : await insertTask(supabase, t, anchorIds);
    if (!taskId) continue;

    await writeTargets(supabase, taskId, mine);
    if (dup) updated++;
    else {
      created++;
      existing.push({
        id: taskId,
        title: t.title,
        requirementTexts: mine.map((g) => g.text),
      });
    }
  }

  refresh();
  return ok({
    created,
    updated,
    gapsIn: gaps.length,
    droppedGapIds: res.data.dropped_gap_ids.filter((id) => gapById.has(id)),
  });
}

// ---- 写入 ----

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * learn 类工时下限 30 小时。低估它会让人以为技能缺口很好补，
 * 从而做出错误的时间分配 —— 这是清单最容易骗人的地方。
 */
function hoursOf(t: PlannedTask): number {
  const h = Math.round(t.estimated_hours);
  if (t.action_type === "learn") return Math.max(LEARN_MIN_HOURS, h);
  return Math.max(1, h);
}

async function insertTask(
  supabase: Client,
  t: PlannedTask,
  anchorIds: Set<string>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: t.title,
      rationale: t.rationale,
      action_type: t.action_type,
      estimated_hours: hoursOf(t),
      deliverable: t.deliverable,
      // 模型编了个不存在的 id 就当没挂靠，不让外键把整条任务挡回去。
      anchor_atom_id:
        t.anchor_atom_id && anchorIds.has(t.anchor_atom_id) ? t.anchor_atom_id : null,
      source: "ai_generated",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[plan] 任务没写进去", error);
    return null;
  }
  return data.id;
}

/**
 * 命中去重：不重复创建，只更新关联。
 * 标题、说明、工时一律不覆盖 —— 用户可能已经改过了（tasks.edited），
 * 重新生成一次就把他的修改冲掉，那清单就没法信任了。
 */
async function touchTask(supabase: Client, id: string): Promise<string | null> {
  const { error } = await supabase
    .from("tasks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[plan] 任务关联没更新", error);
    return null;
  }
  return id;
}

/**
 * 一条任务在每个方向上各一行 task_targets，impact 分别计算不共用。
 * 公式按每条缺口自己的 gap_type 选，不按任务的 action_type ——
 * 一组缺口类型不一致时，任务只能取一个最容易执行的类型，
 * 拿它去套所有缺口会把另外几类的预期提升算错。
 */
async function writeTargets(supabase: Client, taskId: string, gaps: OpenGap[]) {
  await supabase.from("task_targets").delete().eq("task_id", taskId);

  const rows = gaps.map((g) => {
    const action: TaskActionType = ACTION_FOR_GAP[g.gapType];
    const basis: ImpactBasis = computeImpact(action, g.state);
    return {
      task_id: taskId,
      target_id: g.targetId,
      gap_id: g.id,
      impact: basis.result,
      impact_basis: basis as unknown as Json,
    };
  });

  if (rows.length === 0) return;
  const { error } = await supabase.from("task_targets").insert(rows);
  if (error) console.error("[plan] 方向关联没写进去", error);
}

/** 已有任务关联的历史缺口，补出它们的要求原文（重合度判据要用）。 */
async function fillHistoricRequirementTexts(
  existing: ExistingTask[],
  rows: { id: string; task_targets: { gap_id: string | null }[] }[],
) {
  const missing = rows
    .flatMap((r) => (r.task_targets ?? []).map((tt) => tt.gap_id))
    .filter((id): id is string => !!id);
  if (missing.length === 0) return;

  const supabase = await createClient();
  const { data } = await supabase.from("gaps").select("id,detail").in("id", missing);
  const textById = new Map<string, string>();
  for (const g of data ?? []) {
    const d = (g.detail ?? {}) as { text?: unknown };
    if (typeof d.text === "string" && d.text) textById.set(g.id, d.text);
  }

  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const r of rows) {
    const e = byId.get(r.id);
    if (!e) continue;
    const texts = (r.task_targets ?? [])
      .map((tt) => (tt.gap_id ? textById.get(tt.gap_id) : undefined))
      .filter((s): s is string => typeof s === "string");
    e.requirementTexts = [...new Set([...e.requirementTexts, ...texts])];
  }
}
