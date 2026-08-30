import Link from "next/link";
import { StrategyBoard } from "@/components/targets/StrategyBoard";
import { getStrategyBoard } from "@/lib/queries/strategy";
import { listTargetOptions } from "@/lib/queries/targets";
import { resolveTarget } from "@/lib/targets/shape";

// 批量配置页。方向由 ?target= 决定，跟顶栏选择器共用同一个参数。
export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const [params, targets] = await Promise.all([searchParams, listTargetOptions()]);
  const selected = resolveTarget(targets, params.target);

  if (!selected) {
    return (
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">配置经历策略</h1>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
          还没有求职方向。策略是「这条经历在这个方向下怎么讲」，得先有方向。
        </p>
        <Link
          href="/targets"
          className="mt-3 inline-block text-[13.5px] hover:underline"
          style={{ color: "var(--ink)" }}
        >
          去建一个 →
        </Link>
      </div>
    );
  }

  const board = await getStrategyBoard(selected.id);
  if (!board) return null;

  return <StrategyBoard key={board.target.id} board={board} />;
}
