import { getReviewQueue } from "@/lib/queries/drafts";
import { ReviewQueue } from "@/components/import/ReviewQueue";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const [{ jobId }, sp] = await Promise.all([params, searchParams]);
  const queue = await getReviewQueue(jobId);

  if (!queue) {
    return (
      <div className="max-w-[760px]">
        <h1 className="font-display text-[26px] font-semibold tracking-tight">确认抽取结果</h1>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
          找不到这个作业。回导入页重新传一份。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">确认抽取结果</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        {queue.pending > 0
          ? `${queue.docName ?? "这份文档"}里抽出 ${queue.pending} 条。每条都展开原文依据看一眼，抽错了在这里就能拦下。`
          : "这份文档处理完了。"}
      </p>

      <div className="mt-5">
        <ReviewQueue queue={queue} taskId={sp.task ?? null} />
      </div>
    </div>
  );
}
