"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { reorderAtoms } from "@/app/(app)/library/actions";
import { EVIDENCE_LABEL, EVIDENCE_ORDER } from "@/lib/domain";
import type { AtomGroup, AtomNode, AtomTree, ProofSummary } from "@/lib/queries/atoms";
import type { EvidenceLevel } from "@/types/database";
import { NewAtomButton } from "./NewAtomButton";
import { ProofDot } from "./ProofDot";

// 过滤后的一条：self 表示这条自己命中；父没命中但子命中时父仍要显示（灰化），
// 否则层级会断掉，看不出这个能力点属于谁。
type Row = { node: AtomNode; self: boolean; children: AtomNode[] };
type Filtered = { key: string; title: string; tense: AtomGroup["tense"]; period: string | null; rows: Row[] };

// 拖拽只在同一组同一父级之间成立。setKey 就是「同级」的身份。
type Drag = { id: string; setKey: string };

const EMPTY: ReadonlySet<string> = new Set();

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

  // 入库后带着 ?flash=<id列表> 回到经历库，证明度变了的节点绿闪一次。
  // 闪过就把参数从 URL 里抹掉，刷新页面不会再闪。
  const flashParam = searchParams.get("flash") ?? "";
  const [flashed, setFlashed] = useState<string>("");
  const flashing = flashParam !== "" && flashed !== flashParam
    ? new Set(flashParam.split(","))
    : EMPTY;
  if (flashParam !== "" && flashed !== flashParam) setFlashed(flashParam);

  const [optimistic, setOptimistic] = useState<string | null>(null);
  if (optimistic !== null && fromUrl === optimistic) setOptimistic(null);
  const selected = optimistic ?? fromUrl;

  const [levels, setLevels] = useState<Set<EvidenceLevel>>(new Set());
  const [q, setQ] = useState("");
  const [, startReorder] = useTransition();

  // 拖完先本地排好，等服务端把新顺序发回来再丢掉本地这份。
  const serverSig = useMemo(() => signature(tree.groups), [tree.groups]);
  const [moved, setMoved] = useState<{ sig: string; groups: AtomGroup[] } | null>(null);
  if (moved && moved.sig !== serverSig) setMoved(null);
  const source = moved?.groups ?? tree.groups;

  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const keyword = q.trim().toLowerCase();
  const filtering = levels.size > 0 || keyword.length > 0;

  const groups = useMemo<Filtered[]>(() => {
    const hit = (a: AtomNode) => {
      if (levels.size > 0 && !levels.has(a.evidence_level)) return false;
      if (!keyword) return true;
      return [a.title, a.org, a.role]
        .filter(Boolean)
        .some((t) => t!.toLowerCase().includes(keyword));
    };

    return source
      .map((g) => ({
        key: g.key,
        title: g.title,
        tense: g.tense,
        period: g.period,
        rows: g.atoms
          .map((node) => ({ node, self: hit(node), children: node.children.filter(hit) }))
          .filter((r) => r.self || r.children.length > 0),
      }))
      .filter((g) => g.rows.length > 0);
  }, [source, levels, keyword]);

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
    params.delete("edit");
    router.replace(`/library?${params.toString()}`, { scroll: false });
  }

  function drop(setKey: string, targetId: string) {
    const from = drag?.id;
    setDrag(null);
    setOver(null);
    if (!from || from === targetId || drag?.setKey !== setKey) return;

    const siblings = siblingIds(source, setKey);
    const at = siblings.indexOf(targetId);
    const cur = siblings.indexOf(from);
    if (at < 0 || cur < 0) return;

    const next = [...siblings];
    next.splice(cur, 1);
    next.splice(at, 0, from);

    setMoved({ sig: serverSig, groups: applyOrder(source, setKey, next) });
    startReorder(async () => {
      await reorderAtoms(next);
    });
  }

  const dragProps = (setKey: string, id: string) =>
    filtering
      ? {}
      : {
          draggable: true,
          onDragStart: () => setDrag({ id, setKey }),
          onDragEnd: () => {
            setDrag(null);
            setOver(null);
          },
          onDragOver: (e: React.DragEvent) => {
            if (drag?.setKey !== setKey || drag.id === id) return;
            e.preventDefault();
            setOver(id);
          },
          onDragLeave: () => setOver((v) => (v === id ? null : v)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            drop(setKey, id);
          },
        };

  return (
    <aside className="w-[268px] shrink-0">
      <div
        className="sticky top-[84px] flex max-h-[calc(100vh-112px)] flex-col rounded-card p-3"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <NewAtomButton label="＋ 新增经历" className="w-full" sortOrder={tree.total} />

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
            groups.map((group, gi) => (
              <div key={group.key} className="mb-2">
                {/* 过往经历不是一个分组，是一条分节线：下面这些是过去的雇主。
                    做成分组的话，左栏就得多一层缩进，而数据本身只有两层。 */}
                {group.tense === "past" && groups[gi - 1]?.tense !== "past" && (
                  <div className="flex items-center gap-2 px-1.5 pb-1.5 pt-1.5">
                    <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                    <span
                      className="text-[10.5px] font-medium"
                      style={{ letterSpacing: "0.06em", color: "var(--mute)" }}
                    >
                      过往经历
                    </span>
                    <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                  </div>
                )}
                <div
                  className="flex items-baseline gap-2 px-1.5 pb-1 text-[11px] font-medium"
                  style={{ letterSpacing: "0.04em", color: "var(--mute)" }}
                >
                  <span className="min-w-0 truncate">
                    <Mark text={group.title} q={keyword} />
                  </span>
                  {group.period && (
                    <span className="font-display ml-auto shrink-0 font-normal">
                      {group.period}
                    </span>
                  )}
                </div>
                {group.rows.map((row) => (
                  <div key={row.node.id}>
                    <TreeRow
                      node={row.node}
                      q={keyword}
                      dimmed={!row.self}
                      active={selected === row.node.id}
                      flash={flashing.has(row.node.id)}
                      dropping={over === row.node.id}
                      onPick={select}
                      {...dragProps(`group:${group.key}`, row.node.id)}
                    />
                    {row.children.map((child) => (
                      <TreeRow
                        key={child.id}
                        node={child}
                        q={keyword}
                        indented
                        active={selected === child.id}
                        flash={flashing.has(child.id)}
                        dropping={over === child.id}
                        onPick={select}
                        {...dragProps(`parent:${row.node.id}`, child.id)}
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
  dropping = false,
  flash = false,
  onPick,
  ...drag
}: {
  node: AtomNode;
  q: string;
  active: boolean;
  dimmed?: boolean;
  indented?: boolean;
  dropping?: boolean;
  flash?: boolean;
  onPick: (id: string) => void;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={() => onPick(node.id)}
      aria-current={active ? "true" : undefined}
      className={`flex h-8 w-full items-center gap-2 rounded-btn pr-2 text-left transition-colors hover:bg-[var(--line-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink${flash ? " proof-flash" : ""}`}
      style={{
        paddingLeft: indented ? 22 : 8,
        background: active ? "var(--line-soft)" : "transparent",
        opacity: dimmed ? 0.55 : 1,
        boxShadow: dropping ? "inset 0 2px 0 0 var(--ink)" : undefined,
      }}
      {...drag}
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

// ---- 排序辅助 ----

function signature(groups: AtomGroup[]): string {
  return groups
    .map((g) => `${g.key}:${g.atoms.map((a) => `${a.id}[${a.children.map((c) => c.id)}]`)}`)
    .join("|");
}

function siblingIds(groups: AtomGroup[], setKey: string): string[] {
  for (const g of groups) {
    if (setKey === `group:${g.key}`) return g.atoms.map((a) => a.id);
    for (const a of g.atoms) {
      if (setKey === `parent:${a.id}`) return a.children.map((c) => c.id);
    }
  }
  return [];
}

function applyOrder(groups: AtomGroup[], setKey: string, ids: string[]): AtomGroup[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const by = (a: { id: string }, b: { id: string }) =>
    (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);

  return groups.map((g) => {
    if (setKey === `group:${g.key}`) return { ...g, atoms: [...g.atoms].sort(by) };
    return {
      ...g,
      atoms: g.atoms.map((a) =>
        setKey === `parent:${a.id}` ? { ...a, children: [...a.children].sort(by) } : a,
      ),
    };
  });
}
