"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isGlobalPath } from "@/lib/nav";

export type TargetOption = { id: string; name: string };

const SELECT_CLASS = "h-8 rounded-btn px-2.5 text-[13px]";
const SELECT_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
} as const;

export function Topbar({
  blockingCount,
  scanned,
  targets,
}: {
  blockingCount: number;
  /** 一次都没扫过时不能说「一切正常」—— 那是撒谎。 */
  scanned: boolean;
  targets: TargetOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const global = isGlobalPath(pathname);

  // ?target= 认不出来（换了账号、方向删了）就退回第一个，跟 resolveTarget 同一套规则。
  const wanted = searchParams.get("target");
  const current = targets.find((t) => t.id === wanted) ?? targets[0] ?? null;

  function onChange(value: string) {
    if (value === "__new__") {
      router.push("/app/targets?new=1");
      return;
    }
    router.replace(`${pathname}?target=${value}`, { scroll: false });
  }

  return (
    <header
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 px-5"
      style={{
        height: 56,
        background: "var(--card)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {/* 方向选择器：全局页面置灰并显示「全局」。
          首页 / 经历库 / 导入 / 随手记 / 行动清单 / 体检都是全局视图——
          经历本身不属于任何方向，只有讲法属于。 */}
      {global ? (
        <select
          disabled
          value="__global__"
          aria-label="求职方向"
          className={SELECT_CLASS}
          style={{ ...SELECT_STYLE, opacity: 0.5 }}
        >
          <option value="__global__">全局</option>
        </select>
      ) : (
        <select
          value={current?.id ?? "__new__"}
          onChange={(e) => onChange(e.target.value)}
          aria-label="求职方向"
          className={`${SELECT_CLASS} focus:outline-2 focus:outline-offset-2 focus:outline-ink`}
          style={SELECT_STYLE}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="__new__">＋ 新建方向</option>
        </select>
      )}

      {/* 体检状态芯片：全部阻断级问题的条数，不只是事实层。点进去就能处理。 */}
      <Link
        href="/app/health"
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-medium transition-opacity hover:opacity-80"
        style={
          blockingCount > 0
            ? { background: "var(--danger-soft)", color: "var(--danger)" }
            : scanned
              ? { background: "var(--proof-soft)", color: "var(--proof)" }
              : { background: "var(--bg)", color: "var(--mute)" }
        }
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-pill"
          style={{
            background:
              blockingCount > 0 ? "var(--danger)" : scanned ? "var(--proof)" : "var(--mute)",
          }}
        />
        {blockingCount > 0 ? `${blockingCount} 处待解决` : scanned ? "一切正常" : "还没体检过"}
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
