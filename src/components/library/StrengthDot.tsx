import type { EvidenceStrength } from "@/types/database";

// 技能证据强度：强实心 · 弱空心 · 无灰。派生字段，只展示。
export function StrengthDot({ strength, size = 8 }: { strength: EvidenceStrength; size?: number }) {
  const color = strength === "none" ? "var(--ghost)" : "var(--proof)";
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="shrink-0">
      {strength === "strong" ? (
        <circle cx="5" cy="5" r="4.25" fill={color} />
      ) : (
        <circle cx="5" cy="5" r="3.6" fill="none" stroke={color} strokeWidth="1.4" />
      )}
    </svg>
  );
}
