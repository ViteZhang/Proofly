"use client";

// =============================================================
// Proofly · 全局搜索
//
// 索引由服务端一次性给全，过滤在前端做。经历库这个量级下，一次往返换
// 之后每次敲键零延迟，比每敲一个字发一次请求划算得多。
//
// 索引在打开面板时才拉：它挂在顶栏上，每翻一页都拉一次是纯浪费。
// =============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProofDot } from "@/components/library/ProofDot";
import { fetchSearchIndex } from "@/app/app/search-actions";
import { recent, search, type SearchGroup } from "@/lib/search/filter";
import { KIND_LABEL, type SearchItem } from "@/lib/search/types";

const RECENT_KEY = "proofly.search.recent";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // 隐私模式、清过站点数据、浏览器禁了存储 —— 都不该让搜索打不开
    return [];
  }
}

function pushRecent(id: string): void {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 存不下就算了，这只是个便利
  }
}

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchItem[] | null>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  // 打开时把输入清空、光标归零，都在这一个函数里做完。
  // 放 effect 里的话就是「渲染完再同步改状态」，React 会多跑一轮，
  // eslint 的 set-state-in-effect 也会拦。
  const openPalette = useCallback(() => {
    setQ("");
    setCursor(0);
    setOpen(true);
  }, []);

  // ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) return false;
          setQ("");
          setCursor(0);
          return true;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 索引在第一次打开时才拉。它挂在顶栏上，每翻一页拉一次是纯浪费。
  useEffect(() => {
    if (!open || index !== null) return;
    void fetchSearchIndex().then(setIndex);
  }, [open, index]);

  const groups: SearchGroup[] =
    index === null
      ? []
      : q.trim() === ""
        ? [{ kind: "atom", items: recent(index, readRecent()), more: 0 }]
        : search(index, q);

  const flat = groups.flatMap((g) => g.items);
  const active = flat[Math.min(cursor, Math.max(0, flat.length - 1))] ?? null;

  const go = useCallback(
    (item: SearchItem) => {
      pushRecent(item.id);
      setOpen(false);
      router.push(item.route);
    },
    [router],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (flat.length === 0 ? 0 : (c + 1) % flat.length));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (flat.length === 0 ? 0 : (c - 1 + flat.length) % flat.length));
      }
      if (e.key === "Enter" && active) {
        e.preventDefault();
        go(active);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, flat.length, active, go]);

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex h-8 min-w-0 items-center gap-2 rounded-btn px-3 text-[13px] transition-colors hover:border-[var(--slate)]"
        style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--mute)" }}
      >
        <span className="truncate">搜经历、学历、技能、行动</span>
        <kbd
          className="font-display rounded px-1 text-[11px]"
          style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--slate)" }}
        >
          ⌘K
        </kbd>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(12,14,20,0.34)" }}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="搜索"
            className="fixed left-1/2 top-[14vh] z-50 w-[min(580px,92vw)] -translate-x-1/2 overflow-hidden rounded-card"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: "1px solid var(--line-soft)" }}
            >
              <span aria-hidden style={{ color: "var(--mute)" }}>
                ⌕
              </span>
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(0);
                }}
                placeholder="搜经历、学历、技能、行动"
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
              />
              <kbd
                className="font-display rounded px-1.5 text-[11px]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--mute)" }}
              >
                esc
              </kbd>
            </div>

            <div className="max-h-[min(430px,58vh)] overflow-y-auto p-1.5">
              {index === null && (
                <p className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--mute)" }}>
                  正在取…
                </p>
              )}

              {index !== null && flat.length === 0 && (
                <p
                  className="px-4 py-8 text-center text-[13px] leading-relaxed"
                  style={{ color: "var(--mute)" }}
                >
                  没找到。换个词，
                  <br />
                  或者去经历库看看
                </p>
              )}

              {groups.map((g) => (
                <div key={g.kind}>
                  <div
                    className="px-3 pb-1 pt-2.5 text-[10px] font-semibold"
                    style={{ letterSpacing: "0.1em", color: "var(--mute)" }}
                  >
                    {q.trim() === "" ? "最近访问" : KIND_LABEL[g.kind]}
                  </div>
                  {g.items.map((item) => {
                    const on = item === active;
                    return (
                      <button
                        key={`${item.kind}-${item.id}`}
                        type="button"
                        onMouseEnter={() => setCursor(flat.indexOf(item))}
                        onClick={() => go(item)}
                        className="flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-left text-[13.5px]"
                        style={{ background: on ? "var(--bg)" : "transparent" }}
                      >
                        {item.proof ? (
                          <ProofDot level={item.proof} size={9} />
                        ) : (
                          <span aria-hidden className="w-[9px] shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        <span className="shrink-0 text-[11.5px]" style={{ color: "var(--mute)" }}>
                          {item.subtitle}
                        </span>
                      </button>
                    );
                  })}
                  {g.more > 0 && (
                    <div className="px-3 pb-1 text-[11.5px]" style={{ color: "var(--mute)" }}>
                      还有 {g.more} 条，把词写具体一点
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div
              className="flex gap-3.5 px-4 py-2.5 text-[11.5px]"
              style={{ borderTop: "1px solid var(--line-soft)", color: "var(--mute)" }}
            >
              <span>↑↓ 选择</span>
              <span>↵ 打开</span>
              <span>esc 关闭</span>
              <span className="ml-auto">本期是关键词过滤，不做语义搜索</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
