import { BaselineWorkbench } from "@/components/resume/BaselineWorkbench";
import { VersionSection } from "@/components/resume/VersionSection";
import { getBaseline, listBaselines, listVersions } from "@/lib/queries/resume";
import { listTargets } from "@/lib/queries/targets";
import { resolveTarget } from "@/lib/targets/shape";
import Link from "next/link";

// S8-A。?target= 定方向，与求职方向页共用顶栏的方向选择器。
export default async function ResumePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const targets = await listTargets();
  const selected = resolveTarget(targets, params.target);

  if (!selected) {
    return (
      <div>
        <Header />
        <p
          className="mt-5 max-w-[52ch] rounded-card px-5 py-4 text-[13.5px] leading-relaxed"
          style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--slate)" }}
        >
          还没有求职方向。简历是从方向长出来的 —— 一个方向一份基线，一份 JD 一份投递版本。
          <Link href="/targets" className="ml-1 underline" style={{ color: "var(--ink)" }}>
            先建一个方向
          </Link>
        </p>
      </div>
    );
  }

  const [baseline, summaries, versions] = await Promise.all([
    getBaseline(selected.id),
    listBaselines(),
    listVersions(selected.id),
  ]);

  return (
    <div>
      <Header />
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--mute)" }}>
        {summaries
          .map(
            (s) =>
              `${s.targetName}：${
                s.baselineId === null || s.blockCount === 0
                  ? "未生成"
                  : s.lockedAt
                    ? `已锁定 · ${s.blockCount} 块`
                    : `未锁定 · ${s.blockCount} 块`
              }`,
          )
          .join("　")}
      </p>
      <BaselineWorkbench
        key={selected.id}
        targetId={selected.id}
        targetName={selected.name}
        baseline={baseline}
      />
      <VersionSection
        hasBaseline={!!baseline && baseline.blocks.length > 0}
        locked={versions.locked}
        versions={versions.versions}
        jdsWithoutVersion={versions.jdsWithoutVersion}
      />
    </div>
  );
}

function Header() {
  return (
    <>
      <h1 className="font-display text-[26px] font-semibold tracking-tight">简历</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        方向基线 + 逐 JD 增量
      </p>
    </>
  );
}
