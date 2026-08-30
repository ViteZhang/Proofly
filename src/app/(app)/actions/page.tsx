import { ActionsView } from "@/components/actions/ActionsView";
import { getTaskBoard } from "@/lib/queries/tasks";

// 全局任务池，不随方向切换。方向选择器的置灰在 lib/nav.ts 里判定。
export default async function ActionsPage() {
  const board = await getTaskBoard();
  return <ActionsView board={board} />;
}
