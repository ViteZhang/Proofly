// =============================================================
// C9 · 经历长期未更新且状态仍是「开发中」
//
// 提示级。in_dev 放了两个月没动，通常是两种情况：一是已经上线了但
// 忘了改状态，简历上就一直写着「开发中」，白白压低证明度；二是真的
// 停了，那简历里就不该还按在做的口径写。哪一种都该去看一眼。
// =============================================================

import type { HealthCheck, HealthContext, HealthIssue } from "./types";

export const STALE_DAYS = 60;

export function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

export const c9Stale: HealthCheck = {
  code: "C9",
  level: "info",
  scope: "atoms",
  label: "开发中的经历都在近期更新过",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    return ctx.atoms
      .filter((a) => a.status === "in_dev" && daysSince(a.updatedAt, ctx.now) > STALE_DAYS)
      .map((a) => {
        const days = daysSince(a.updatedAt, ctx.now);
        return {
          code: "C9",
          level: "info" as const,
          title: `「${a.title}」还挂着开发中，已经 ${days} 天没动过`,
          detail:
            `状态是开发中，但最后一次更新在 ${days} 天前。\n\n` +
            `如果它其实已经上线了，改成 shipped 之后证明度会跟着升——现在简历上是按「开发中」的口径写的，说轻了。\n` +
            `如果它真的停了，那简历里也不该再按在做的说法写。`,
          refIds: [a.id],
          resolveLink: `/app/library?atom=${a.id}&highlight=metrics`,
          fingerprint: `C9:${a.id}`,
          autoFixable: false,
        };
      });
  },
};
