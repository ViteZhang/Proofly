"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number; amber?: boolean };
type Group = { title: string; items: Item[] };

export function AdminNav({ groups, email }: { groups: Group[]; email: string }) {
  const path = usePathname();

  return (
    <aside
      className="flex w-[206px] flex-none flex-col overflow-y-auto px-3 py-[18px]"
      style={{ background: "var(--ink)" }}
    >
      <div className="px-2.5 pb-[3px] font-display text-[18px] font-bold tracking-tight text-white">
        Proofly
      </div>
      <div className="px-2.5 pb-[18px] text-[10.5px]" style={{ color: "rgba(255,255,255,.42)" }}>
        兑换码管理
      </div>

      {groups.map((g) => (
        <div key={g.title}>
          <div
            className="px-2.5 pt-3.5 pb-1.5 text-[10px] font-medium tracking-[.1em]"
            style={{ color: "rgba(255,255,255,.3)" }}
          >
            {g.title}
          </div>
          {g.items.map((it) => {
            // 概览是 /admin，任何子路径都会以它开头，所以它只能精确匹配。
            const on = it.href === "/admin" ? path === it.href : path.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className="relative flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-[13.5px] transition-colors"
                style={{
                  color: on ? "#fff" : "rgba(255,255,255,.66)",
                  background: on ? "rgba(255,255,255,.12)" : "transparent",
                  fontWeight: on ? 500 : 400,
                }}
              >
                {on && (
                  <span
                    aria-hidden
                    className="absolute top-2 bottom-2 left-0 w-[3px] rounded-sm bg-white"
                  />
                )}
                <span className="flex-1">{it.label}</span>
                {it.badge !== undefined && it.badge > 0 && (
                  <span
                    className="rounded-pill px-[7px] py-px font-display text-[10.5px]"
                    style={
                      it.amber
                        ? { background: "var(--warn-soft)", color: "var(--caution)" }
                        : { background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.75)" }
                    }
                  >
                    {it.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div
        className="mt-auto flex items-center gap-2.5 pt-3.5"
        style={{ borderTop: "1px solid rgba(255,255,255,.09)" }}
      >
        <div
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,var(--proof),#0AA8A0)" }}
        >
          {(email[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 text-[12.5px] leading-tight text-white">
          <span
            className="block truncate text-[10.5px]"
            style={{ color: "rgba(255,255,255,.42)" }}
          >
            {email}
          </span>
        </div>
      </div>
    </aside>
  );
}
