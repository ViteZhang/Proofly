// =============================================================
// C8 · 源文档与经历字段的语义级事实冲突
//
// 《Step 8》切片 8.4。深扫，走模型。
//
// 判定归模型（语义比对代码做不了），但**级别归代码**：
//   high      → 警告
//   medium/low → 提示
// C8 不产生阻断（§十-5）。语义判定有误报可能，不能因此拦住投简历。
//
// 筛选：只对关联了 2 个及以上源文档的经历执行。单一来源不可能自相矛盾，
// 发起调用只是白花钱。
//
// 这个文件不 import Next、不连库、不调模型 —— 组装输入与消化输出都在
// 这里，调用本身在 job.ts。同一个理由：「只关联 1 份文档的经历跳过」
// 「high 归警告」这些必须能脱库验证。
// =============================================================

import type { HealthAtom, HealthCheck, HealthContext, HealthIssue, HealthLevel } from "./types";
import type { PlannedConflict } from "./c8-schema";

/** 单一来源不可能自相矛盾。 */
export const MIN_SOURCES = 2;

export function atomsToScan(ctx: HealthContext): HealthAtom[] {
  return ctx.atoms.filter((a) => a.sourceDocIds.length >= MIN_SOURCES);
}

// ---- 输入组装 ----

export function atomJson(a: HealthAtom): string {
  return JSON.stringify(
    {
      title: a.title,
      org: a.org,
      role: a.role,
      period: [a.periodStart, a.periodEnd],
      status: a.status,
      situation: a.situation,
      task: a.task,
      actions: a.actions,
      metrics: a.metrics.map((m) => ({
        name: m.name,
        kind: m.kind,
        from: m.fromValue,
        to: m.toValue,
        delta: m.delta,
        method: m.method,
        evidence_level: m.evidenceLevel,
      })),
    },
    null,
    2,
  );
}

/** 片段长度上限。整份 parsed_text 塞进去，一条经历就能把上下文吃满。 */
export const EXCERPT_LIMIT = 4000;

export function sourceExcerptsJson(ctx: HealthContext, a: HealthAtom): string {
  const docs = ctx.sourceDocs.filter((d) => a.sourceDocIds.includes(d.id));
  return JSON.stringify(
    docs.map((d) => ({
      文档名: d.filename,
      // 上传时间是判断「进展还是矛盾」的唯一依据：新材料说的状态比旧的
      // 更靠后是进展，反过来才是矛盾。缺了它，模型只能瞎猜。
      上传时间: d.ingestedAt,
      原文片段: (d.parsedText ?? "").slice(0, EXCERPT_LIMIT),
    })),
    null,
    2,
  );
}

export function resumeTextsJson(ctx: HealthContext, a: HealthAtom): string {
  const out: { 求职方向: string; 简历原文: string }[] = [];
  for (const r of ctx.resumes) {
    for (const b of r.blocks) {
      if (b.atomId !== a.id || !b.renderedText) continue;
      out.push({ 求职方向: r.label, 简历原文: b.renderedText });
    }
  }
  return JSON.stringify(out, null, 2);
}

// ---- 输出消化 ----

export function levelOfSeverity(severity: string): HealthLevel {
  // high 才值得打断你。medium/low 是「记录不及时」和「细节出入」，
  // 放在提示里，看见就行。
  return severity.trim().toLowerCase() === "high" ? "warning" : "info";
}

/** 说不出两处说法的「矛盾」没法核对，等于没报。 */
export function usable(c: PlannedConflict): boolean {
  if (c.subject.trim() === "") return false;
  const said = c.statements.filter((s) => s.claim.trim() !== "");
  return said.length >= 2;
}

export function buildConflictIssues(
  atom: HealthAtom,
  conflicts: PlannedConflict[],
): { issues: HealthIssue[]; dropped: string[] } {
  const issues: HealthIssue[] = [];
  const dropped: string[] = [];

  for (const c of conflicts) {
    if (!usable(c)) {
      dropped.push(
        `「${c.subject.trim() || "没写明是什么"}」只给了一处说法，没法核对，已丢弃`,
      );
      continue;
    }

    const lines = c.statements
      .filter((s) => s.claim.trim() !== "")
      .map((s) => `  ${s.source.trim() || "某份材料"}：${s.claim.trim()}`);

    const why = c.why_conflict.trim();
    const act = c.suggested_action.trim();

    issues.push({
      code: "C8",
      level: levelOfSeverity(c.severity),
      title: `「${atom.title}」的「${c.subject.trim()}」，几份材料说法不一样`,
      detail:
        `${lines.join("\n")}\n\n` +
        (why ? `${why}\n\n` : "") +
        (act ? `建议：${act}\n\n` : "") +
        `这是语义比对找出来的，可能有误报 —— 拿不准就当没看见，它不会拦住任何事。`,
      refIds: [atom.id],
      resolveLink: `/library?atom=${atom.id}`,
      fingerprint: `C8:${atom.id}:${c.subject.trim()}`,
      autoFixable: false,
    });
  }

  return { issues, dropped };
}

/**
 * 登记项。C8 的结果由深扫作业（deep-job.ts）写进 check_results，
 * 报告从库里读 —— 所以这里的 run() 什么也不做。它存在是为了让 C8 在
 * 「N 项检查通过」里有名字，以及让报告知道哪些 code 属于深扫。
 */
export const c8Conflict: HealthCheck = {
  code: "C8",
  level: "warning",
  scope: "cross_doc",
  label: "多份材料对同一件事的说法一致",
  deep: true,
  async run() {
    return [];
  },
};
