// =============================================================
// Proofly · 面试（S9）
//
// 题包挂在投递版本上，不挂 JD —— 同一份 JD 的两个简历版本用到的
// 经历不同，被问的东西也不同。所以入口先选版本。
// =============================================================

import { getKit, listVersionOptions } from "@/lib/queries/interview";
import { getKitJobProgress } from "@/app/app/interview/job-actions";
import { InterviewBoard } from "@/components/interview/InterviewBoard";

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const versions = await listVersionOptions();
  // 没指定就选第一份 —— 已投递的排在前面，那通常就是最近要面的那家。
  const selected = versions.find((x) => x.id === v) ?? versions[0] ?? null;
  const kit = selected ? await getKit(selected.id) : null;
  // 服务端就把作业状态读出来：刷新或换台设备打开时，正在跑的作业
  // 立刻接着显示进度，不用等第一次轮询。
  const jobRes = kit ? await getKitJobProgress(kit.id) : null;
  const job = jobRes?.ok ? jobRes.data : null;

  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold tracking-tight">面试</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        知道会被问什么，尤其是会被问倒什么
      </p>
      <InterviewBoard kit={kit} versions={versions} selected={selected} job={job} />
    </div>
  );
}
