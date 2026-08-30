// =============================================================
// Proofly · 什么时候该主动问一句
//
// 三条规则全由代码判定，不经过模型（方案 3.7）。模型只负责怎么说。
// 判定和措辞分开的理由很实在：判定错了是骚扰，措辞差了只是难听。
//
// 纯函数，不认识数据库 —— 频次控制这种「多发一次就是打扰人」的逻辑，
// 必须能被单独喂数据验证，而不是只能靠上线之后观察。
// =============================================================

export type NudgeRule = "R1" | "R2" | "R3";

export const STALE_DAYS = 21; // R1：in_dev 超过这么久没动
export const AWAY_DAYS = 14; // R3：这么久没来过
export const SAME_ATOM_RULE_DAYS = 30; // 同一条经历同一规则，这么久内不重复
export const UNANSWERED_DAYS = 7; // 上次问了没回应，这么久内不再用同一规则

export type NudgeCandidate = {
  atomId: string;
  title: string;
  status: string;
  daysSinceUpdate: number;
  pendingNames: string[];
};

export type NudgeHistory = {
  rule: NudgeRule;
  atomId: string | null;
  /** 距今多少天 */
  daysAgo: number;
  responded: boolean;
};

export type NudgePick = {
  rule: NudgeRule;
  candidate: NudgeCandidate;
  /** 送进 4.4 提示词的「追问原因」 */
  reason: string;
};

/**
 * 挑一条要问的。挑不出来就返回 null —— 没什么可问的时候闭嘴，
 * 是这个功能能不能留在产品里的前提。
 *
 * 优先级 R3 > R2 > R1：R2 优于 R1 是因为「有数据没填」比「项目没进展」
 * 更可执行；R3 优先是因为人刚回来，问一句最自然。
 */
export function pickNudge(v: {
  candidates: NudgeCandidate[];
  /** 距上次来随手记多少天。从来没来过是 null，不问。 */
  daysSinceLastVisit: number | null;
  /** 今天已经问过了 */
  sentToday: boolean;
  history: NudgeHistory[];
}): NudgePick | null {
  if (v.sentToday) return null;

  // 上次用这条规则问了、人没回应 → 这条规则先歇 7 天
  const muted = new Set(
    v.history
      .filter((h) => !h.responded && h.daysAgo < UNANSWERED_DAYS)
      .map((h) => h.rule),
  );

  // 同一条经历 + 同一规则，30 天内不重复
  const recent = new Set(
    v.history
      .filter((h) => h.daysAgo < SAME_ATOM_RULE_DAYS && h.atomId !== null)
      .map((h) => `${h.rule}:${h.atomId}`),
  );

  const usable = (rule: NudgeRule, c: NudgeCandidate) =>
    !muted.has(rule) && !recent.has(`${rule}:${c.atomId}`);

  // R3 久没来。挑最该更新的那条：先看有没有待补，再看谁最久没动。
  if (
    v.daysSinceLastVisit !== null &&
    v.daysSinceLastVisit >= AWAY_DAYS &&
    !muted.has("R3")
  ) {
    const c = [...v.candidates]
      .sort(
        (a, b) =>
          b.pendingNames.length - a.pendingNames.length ||
          b.daysSinceUpdate - a.daysSinceUpdate,
      )
      .find((x) => usable("R3", x));
    if (c !== undefined) {
      return {
        rule: "R3",
        candidate: c,
        reason: `用户 ${v.daysSinceLastVisit} 天没来了，这条是档案里最该更新的一条`,
      };
    }
  }

  // R2 上线了但还有数据没填
  const r2 = v.candidates
    .filter((c) => c.status === "shipped" && c.pendingNames.length > 0)
    .sort((a, b) => b.pendingNames.length - a.pendingNames.length)
    .find((c) => usable("R2", c));
  if (r2 !== undefined) {
    return {
      rule: "R2",
      candidate: r2,
      reason: `这条已经上线，但还有 ${r2.pendingNames.length} 项数据没填`,
    };
  }

  // R1 开发中但停了很久
  const r1 = v.candidates
    .filter((c) => c.status === "in_dev" && c.daysSinceUpdate > STALE_DAYS)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
    .find((c) => usable("R1", c));
  if (r1 !== undefined) {
    return {
      rule: "R1",
      candidate: r1,
      reason: `这条状态还停在开发中，已经 ${r1.daysSinceUpdate} 天没更新了`,
    };
  }

  return null;
}
