// =============================================================
// C2 C3 C4 C5 · 从门禁结果汇总
//
// 《Step 8》§十-3：只做汇总，不要重新实现检测逻辑。检测在 Step 6 的
// 门禁引擎（gate.ts）里，重复实现必然导致两处判定不一致——体检页说
// 没问题、生成时被拦，或者反过来，都是用户对这个功能失去信任的开始。
//
// 门禁码 → 体检码：
//   G1 措辞与证明度不符      → C3
//   G3 出现来源里没有的数字   → C3（同一类：简历文本与来源对不上）
//   G2 触发 never_say        → C4
//   G5 技能栏有空标签        → C2
//   G6 互斥组多条同现        → C5
//   G4 事实层 BLOCKING       → 跳过，由 C1 直接查库出（detail 更全）
//
// 级别一律照抄门禁，不在这里改判。方案第二节把 C5 标成「警告」，而
// Step 6 的 G6 判的是阻断——两者矛盾时以门禁为准：体检页显示「警告，
// 可以放心投」而生成实际被拦，是比级别标错更严重的问题。已列入待确认。
// =============================================================

import type { GateRow, HealthCheck, HealthContext, HealthIssue, HealthLevel } from "./types";

const GATE_TO_CODE: Record<string, string> = {
  G1: "C3",
  G3: "C3",
  G2: "C4",
  G5: "C2",
  G6: "C5",
};

/** 门禁只有 blocking / warning / pass 三档，pass 不进体检的问题列表。 */
function levelOf(row: GateRow): HealthLevel {
  return row.level === "blocking" ? "blocking" : "warning";
}

function ownerLabel(ctx: HealthContext, owner: string | null): string {
  if (!owner) return "某份简历";
  const r = ctx.resumes.find((x) => `${x.kind}:${x.id}` === owner);
  return r ? r.label : "某份简历";
}

function resolveLink(ctx: HealthContext, code: string, row: GateRow): string {
  if (code === "C2") {
    // G5 的 ref 没带 skill id，只能按标签名回查。
    const m = row.title.match(/「(.+?)」/);
    const skill = m ? ctx.skills.find((s) => s.label === m[1]) : undefined;
    // 方案写的是 /library?tab=skills&skill=<id>，但技能栏不是一个独立页面 ——
    // 技能挂在经历面板里，要给它补证据只能去某条经历上。所以跳到第一条
    // 挂了它的经历并展开技能区；一条都没挂就跳经历库，那正是要做的事：
    // 要么把它挂到一条经历上，要么删掉它。
    const atomId = skill?.atomIds[0];
    return atomId ? `/app/library?atom=${atomId}&highlight=skills` : "/app/library?highlight=skills";
  }
  const target = ctx.resumes.find((x) => `${x.kind}:${x.id}` === row.owner)?.targetId;
  if (code === "C5") {
    return target ? `/app/targets/strategy?target=${target}&section=strategy` : "/app/targets";
  }
  const parts = [target ? `target=${target}` : "", row.blockId ? `block=${row.blockId}` : ""].filter(
    Boolean,
  );
  return parts.length > 0 ? `/app/resume?${parts.join("&")}` : "/app/resume";
}

function issuesFor(code: string, ctx: HealthContext): HealthIssue[] {
  const rows = ctx.gateRows.filter(
    (r) => r.code !== null && GATE_TO_CODE[r.code] === code && r.level !== "pass",
  );

  return rows.map((row) => {
    const where = ownerLabel(ctx, row.owner);
    return {
      code,
      level: levelOf(row),
      title: `${where}：${row.title}`,
      detail: row.detail ?? "",
      refIds: [row.id],
      resolveLink: resolveLink(ctx, code, row),
      // 门禁行每次重新生成都换 id，认人只能靠「哪份简历 + 什么问题」。
      fingerprint: `${code}:${row.owner ?? "-"}:${row.title}`,
      autoFixable: false,
    };
  });
}

function make(code: string, level: HealthLevel, scope: HealthCheck["scope"], label: string): HealthCheck {
  return {
    code,
    level,
    scope,
    label,
    async run(ctx) {
      return issuesFor(code, ctx);
    },
  };
}

export const c2Skills = make("C2", "blocking", "skills", "技能栏没有拿不出证明的标签");
export const c3Wording = make("C3", "blocking", "resume", "简历措辞与来源经历的证明度相符");
export const c4NeverSay = make("C4", "blocking", "resume", "简历没有触碰护栏禁词");
export const c5Exclusive = make("C5", "warning", "resume", "同方向互斥组没有多条同时出现");
