import { getProfileOverview } from "@/lib/queries/profile";
import { CompletenessCard } from "@/components/profile/CompletenessCard";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { EnsureFacts } from "@/components/profile/EnsureFacts";

/**
 * 基本信息。
 *
 * 从头像菜单里提出来，成为一级入口 —— profile_facts 里的每一条都会原样
 * 印在简历上，它是内容，不是设置。
 */
export default async function ProfilePage() {
  const data = await getProfileOverview();

  return (
    <div className="max-w-[840px]">
      <EnsureFacts missing={data.missingFactKeys} />

      <span
        className="inline-flex items-center rounded-pill px-2.5 py-[3px] text-[11.5px] font-medium"
        style={{ background: "var(--line-soft)", color: "var(--mute)" }}
      >
        全局 · 所有方向共用
      </span>
      <h1 className="mt-2 font-display text-[26px] font-semibold tracking-tight">基本信息</h1>
      <p className="mt-1.5 max-w-[660px] text-[14px]" style={{ color: "var(--slate)" }}>
        这里的每一条都会原样印在简历上。它不是设置，是你档案的第一屏。
      </p>

      <div className="mt-5 space-y-3">
        <CompletenessCard data={data.completeness} />
        <ProfileClient
          facts={data.facts}
          educations={data.educations}
          employments={data.employments}
          credentials={data.credentials}
        />
      </div>
    </div>
  );
}
