import { TargetsView } from "@/components/targets/TargetsView";
import { listTargets, resolveTarget } from "@/lib/queries/targets";

// S6 区块一。?target= 是这一页的上下文来源，刷新后靠它恢复选中。
export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const targets = await listTargets();
  const selected = resolveTarget(targets, params.target);

  return (
    <TargetsView
      targets={targets}
      selectedId={selected?.id ?? null}
      openNew={params.new === "1"}
    />
  );
}
