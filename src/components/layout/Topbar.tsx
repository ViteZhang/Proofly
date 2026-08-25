"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isGlobalPath } from "@/lib/nav";

export function Topbar({ blockingCount }: { blockingCount: number }) {
  const pathname = usePathname();
  const global = isGlobalPath(pathname);

  return (
    <header
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 px-5"
      style={{
        height: 56,
        background: "var(--card)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {/* 方向选择器：全局页面置灰并显示「全局」 */}
      {global ? (
        <select
          disabled
          value="__global__"
          aria-label="求职方向"
          className="h-8 rounded-btn px-2.5 text-[13px]"
          style={{
            opacity: 0.5,
            background: "var(--card)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
        >
          <option value="__global__">全局</option>
        </select>
      ) : (
        <select
          defaultValue="c-ai"
          aria-label="求职方向"
          className="h-8 rounded-btn px-2.5 text-[13px] focus:outline-2 focus:outline-offset-2 focus:outline-ink"
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
        >
          <option value="c-ai">C 端 AI 应用</option>
          <option value="agent">AI Agent 平台</option>
          <option value="__new__">＋ 新建方向</option>
        </select>
      )}

      {/* 体检状态芯片：事实层里 BLOCKING 的条数。点进去就能处理。 */}
      <Link
        href="/facts"
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-medium transition-opacity hover:opacity-80"
        style={
          blockingCount > 0
            ? { background: "var(--danger-soft)", color: "var(--danger)" }
            : { background: "var(--proof-soft)", color: "var(--proof)" }
        }
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-pill"
          style={{ background: blockingCount > 0 ? "var(--danger)" : "var(--proof)" }}
        />
        {blockingCount > 0 ? `${blockingCount} 处待解决` : "一切正常"}
      </Link>

      {/* 全局搜索占位：显示 ⌘K，本步不实现 */}
      <div
        className="ml-auto flex h-8 min-w-0 items-center gap-2 rounded-btn px-3 text-[13px]"
        style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--mute)" }}
      >
        <span className="truncate">搜索经历、技能、任务</span>
        <kbd
          className="font-display rounded px-1 text-[11px]"
          style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--slate)" }}
        >
          ⌘K
        </kbd>
      </div>
    </header>
  );
}
