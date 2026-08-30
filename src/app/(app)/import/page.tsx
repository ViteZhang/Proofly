import { ImportFlow } from "@/components/import/ImportFlow";
import { findOpenJob } from "./job-actions";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  // 上次没处理完的作业接着显示——页面关掉不代表活停了。
  const [open, sp] = await Promise.all([findOpenJob(), searchParams]);

  return (
    <div className="max-w-[720px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">导入</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        传一份旧简历、项目复盘或者工作总结，我先读一遍，抽出来的每一条都由你确认。
      </p>

      <div className="mt-5">
        <ImportFlow resumeJobId={open.ok ? open.data : null} taskId={sp.task ?? null} />
      </div>
    </div>
  );
}
