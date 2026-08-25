import { getAtomDetail, getAtomTree, getProofSummary } from "@/lib/queries/atoms";
import { AtomDetail } from "@/components/library/AtomDetail";
import { EmptyLibrary } from "@/components/library/EmptyLibrary";
import { LibraryTree } from "@/components/library/LibraryTree";

// 选中经历由 ?atom=<id> 决定，刷新与分享都能定位到同一条。
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ atom?: string }>;
}) {
  const [{ atom }, tree, summary] = await Promise.all([
    searchParams,
    getAtomTree(),
    getProofSummary(),
  ]);

  if (tree.total === 0) return <EmptyLibrary />;

  // id 不存在 / 不是本人的 / 压根不是 uuid，都返回 null，走下面的降级。
  const detail = atom ? await getAtomDetail(atom) : null;

  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold tracking-tight">经历库</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        事实层，全局唯一
      </p>

      <div className="mt-5 flex items-start gap-5">
        <LibraryTree tree={tree} summary={summary} />

        <section className="min-w-0 flex-1">
          {detail ? (
            <AtomDetail atom={detail} />
          ) : (
            <div
              className="rounded-card px-6 py-7 text-[13.5px]"
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                color: "var(--slate)",
              }}
            >
              {atom ? "这条经历不在了。从左边挑一条。" : "从左边挑一条经历。"}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
