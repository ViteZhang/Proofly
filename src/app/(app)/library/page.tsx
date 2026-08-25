import { getAtomTree, getProofSummary, type AtomNode } from "@/lib/queries/atoms";
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

  const selected = atom ? findAtom(tree.groups, atom) : null;

  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold tracking-tight">经历库</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        事实层，全局唯一
      </p>

      <div className="mt-5 flex items-start gap-5">
        <LibraryTree tree={tree} summary={summary} />

        {/* 右栏详情是切片 1.3 的事，这里先占位 */}
        <section className="min-w-0 flex-1">
          <div
            className="rounded-card px-6 py-7"
            style={{ background: "var(--card)", border: "1px solid var(--line)" }}
          >
            {selected ? (
              <>
                <h2 className="font-display text-[19px] font-semibold tracking-tight">
                  {selected.title}
                </h2>
                <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--slate)" }}>
                  详情区在切片 1.3 接上。
                </p>
              </>
            ) : (
              <p className="text-[13.5px]" style={{ color: "var(--slate)" }}>
                {atom ? "这条经历不在了。从左边挑一条。" : "从左边挑一条经历。"}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function findAtom(
  groups: { atoms: AtomNode[] }[],
  id: string,
): AtomNode | null {
  for (const group of groups) {
    for (const node of group.atoms) {
      if (node.id === id) return node;
      const child = node.children.find((c) => c.id === id);
      if (child) return child;
    }
  }
  return null;
}
