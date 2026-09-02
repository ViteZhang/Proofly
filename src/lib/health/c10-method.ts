// =============================================================
// C10 · measured 指标的口径为空
//
// 提示级。Step 7 出题时发现的隐蔽风险点：measured 看起来是最硬的一档，
// 但如果没记口径，面试官问「这 5% 怎么算的、有没有对照组」，当场答不上来。
//
// 这比明确知道自己没数据更危险——没数据你会提前准备说辞，有数字没口径
// 你不会，你会以为这条稳。
//
// 与 Step 7 的 methodlessMetrics 判的是同一件事，但口径更严一档：
// 那边只要非空即可，这边要求长度 ≥ 5。「估算」两个字不算口径。
// =============================================================

import { blank, type HealthCheck, type HealthContext, type HealthIssue, type HealthMetric } from "./types";

export const MIN_METHOD_LEN = 5;

export function methodMissing(m: HealthMetric): boolean {
  if (m.evidenceLevel !== "measured") return false;
  return blank(m.method) || m.method!.trim().length < MIN_METHOD_LEN;
}

function valueOf(m: HealthMetric): string {
  if (m.delta) return m.delta;
  if (m.fromValue && m.toValue) return `${m.fromValue} → ${m.toValue}`;
  return m.toValue ?? m.fromValue ?? "";
}

export const c10Method: HealthCheck = {
  code: "C10",
  level: "info",
  scope: "atoms",
  label: "实测指标都记了口径",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    const out: HealthIssue[] = [];
    for (const atom of ctx.atoms) {
      for (const m of atom.metrics) {
        if (!methodMissing(m)) continue;
        const v = valueOf(m);
        out.push({
          code: "C10",
          level: "info",
          title: `「${atom.title}」的「${m.name}」标成实测，但没记怎么算的`,
          detail:
            `${v ? `这条指标写的是 ${v}，` : ""}证明度是实测，口径栏是空的。\n\n` +
            `面试官会问这个数怎么算的——分母是什么、时间窗口多长、有没有对照组。现在答不上来。\n` +
            `补一句口径就行，不用很长：「按周活跃用户算，对比上线前四周均值」这种程度就够。`,
          refIds: [atom.id, m.id],
          resolveLink: `/library?atom=${atom.id}&metric=${m.id}&highlight=metrics`,
          fingerprint: `C10:${m.id}`,
          autoFixable: false,
        });
      }
    }
    return out;
  },
};
