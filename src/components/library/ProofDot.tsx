import { EVIDENCE_LABEL } from "@/lib/domain";
import type { EvidenceLevel } from "@/types/database";

// 证明度四档标记。单一色相：实测实心 → 估算半实 → 仅设计空心 → 无证据灰虚线。
// 只作展示，任何地方都不做成可点的编辑入口。
export function ProofDot({
  level,
  size = 10,
  className = "",
}: {
  level: EvidenceLevel;
  size?: number;
  className?: string;
}) {
  const color = level === "absent" ? "var(--ghost)" : "var(--proof)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={EVIDENCE_LABEL[level]}
    >
      {level === "measured" ? (
        <circle cx="5" cy="5" r="4.25" fill={color} />
      ) : (
        <>
          <circle
            cx="5"
            cy="5"
            r="3.6"
            fill="none"
            stroke={color}
            strokeWidth="1.4"
            strokeDasharray={level === "absent" ? "1.6 1.6" : undefined}
          />
          {level === "estimated" && <path d="M5 1.4 A3.6 3.6 0 0 0 5 8.6 Z" fill={color} />}
        </>
      )}
    </svg>
  );
}
