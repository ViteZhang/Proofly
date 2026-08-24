// =============================================================
// 切片 1.1 的停下点：把数据访问层的返回结构原样打出来核对。
// 不是产品页面，切片 1.7 收尾时删除。
// =============================================================

import { getAtomDetail, getAtomTree, getProofSummary } from "@/lib/queries/atoms";
import { getProfileFacts } from "@/lib/queries/facts";
import { EVIDENCE_DOT, EVIDENCE_LABEL, EVIDENCE_ORDER } from "@/lib/domain";
import { SeedControls } from "./SeedControls";

export const dynamic = "force-dynamic";

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-[15px] font-semibold">{title}</h2>
      <pre
        className="mt-2 overflow-x-auto rounded-btn p-3 text-[12px] leading-[1.55]"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export default async function QueryCheckPage() {
  const [tree, summary, facts] = await Promise.all([
    getAtomTree(),
    getProofSummary(),
    getProfileFacts(),
  ]);

  // 详情取树里第一条，用来核对 metrics / guards / skills 的挂载
  const firstId = tree.groups[0]?.atoms[0]?.id ?? null;
  const detail = firstId ? await getAtomDetail(firstId) : null;

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8" style={{ color: "var(--ink)" }}>
      <h1 className="font-display text-[22px] font-semibold tracking-tight">数据层核对</h1>
      <p className="mb-4 mt-1 text-[13px]" style={{ color: "var(--slate)" }}>
        切片 1.1 的停下点。核对完这三份结构就继续做左栏。
      </p>

      <SeedControls />

      {/* 树的可读形态，跟左栏最终要长的样子对齐 */}
      <section className="mt-6">
        <h2 className="font-display text-[15px] font-semibold">
          经历树（全部 {tree.total}）
        </h2>
        <div
          className="mt-2 rounded-btn p-3 text-[13px] leading-[1.9]"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          {tree.groups.length === 0 ? (
            <span style={{ color: "var(--mute)" }}>还没有经历。点上面「灌入样例数据」。</span>
          ) : (
            tree.groups.map((g) => (
              <div key={g.key}>
                <div className="font-medium" style={{ color: "var(--slate)" }}>
                  {g.title}
                  <span className="ml-1.5 text-[11px]" style={{ color: "var(--mute)" }}>
                    {g.kind}
                  </span>
                </div>
                {g.atoms.map((a) => (
                  <div key={a.id}>
                    <div className="pl-4">
                      {EVIDENCE_DOT[a.evidence_level]} {a.title}
                      {a.childCount > 0 && (
                        <span className="ml-2" style={{ color: "var(--mute)" }}>
                          {a.childCount}
                        </span>
                      )}
                    </div>
                    {a.children.map((c) => (
                      <div key={c.id} className="pl-9">
                        {EVIDENCE_DOT[c.evidence_level]} {c.title}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </section>

      {/* 四档计数，跟筛选胶囊一一对应 */}
      <section className="mt-6">
        <h2 className="font-display text-[15px] font-semibold">证明度总览</h2>
        <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
          <span
            className="rounded-pill px-2.5 py-1"
            style={{ border: "1px solid var(--line)" }}
          >
            全部 {summary.total}
          </span>
          {EVIDENCE_ORDER.map((level) => (
            <span
              key={level}
              className="rounded-pill px-2.5 py-1"
              style={{ border: "1px solid var(--line)" }}
            >
              {EVIDENCE_DOT[level]} {EVIDENCE_LABEL[level]}{" "}
              {summary.counts[level]}
              <span className="ml-2" style={{ color: "var(--mute)" }}>
                {Math.round(summary.ratios[level] * 100)}%
              </span>
            </span>
          ))}
          <span
            className="rounded-pill px-2.5 py-1"
            style={{ background: "var(--proof-soft)", color: "var(--proof)" }}
          >
            证明环 {summary.score}%
          </span>
        </div>
      </section>

      <Block title="getProofSummary()" value={summary} />
      <Block title="getAtomTree()" value={tree} />
      <Block title={`getAtomDetail(${firstId ?? "—"})`} value={detail} />
      <Block title="getProfileFacts()" value={facts} />
    </div>
  );
}
