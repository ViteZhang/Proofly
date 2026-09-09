import { ImportFlow } from "@/components/import/ImportFlow";
import { findOpenJob } from "./job-actions";

/**
 * 这个页面上发起的 Server Action 最多能跑多久（秒）。
 *
 * 抽取跑在 after() 里，而 after() 跟发起它的那次请求共用同一个函数调用，
 * 也就共用这把刀。以前一行都没声明，走的是平台默认值——线上实测就是 300 秒，
 * 时间一到正在 await 的模型调用凭空消失，连错误都留不下来。
 *
 * 写死 300 是**已经实测生效**的值，改大有部署被拒的风险（要看 Vercel 套餐：
 * Pro + Fluid 才能到 800）。确认套餐支持之后，这里和 pipeline.ts 的
 * INVOCATION_BUDGET_MS 一起调大，抽取能一次跑完的量就跟着涨。
 * 两个数的关系由 src/lib/ingest/budget.guard.test.ts 守着。
 */
export const maxDuration = 300;

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
