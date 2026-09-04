"use client";

import { useEffect, useRef, useState } from "react";
import { rescan } from "@/app/app/health/actions";

/**
 * 进体检页自动跑一次快扫（§五-8.6 自动扫描时机）。
 *
 * 为什么不在页面渲染时直接扫：外壳（顶栏芯片）先于页面渲染，页面扫完
 * 写库的时候芯片已经画完了 —— 结果是页面说 9 处、芯片说 8 处，用户不知道
 * 该信哪个。挪到进页面之后触发，扫完连页面带外壳一起 revalidate，两处就
 * 永远是同一个数。
 *
 * 代价是首屏显示的是上一次的结果，扫完再跳到新的。这个代价是对的：
 * 一个正在更新的数，好过两个对不上的数。
 */
export function ScanOnArrival() {
  const done = useRef(false);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void rescan().finally(() => setScanning(false));
  }, []);

  if (!scanning) return null;
  return (
    <span className="ml-2 text-[12px]" style={{ color: "var(--mute)" }}>
      正在重新扫描…
    </span>
  );
}
