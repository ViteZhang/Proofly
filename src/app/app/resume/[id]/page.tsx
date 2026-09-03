import Link from "next/link";
import { notFound } from "next/navigation";
import { VersionDetailView } from "@/components/resume/VersionDetailView";
import { getVersion } from "@/lib/queries/resume";

// S8-B 第二层：只展示差异。完整简历要点「看完整简历」才展开 ——
// 默认摊开全文的话，用户每次都要自己找出这一版跟基线哪里不一样。
export default async function VersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const version = await getVersion(id);
  if (!version) notFound();

  return (
    <div>
      <Link
        href={`/app/resume?target=${version.targetId}`}
        className="text-[13px] hover:underline"
        style={{ color: "var(--mute)" }}
      >
        ← 返回版本列表
      </Link>
      <VersionDetailView version={version} />
    </div>
  );
}
