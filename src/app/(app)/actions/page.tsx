import { ActionsView } from "@/components/actions/ActionsView";
import { getTaskBoard } from "@/lib/queries/tasks";
import { listAnchorAtoms, listOpenGaps } from "@/lib/queries/plan";

// 全局任务池，不随方向切换。方向选择器的置灰在 lib/nav.ts 里判定。
export default async function ActionsPage() {
  const [board, gaps, anchors] = await Promise.all([
    getTaskBoard(),
    listOpenGaps(),
    listAnchorAtoms(),
  ]);

  return (
    <ActionsView
      board={board}
      gaps={gaps.map((g) => ({
        id: g.id,
        targetName: g.targetName,
        text: g.text,
        gapType: g.gapType,
      }))}
      anchors={anchors.map((a) => ({ id: a.id, title: a.title }))}
    />
  );
}
