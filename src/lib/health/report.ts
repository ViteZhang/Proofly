// =============================================================
// 体检报告的组装
//
// 把检查项吐出来的 issue 分组、算数、套上忽略状态。纯函数，不连库——
// 「有 2 处必须解决」这个数字算错了，整页的可信度就没了，所以它得能单测。
// =============================================================

import type { HealthIssue, HealthLevel } from "./types";

export type IgnoreRecord = { fingerprint: string; reason: string | null };

export type ReportIssue = HealthIssue & {
  ignored: boolean;
  ignoreReason: string | null;
};

export type PassedCheck = { code: string; label: string };

export type HealthReport = {
  blocking: ReportIssue[];
  warning: ReportIssue[];
  info: ReportIssue[];
  ignored: ReportIssue[];
  passed: PassedCheck[];
  /** 未忽略的阻断条数。顶栏芯片、生成拦截都看这个。 */
  blockingCount: number;
  /** 未忽略的警告 + 提示条数。 */
  minorCount: number;
};

const ORDER: HealthLevel[] = ["blocking", "warning", "info"];

export function buildReport(
  issues: HealthIssue[],
  ignores: IgnoreRecord[],
  ranChecks: { code: string; label: string }[],
): HealthReport {
  const ignoreMap = new Map(ignores.map((i) => [i.fingerprint, i.reason]));

  const marked: ReportIssue[] = issues.map((i) => ({
    ...i,
    // 阻断级不提供忽略入口（§十-7）。就算库里因为降级留着一条旧的忽略
    // 记录，也不认——否则等于留了个隐藏开关。
    ignored: i.level !== "blocking" && ignoreMap.has(i.fingerprint),
    ignoreReason: i.level !== "blocking" ? (ignoreMap.get(i.fingerprint) ?? null) : null,
  }));

  const live = marked.filter((i) => !i.ignored);
  const byLevel = (lv: HealthLevel) => live.filter((i) => i.level === lv);

  // 通过项：这一轮跑了、但一条问题都没出的检查。给「确实检查过了」的确定感。
  const hasIssue = new Set(live.map((i) => i.code));
  const passed = ranChecks
    .filter((c) => !hasIssue.has(c.code))
    .map((c) => ({ code: c.code, label: c.label }));

  return {
    blocking: byLevel("blocking"),
    warning: byLevel("warning"),
    info: byLevel("info"),
    ignored: marked.filter((i) => i.ignored),
    passed,
    blockingCount: byLevel("blocking").length,
    minorCount: byLevel("warning").length + byLevel("info").length,
  };
}

/** 顶部状态条的三种样子。 */
export type Banner =
  | { kind: "blocked"; headline: string; sub: string | null }
  | { kind: "minor"; headline: string; sub: null }
  | { kind: "clear"; headline: string; sub: null };

export function bannerOf(r: HealthReport): Banner {
  if (r.blockingCount > 0) {
    return {
      kind: "blocked",
      headline: `有 ${r.blockingCount} 处必须解决，简历生成已经暂停`,
      sub: r.minorCount > 0 ? `另外还有 ${r.minorCount} 处小问题，建议一起看看` : null,
    };
  }
  if (r.minorCount > 0) {
    return { kind: "minor", headline: `${r.minorCount} 处小问题，建议看看`, sub: null };
  }
  return { kind: "clear", headline: "一切正常，可以放心投", sub: null };
}

export function sortIssues(issues: ReportIssue[]): ReportIssue[] {
  return [...issues].sort(
    (a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || a.code.localeCompare(b.code),
  );
}
