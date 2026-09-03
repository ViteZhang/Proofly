"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav";
import { LogoWordmark } from "@/components/layout/Logo";
import { createClient } from "@/lib/supabase/client";

export function Sidebar({
  email,
  todoCount = 0,
}: {
  email: string;
  /** 行动清单的待办数。0 时不显示徽标 —— 一个「0」比没有徽标更吵。 */
  todoCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const name = email.split("@")[0] || email;
  const initial = (name[0] ?? "?").toUpperCase();

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="sticky top-0 flex h-screen w-[210px] shrink-0 flex-col"
      style={{ background: "var(--ink)", color: "rgba(255,255,255,0.72)" }}
    >
      {/* Logo + slogan。字标点回官网 —— 侧栏里每一项都是产品内的页面，
          只有这里是出口。想看定价、常见问题、把链接发给别人，都从这走。 */}
      <div className="px-4 pb-4 pt-5">
        <Link
          href="/"
          aria-label="回到 Proofly 官网首页"
          className="inline-flex transition-opacity hover:opacity-75"
        >
          <LogoWordmark tone="white" height={22} priority />
        </Link>

        <div className="mt-1 text-[11.5px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          让你的经历真正产生价值
        </div>
      </div>

      {/* 导航三组 */}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title} className={gi === 0 ? "" : "mt-3 pt-3"}>
            <div
              className="px-2.5 pb-1.5 text-[10.5px] font-medium"
              style={{ letterSpacing: "0.06em", color: "rgba(255,255,255,0.38)" }}
            >
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex h-9 items-center rounded-pill px-2.5 text-[13px] transition-colors"
                  style={{
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,0.72)",
                  }}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-pill bg-white"
                    />
                  )}
                  {item.label}
                  {item.href === "/app/actions" && todoCount > 0 && (
                    <span
                      className="ml-auto rounded-pill px-1.5 text-[11px]"
                      style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}
                    >
                      {todoCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 底部用户区 */}
      <div className="relative border-t px-2.5 py-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {menuOpen && (
          <div
            className="absolute bottom-[calc(100%-4px)] left-2.5 right-2.5 overflow-hidden rounded-btn"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
          >
            <Link
              href="/app/facts"
              onClick={() => setMenuOpen(false)}
              className="block px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--line-soft)]"
              style={{ color: "var(--ink)" }}
            >
              事实层
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="block w-full px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--line-soft)] disabled:opacity-50"
              style={{ color: "var(--ink)" }}
            >
              退出登录
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-btn px-1.5 py-1.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        >
          <span
            className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--proof), var(--proof-mid))" }}
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">
              {name}
            </span>
            <span className="block truncate text-[11.5px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              常驻地未设置
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
