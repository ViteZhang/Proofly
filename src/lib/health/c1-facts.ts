// =============================================================
// C1 · 事实层存在 BLOCKING
//
// 阻断级。基本事实自己都没定死，底下所有产物都建在流沙上。
//
// 这一项按方案是「代码」实现——直接查 profile_facts，不走门禁的
// G4 汇总。理由是 detail 要列出 conflict_log 里的各方说法，而门禁的
// G4 只写了一句「这一项被标成 BLOCKING」，信息不够用户当场判断。
// 汇总门禁行时会跳过 G4，避免同一件事报两遍。
// =============================================================

import type { HealthCheck, HealthContext, HealthIssue } from "./types";

export const c1Facts: HealthCheck = {
  code: "C1",
  level: "blocking",
  scope: "facts",
  label: "基本事实没有待定项",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    return ctx.facts
      .filter((f) => f.status === "BLOCKING")
      .map((f) => {
        const lines = f.conflicts.map(
          (c) => `  · ${c.value}${c.source ? `（来自${c.source}）` : ""}`,
        );
        const body =
          lines.length > 0
            ? `几处材料说法不一样：\n${lines.join("\n")}\n\n定死一个之后，简历、面试题里用到「${f.label}」的地方都会跟着走这一个口径。`
            : `这一项被标成了待定，但没有记下候选值。去事实台账里填一个准确的值。`;

        return {
          code: "C1",
          level: "blocking" as const,
          title: `「${f.label}」还没定下来`,
          detail: `${body}\n\n在解决之前，简历生成会被拦住。`,
          refIds: [f.id],
          resolveLink: `/app/facts?key=${encodeURIComponent(f.key)}&highlight=1`,
          fingerprint: `C1:${f.key}`,
          autoFixable: false,
        };
      });
  },
};
