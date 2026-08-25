"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EVIDENCE_LABEL, EVIDENCE_ORDER } from "@/lib/domain";
import type { AtomNode, AtomTree, ProofSummary } from "@/lib/queries/atoms";
import type { EvidenceLevel } from "@/types/database";
import { ProofDot } from "./ProofDot";

// 过滤后的一条：self 表示这条自己命中；父没命中但子命中时父仍要显示（灰化），
// 否则层级会断掉，看不出这个能力点属于谁。
type Row = { node: AtomNode; self: boolean; children: AtomNode[] };
type Group = { key: string; title: string; rows: Row[] };

export function LibraryTree({
  tree,
  summary,
}: {
  tree: AtomTree;
  summary: ProofSummary;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 选中要立刻有反馈。URL 是唯一真相，但换 URL 要走一次服务端往返（详情是服务端渲染的），
  // 中间这半秒先用本地值顶上；URL 追上来之后就地丢弃，交回给 URL。
  const fromUrl = searchParams.get("atom");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  if (optimistic !== null && fromUrl === optimistic) setOptimistic(null);
  const selected = optimistic ?? fromUrl;

  const [levels, setLevels] = useState<Set<EvidenceLevel>>(new Set());
  const [q, setQ] = useState("");

  const keyword = q.trim().toLowerCase();

  const groups = useMemo<Group[]>(() => {
    const hit = (a: AtomNode) => {
      const levelOk = levels.size === 0 || levels.has(a.evidence_level);
      if (!levelOk) return false;
      if (!keyword) return true;
      return [a.title, a.org, a.role]
        .filter(Boolean)
        .some((t) => t!.toLowerCase().includes(keyword));
    };

    return tree.groups
      .map((g) => ({
        key: g.key,
        title: g.title,
        rows: g.atoms
          .map((node) => ({ node, self: hit(node), children: node.children.filter(hit) }))
          .filter((r) => r.self || r.children.length > 0),
      }))
      .filter((g) => g.rows.length > 0);
  }, [tree, levels, keyword]);

  function toggleLevel(level: EvidenceLevel) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  // 选中写进 URL，刷新后还在，链接也能直接分享到某一条。
  function select(id: string) {
    setOptimistic(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("atom", id);
    router.replace(`/library?${params.toString()}`, { scroll: false });
  }

  const filtering = levels.size > 0 || keyword.length > 0;

  return (
    <aside className="w-[268px] shrink-0">
      <div
        className="sticky top-[84px] flex max-h-[calc(100vh-112px)] flex-col rounded-card p-3"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <Button variant="secondary" size="sm" className="w-full" disabled title="切片 1.4 接上">
          ＋ 新增经历
        </Button>

        {/* 证明度筛选：多选，再点一次取消 */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setLevels(new Set())}
            aria-pressed={levels.size === 0}
            className="rounded-pill px-2 py-[3px] text-[11.5px] transition-colors"
            style={
              levels.size === 0
                ? { background: "var(--ink)", color: "#fff" }
                : { border: "1px solid var(--line)", color: "var(--slate)" }
            }
          >
            全部 {summary.total}
          </button>
          {EVIDENCE_ORDER.map((level) => {
            const on = levels.has(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                aria-pressed={on}
                title={EVIDENCE_LABEL[level]}
                className="inline-flex items-center gap-1 rounded-pill px-2 py-[3px] text-[11.5px] transition-colors"
                style={
                  on
                    ? { background: "var(--ink)", color: "#fff" }
                    : { border: "1px solid var(--line)", color: "var(--slate)" }
                }
              >
                <ProofDot level={level} size={8} />
                {summary.counts[level]}
              </button>
            );
          })}
        </div>

        {/* 本地搜索，不查库 */}
        <div className="relative mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜经历、组织、角色"
            aria-label="搜索经历"
            className="h-8 w-full rounded-btn pl-2.5 pr-7 text-[13px] outline-none"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="清空搜索"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-pill px-1 text-[13px]"
              style={{ color: "var(--mute)" }}
            >
              ×
            </button>
          )}
        </div>

        <div className="my-2.5 h-px shrink-0" style={{ background: "var(--line-soft)" }} />

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {groups.length === 0 ? (
            <p className="px-1 py-2 text-[12.5px]" style={{ color: "var(--slate)" }}>
              没有对得上的经历。换个词，或者把筛选去掉。
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="mb-2">
                <div
                  className="px-1.5 pb-1 text-[11px] font-medium"
                  style={{ letterSpacing: "0.04em", color: "var(--mute)" }}
                >
                  <Mark text={group.title} q={keyword} />
                </div>
                {group.rows.map((row) => (
                  <div key={row.node.id}>
                    <TreeRow
                      node={row.node}
                      q={keyword}
                      dimmed={!row.self}
                      active={selected === row.node.id}
                      onSelect={select}
                    />
                    {row.children.map((child) => (
                      <TreeRow
                        key={child.id}
                        node={child}
                        q={keyword}
                        indented
                        active={selected === child.id}
                        onSelect={select}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {filtering && (
          <button
            type="button"
            onClick={() => {
              setLevels(new Set());
              setQ("");
            }}
            className="mt-1.5 shrink-0 text-left text-[12px]"
            style={{ color: "var(--slate)" }}
          >
            清掉筛选，看全部 {tree.total} 条
          </button>
        )}
      </div>
    </aside>
  );
}

function TreeRow({
  node,
  q,
  active,
  dimmed = false,
  indented = false,
  onSelect,
}: {
  node: AtomNode;
  q: string;
  active: boolean;
  dimmed?: boolean;
  indented?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-current={active ? "true" : undefined}
      className="flex h-8 w-full items-center gap-2 rounded-btn pr-2 text-left transition-colors hover:bg-[var(--line-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      style={{
        paddingLeft: indented ? 22 : 8,
        background: active ? "var(--line-soft)" : "transparent",
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <ProofDot level={node.evidence_level} />
      <span
        className="min-w-0 flex-1 truncate text-[13px]"
        style={{ color: "var(--ink)", fontWeight: active ? 500 : 400 }}
      >
        <Mark text={node.title} q={q} />
      </span>
      {node.childCount > 0 && (
        <span className="shrink-0 text-[11.5px]" style={{ color: "var(--mute)" }}>
          {node.childCount}
        </span>
      )}
    </button>
  );
}

// 命中片段高亮。q 已经小写化。
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;

  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let at = 0;

  for (;;) {
    const found = lower.indexOf(q, at);
    if (found === -1) break;
    if (found > at) parts.push(text.slice(at, found));
    parts.push(
      <mark
        key={found}
        className="rounded-[3px] px-[1px]"
        style={{ background: "var(--proof-soft)", color: "inherit" }}
      >
        {text.slice(found, found + q.length)}
      </mark>,
    );
    at = found + q.length;
  }

  if (at === 0) return <>{text}</>;
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
