"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 滚到视野里再淡入。
 *
 * 初始态写在 CSS 的 .rev 上（opacity:0），所以必须保证「看不见」这件事
 * 一定会被解除：没有 IntersectionObserver、或者用户要求减少动效时，
 * 直接加 in。宁可不要动效，也不能有一块永远看不见的内容。
 */
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -70px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="rev">
      {children}
    </div>
  );
}
