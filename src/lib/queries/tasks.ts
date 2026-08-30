// =============================================================
// Proofly · 行动清单读取层
//
// 全局视图：不接受 target 参数，任何按方向过滤的写法都会让
// 「跨方向复用度」这个排序依据失效 —— 一条任务同时补几个方向，
// 只有在一张不分方向的清单上才看得出来。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { priorityOf } from "@/lib/planning/sort";
import type { ImpactBasis } from "@/lib/planning/impact";
import type { GapType, Json, TaskActionType, TaskSource, TaskStatus } from "@/types/database";

/** 一条行动在一个方向上的落点。 */
export type TaskTargetView = {
  targetId: string;
  targetName: string;
  impact: number;
  gapId: string | null;
  gapType: GapType | null;
  /** 缺口对应的要求原文。 */
  requirementText: string;
  basis: ImpactBasis | null;
};

export type TaskView = {
  id: string;
  title: string;
  rationale: string;
  actionType: TaskActionType;
  estimatedHours: number;
  actualHours: number | null;
  status: TaskStatus;
  source: TaskSource;
  edited: boolean;
  pinned: boolean;
  autoCompleted: boolean;
  anchorAtomId: string | null;
  anchorTitle: string | null;
  deliverable: string;
  producesAtomId: string | null;
  producesTitle: string | null;
  completedAt: string | null;
  createdAt: string | null;

  targets: TaskTargetView[];
  totalImpact: number;
  targetCount: number;
  priority: number;
};

export type TaskBoard = {
  open: TaskView[];
  done: TaskView[];
  /** 每个方向的预期匹配度变化，概览条用。有几个方向就有几项。 */
  perTarget: { targetId: string; targetName: string; impact: number }[];
  totalHours: number;
};

function basisOf(v: Json | null): ImpactBasis | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return typeof o.formula === "string" ? (v as unknown as ImpactBasis) : null;
}

function textOf(detail: Json | null): string {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return "";
  const t = (detail as Record<string, unknown>).text;
  return typeof t === "string" ? t : "";
}

export async function getTaskBoard(): Promise<TaskBoard> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("tasks")
    .select(
      "id,title,rationale,action_type,estimated_hours,actual_hours,status,source,edited,pinned,auto_completed,anchor_atom_id,deliverable,produces_atom_id,completed_at,created_at,task_targets(target_id,gap_id,impact,impact_basis)",
    )
    .is("dismissed_at", null)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) {
    return { open: [], done: [], perTarget: [], totalHours: 0 };
  }

  const [{ data: targets }, { data: gaps }, { data: atoms }] = await Promise.all([
    supabase.from("targets").select("id,name").order("sort_order", { ascending: true }),
    supabase
      .from("gaps")
      .select("id,gap_type,detail")
      .in(
        "id",
        rows.flatMap((r) =>
          (r.task_targets ?? []).map((t) => t.gap_id).filter((x): x is string => !!x),
        ),
      ),
    supabase
      .from("atoms")
      .select("id,title")
      .in(
        "id",
        rows
          .flatMap((r) => [r.anchor_atom_id, r.produces_atom_id])
          .filter((x): x is string => !!x),
      ),
  ]);

  const targetName = new Map((targets ?? []).map((t) => [t.id, t.name]));
  const gapById = new Map((gaps ?? []).map((g) => [g.id, g]));
  const atomTitle = new Map((atoms ?? []).map((a) => [a.id, a.title]));

  const views: TaskView[] = rows.map((r) => {
    const tt: TaskTargetView[] = (r.task_targets ?? []).map((x) => {
      const g = x.gap_id ? gapById.get(x.gap_id) : undefined;
      return {
        targetId: x.target_id,
        targetName: targetName.get(x.target_id) ?? "已删除的方向",
        impact: Number(x.impact ?? 0),
        gapId: x.gap_id,
        gapType: g?.gap_type ?? null,
        requirementText: textOf(g?.detail ?? null),
        basis: basisOf(x.impact_basis),
      };
    });

    const totalImpact = tt.reduce((s, x) => s + x.impact, 0);
    const estimatedHours = r.estimated_hours ?? 1;

    return {
      id: r.id,
      title: r.title,
      rationale: r.rationale ?? "",
      actionType: r.action_type,
      estimatedHours,
      actualHours: r.actual_hours,
      status: r.status,
      source: r.source,
      edited: r.edited,
      pinned: r.pinned ?? false,
      autoCompleted: r.auto_completed,
      anchorAtomId: r.anchor_atom_id,
      anchorTitle: r.anchor_atom_id ? (atomTitle.get(r.anchor_atom_id) ?? null) : null,
      deliverable: r.deliverable ?? "",
      producesAtomId: r.produces_atom_id,
      producesTitle: r.produces_atom_id ? (atomTitle.get(r.produces_atom_id) ?? null) : null,
      completedAt: r.completed_at,
      createdAt: r.created_at,

      targets: tt,
      totalImpact: Math.round(totalImpact * 100) / 100,
      // 「服务 N 个方向」按去重后的方向数算 —— 一个方向下命中两条缺口
      // 仍然只算一个方向，否则这个数字会把复用度吹起来。
      targetCount: new Set(tt.map((x) => x.targetId)).size,
      priority: priorityOf({ totalImpact, estimatedHours }),
    };
  });

  const open = views.filter((v) => v.status === "todo" || v.status === "doing");
  const done = views.filter((v) => v.status === "done");

  // 概览条：每个方向一项。只统计待办 —— 已完成的提升已经体现在重评里了。
  const byTarget = new Map<string, { targetId: string; targetName: string; impact: number }>();
  for (const t of targets ?? []) {
    byTarget.set(t.id, { targetId: t.id, targetName: t.name, impact: 0 });
  }
  for (const v of open) {
    for (const x of v.targets) {
      const e = byTarget.get(x.targetId);
      if (e) e.impact += x.impact;
    }
  }

  return {
    open,
    done,
    perTarget: [...byTarget.values()].map((e) => ({
      ...e,
      impact: Math.round(e.impact * 10) / 10,
    })),
    totalHours: open.reduce((s, v) => s + v.estimatedHours, 0),
  };
}

/** 侧栏徽标与首页概览卡用：待办条数。 */
export async function countOpenTasks(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .is("dismissed_at", null)
    .in("status", ["todo", "doing"]);
  return count ?? 0;
}

/**
 * 某次评估里，每条要求对应的行动（如果已经生成过）。
 *
 * Step 4 逐条对照里那句「→ Step 5 会在这里生成对应行动」的占位靠它接上。
 * 键是 requirement_index —— 缺口和要求是一一对应的，用 index 比用 gap_id
 * 稳：界面上拿到的是算分结果，不是 gap 行。
 */
export async function getGapTaskLinks(
  assessmentId: string,
): Promise<Record<number, { taskId: string; title: string }>> {
  if (!assessmentId) return {};
  const supabase = await createClient();

  const { data: gaps } = await supabase
    .from("gaps")
    .select("id,requirement_index")
    .eq("assessment_id", assessmentId);
  if (!gaps || gaps.length === 0) return {};

  const { data: links } = await supabase
    .from("task_targets")
    .select("gap_id,tasks(id,title,status,dismissed_at)")
    .in(
      "gap_id",
      gaps.map((g) => g.id),
    );

  const byGap = new Map<string, { taskId: string; title: string }>();
  for (const l of links ?? []) {
    const t = l.tasks;
    if (!t || !l.gap_id) continue;
    // 已放弃／已忽略的行动不往回指 —— 点过去找不到东西比没有链接更糟。
    if (t.status === "dropped" || t.dismissed_at) continue;
    byGap.set(l.gap_id, { taskId: t.id, title: t.title });
  }

  const out: Record<number, { taskId: string; title: string }> = {};
  for (const g of gaps) {
    const hit = byGap.get(g.id);
    if (hit && g.requirement_index !== null) out[g.requirement_index] = hit;
  }
  return out;
}
