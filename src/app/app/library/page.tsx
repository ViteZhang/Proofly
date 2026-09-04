import { getAtomDetail, getAtomTree, getProofSummary } from "@/lib/queries/atoms";
import { getAtomStrategies } from "@/lib/queries/strategy";
import { AtomPane } from "@/components/library/AtomPane";
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

  // 各方向策略跟经历本体分开查：经历库是全局视图，策略是方向视图，
  // 两者的生命周期不一样，硬塞进 getAtomDetail 会让经历库读取绑上 targets。
  const strategies = detail ? await getAtomStrategies(detail.id) : [];

  // 父级下拉只列经历，且不能选自己。
  const projects = tree.groups
    .flatMap((g) => g.atoms)
    .filter((a) => a.level === "project" && a.id !== detail?.id)
    .map((a) => ({ id: a.id, title: a.title }));

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
            <AtomPane key={detail.id} detail={detail} projects={projects} strategies={strategies} />
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
