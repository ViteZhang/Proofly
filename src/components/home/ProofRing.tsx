"use client";

import { useEffect, useRef } from "react";

const R = 52;
const C = 2 * Math.PI * R;
const PLAYED = "proofly:ring-played";

/**
 * 证明度环。首次进入本会话时从 0 描到目标值，之后直接是终态——
 * 每次切回首页都重播一遍会很吵。
 *
 * 终值写在 stroke-dashoffset 上，动画只提供起点：不加动画类时渲染的
 * 就是正确的终态，服务端与客户端也就不会对不上。
 */
export function ProofRing({ score }: { score: number }) {
  const ref = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let played = false;
    try {
      played = sessionStorage.getItem(PLAYED) === "1";
      sessionStorage.setItem(PLAYED, "1");
    } catch {
      // 隐私模式下读写都可能抛，那就当没播过
    }
    if (!played) ref.current?.classList.add("ring-draw");
  }, []);

  const offset = C * (1 - Math.min(Math.max(score, 0), 100) / 100);

  return (
    <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden>
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          ref={ref}
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="var(--proof)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 66 66)"
          style={{ ["--ring-c" as string]: `${C}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[30px] font-semibold leading-none tracking-tight">
          {score}%
        </span>
        <span className="mt-1 text-[11.5px]" style={{ color: "var(--mute)" }}>
          证明度
        </span>
      </div>
    </div>
  );
}
