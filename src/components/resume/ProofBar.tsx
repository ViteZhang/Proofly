import type { EvidenceLevel } from "@/types/database";

// 迷你 ProofBar：一眼看出这份简历有多「实」。
// 按块的证明度构成着色，不是按块数平均 —— 一块占多宽就是它在这份
// 简历里占多少篇幅，这样它才跟阅读感受对得上。
const COLOR: Record<EvidenceLevel, string> = {
  measured: "var(--proof)",
  estimated: "var(--proof-mid)",
  designed_only: "var(--proof-soft)",
  absent: "var(--ghost)",
};

const LABEL: Record<EvidenceLevel, string> = {
  measured: "实测",
  estimated: "估算",
  designed_only: "仅设计",
  absent: "无证据",
};

export function ProofBar({
  blocks,
}: {
  blocks: { evidenceLevel: EvidenceLevel; weight: number }[];
}) {
  const total = blocks.reduce((n, b) => n + Math.max(b.weight, 1), 0);
  if (total === 0) return null;

  const counts = new Map<EvidenceLevel, number>();
  for (const b of blocks) {
    counts.set(b.evidenceLevel, (counts.get(b.evidenceLevel) ?? 0) + Math.max(b.weight, 1));
  }
  const summary = [...counts.entries()]
    .map(([lv, n]) => `${LABEL[lv]} ${Math.round((n / total) * 100)}%`)
    .join(" · ");

  return (
    <div
      className="flex overflow-hidden rounded-pill"
      style={{ height: 6 }}
      role="img"
      aria-label={`证明度构成：${summary}`}
      title={summary}
    >
      {blocks.map((b, i) => (
        <span
          key={i}
          style={{
            width: `${(Math.max(b.weight, 1) / total) * 100}%`,
            background: COLOR[b.evidenceLevel],
          }}
        />
      ))}
    </div>
  );
}
