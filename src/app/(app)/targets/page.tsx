import { JdSection } from "@/components/targets/JdSection";
import { TargetsView } from "@/components/targets/TargetsView";
import { getJd, listJds } from "@/lib/queries/jds";
import { listTargets } from "@/lib/queries/targets";
import { resolveTarget } from "@/lib/targets/shape";

// S6。?target= 定方向，?jd= 定这一页看的是哪份 JD，刷新后都能恢复。
export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const targets = await listTargets();
  const selected = resolveTarget(targets, params.target);

  const jds = selected ? await listJds(selected.id) : [];

  // ?jd= 认不出来就退回最新一份；一份都没有时为 null。
  const wantedJd = Array.isArray(params.jd) ? params.jd[0] : params.jd;
  const jdId = jds.find((j) => j.id === wantedJd)?.id ?? jds[0]?.id ?? null;
  const jd = jdId ? await getJd(jdId) : null;

  return (
    <div>
      <TargetsView
        targets={targets}
        selectedId={selected?.id ?? null}
        openNew={params.new === "1"}
      />
      {selected && <JdSection targetId={selected.id} jds={jds} jd={jd} />}
    </div>
  );
}
