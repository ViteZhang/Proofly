import { AssessPanel } from "@/components/targets/AssessPanel";
import { JdSection } from "@/components/targets/JdSection";
import { TargetsView } from "@/components/targets/TargetsView";
import { getLatestAssessment } from "@/lib/queries/assessments";
import { getGapTaskLinks } from "@/lib/queries/tasks";
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
  const assessment = jdId ? await getLatestAssessment(jdId) : null;
  // 逐条对照里「→ 已生成行动」的跳转靠这张表
  const taskLinks = assessment ? await getGapTaskLinks(assessment.id) : {};

  return (
    <div>
      <TargetsView
        targets={targets}
        selectedId={selected?.id ?? null}
        openNew={params.new === "1"}
      />
      {selected && (
        <JdSection
          targetId={selected.id}
          jds={jds}
          jd={jd}
          assessPanel={
            jd && (
              <AssessPanel
                key={jd.id}
                jdId={jd.id}
                hasRequirements={jd.requirements.length > 0}
                assessment={assessment}
                taskLinks={taskLinks}
              />
            )
          }
        />
      )}
    </div>
  );
}
