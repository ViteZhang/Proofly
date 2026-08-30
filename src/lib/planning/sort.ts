// =============================================================
// Proofly · 行动排序
//
// 纯函数，不 import Next、不连库。视图 task_priority 算的是同一个式子，
// 这里是它在浏览器里的镜像 —— 忽略一条缺口之后要就地重排，不能等一次往返。
//
//   priority = Σ(task_targets.impact) / max(estimated_hours, 1)
//
// 方向之间不加任何权重系数。这是方向平权的直接后果：没有主次，
// 就只能靠「这条任务同时补几个方向」来排序。
// 任何「主方向加权」的改动都会让这个模块失去意义。
// =============================================================

export type SortMode = "priority" | "hours" | "type";

export type SortableTask = {
  id: string;
  pinned: boolean;
  totalImpact: number;
  estimatedHours: number;
  actionType: string;
  createdAt: string | null;
};

export function priorityOf(t: { totalImpact: number; estimatedHours: number }): number {
  return t.totalImpact / Math.max(t.estimatedHours, 1);
}

// 类型分组时的组内顺序。与 config 的 ACTION_EASE_ORDER 一致：好下手的在前。
const TYPE_ORDER = ["collect_data", "build_evidence", "rewrite_narrative", "learn"];

/** 稳定排序。置顶永远在最前，不受 priority 影响。 */
export function sortTasks<T extends SortableTask>(tasks: T[], mode: SortMode = "priority"): T[] {
  return tasks.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    if (mode === "hours") {
      const d = a.estimatedHours - b.estimatedHours;
      if (d !== 0) return d;
    } else if (mode === "type") {
      const d = TYPE_ORDER.indexOf(a.actionType) - TYPE_ORDER.indexOf(b.actionType);
      if (d !== 0) return d;
    }

    // 三种模式都以 priority 收尾：分组之后组内仍然按最该做的排在前面。
    const d = priorityOf(b) - priorityOf(a);
    if (d !== 0) return d;

    // priority 打平时按创建时间，保证两次渲染顺序一致。
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id);
  });
}
