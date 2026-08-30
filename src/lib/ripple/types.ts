// =============================================================
// Proofly · 连带影响的类型
//
// 六个 kind 现在就写全，包括 Step 5 才有数据的那两个。
// 界面按 kind 渲染，Step 5 补上时只加渲染分支，不动数据流——
// 等到那时候再改结构，就是把已经跑了半年的确认卡拆一遍。
//
// 不依赖 Next 也不依赖数据库：客户端组件要 import 这些类型。
// =============================================================

export type RippleEffect =
  | { kind: "proof_change"; atomId: string; from: string; to: string }
  | { kind: "global_proof_change"; from: number; to: number }
  | { kind: "pending_resolved"; atomId: string; metricName: string }
  | { kind: "skill_strength_change"; skillId: string; label: string; from: string; to: string }
  // ↓ Step 5 补上。targetName 是 Step 5 方案 5.6 里写明的字段，
  //   界面要显示「C 端 68 → 79」，只有 id 没法显示。
  | {
      kind: "match_score_change";
      targetId: string;
      targetName: string;
      from: number;
      to: number;
    }
  | { kind: "task_auto_complete"; taskId: string; title: string };

export type RippleKind = RippleEffect["kind"];

/** 策略层的两个 kind。事实层入库那一刻算不出来，要等重评跑完才有。 */
export const STEP5_KINDS: RippleKind[] = ["match_score_change", "task_auto_complete"];

// ---- 快照 ----
// 「入库前是什么样」必须在写之前读一次，写完再读一次做差。
// 不预测——证明度的推导逻辑在数据库触发器里，那是唯一真相，
// 应用层再实现一遍，两边一旦走岔，界面上显示的就是一句骗人的话。

export type AtomSnapshot = {
  atomId: string;
  evidenceLevel: string;
  pendingNames: string[];
  metricCount: number;
};

export type SkillSnapshot = {
  skillId: string;
  label: string;
  strength: string;
};

export type RippleState = {
  atoms: AtomSnapshot[];
  skills: SkillSnapshot[];
  /** 全库证明度百分比，0–100。与首页证明环同一个口径。 */
  globalScore: number;
};

export type AppliedChange = {
  atomId: string;
  /** 这条经历是这次新建的：入库前它不存在，就没有「从 X 变成 Y」可言 */
  created?: boolean;
};
