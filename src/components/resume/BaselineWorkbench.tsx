"use client";

// =============================================================
// Proofly · 基线工作台（S8-A）
//
// 左边是简历本身，右边是「为什么是这样」。右边那一半才是这个产品
// 跟一个简历生成器的区别：每一句话都能查到出处，每一条没出现的经历
// 都说得出是被哪条规则筛掉的。
//
// 生成过程分两段真实的步骤：选材（代码，瞬时）→ 渲染（模型，十几秒）。
// 选材结果先出来，等待期间用户至少知道这份简历会由哪几条经历构成。
// =============================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ResumePaper } from "./ResumePaper";
import { InspectPanel } from "./InspectPanel";
import { RENDER_WEIGHT_LABEL } from "@/lib/targets/strategy";
import {
  generateBaseline,
  prepareBaseline,
  type SelectionPreview,
} from "@/app/(app)/resume/baseline-actions";
import {
  lockBaseline,
  reorderBlocks,
  unlockBaseline,
} from "@/app/(app)/resume/block-actions";
import type { GateResult } from "@/lib/resume/gate";
import type { BaselineView } from "@/lib/queries/resume";

type Phase = "idle" | "selecting" | "rendering" | "blocked";

const REVEAL_MS = 90;

export function BaselineWorkbench({
  targetId,
  targetName,
  baseline,
}: {
  targetId: string;
  targetName: string;
  baseline: BaselineView | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<SelectionPreview | null>(null);
  const [blocked, setBlocked] = useState<GateResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ blockId: string; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<"lock" | "unlock" | null>(null);
  const [, start] = useTransition();

  const blocks = baseline?.blocks ?? [];
  const locked = !!baseline?.lockedAt;
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (!fresh) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= blocks.length) clearInterval(timer);
    }, REVEAL_MS);
    return () => clearInterval(timer);
  }, [fresh, blocks.length]);
  // 不是新生成的（刷新、切方向）就整份直接显示，逐条露出只发生在刚生成完那一次。
  const shown = fresh ? revealed : blocks.length;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    // 不监听 scroll：右键之前浏览器会把元素滚进视野，那个 scroll 会在
    // 菜单刚渲染出来的下一帧把它关掉，看起来就是「右键没反应」。
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function run() {
    setError(null);
    setBlocked([]);
    setFresh(false);
    setRevealed(0);
    start(async () => {
      setPhase("selecting");
      const p = await prepareBaseline(targetId);
      if (!p.ok) {
        setError(p.error);
        setPhase("idle");
        return;
      }
      setPreview(p.data);

      setPhase("rendering");
      const r = await generateBaseline(targetId);
      if (!r.ok) {
        setError(r.error);
        setPhase("idle");
        return;
      }
      if (r.data.status === "blocked") {
        setBlocked(r.data.results.filter((x) => x.level === "blocking"));
        setPhase("blocked");
        return;
      }
      setFresh(true);
      setPhase("idle");
      router.refresh();
    });
  }

  function move(blockId: string, delta: number) {
    if (!baseline) return;
    const ids = blocks.map((b) => b.id);
    const from = ids.indexOf(blockId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setError(null);
    start(async () => {
      const r = await reorderBlocks(baseline.id, ids);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  function drop(fromId: string, toId: string) {
    if (!baseline || fromId === toId) return;
    const ids = blocks.map((b) => b.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    start(async () => {
      const r = await reorderBlocks(baseline.id, ids);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  function toggleLock() {
    if (!baseline) return;
    setError(null);
    setConfirm(null);
    start(async () => {
      const r = locked ? await unlockBaseline(baseline.id) : await lockBaseline(baseline.id);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  const busy = phase === "selecting" || phase === "rendering";

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={run} disabled={busy || locked}>
          {blocks.length > 0 ? "重新生成" : "生成基线"}
        </Button>
        {blocks.length > 0 && (
          <Button size="sm" onClick={() => setConfirm(locked ? "unlock" : "lock")} disabled={busy}>
            {locked ? "解锁修改" : "锁定基线"}
          </Button>
        )}
        {blocks.length > 0 &&
          (baseline && baseline.checks.some((c) => c.level === "blocking") ? (
            <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
              ⚠ 有 {baseline.checks.filter((c) => c.level === "blocking").length} 处问题必须先解决
              <Link href="/resume/issues" className="underline" style={{ color: "var(--ink)" }}>
                去看看
              </Link>
            </span>
          ) : (
            baseline && (
              <>
                <a
                  href={`/resume/${baseline.id}/export`}
                  className="text-[12.5px] hover:underline"
                  style={{ color: "var(--mute)" }}
                >
                  导出 MD
                </a>
                <a
                  href={`/resume/${baseline.id}/print`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12.5px] hover:underline"
                  style={{ color: "var(--mute)" }}
                >
                  导出 PDF
                </a>
              </>
            )
          ))}
        {baseline?.generatedAt && !busy && (
          <span className="text-[12px]" style={{ color: "var(--ghost)" }}>
            {new Date(baseline.generatedAt).toLocaleString("zh-CN")} 生成
            {locked && baseline.lockedAt
              ? ` · ${new Date(baseline.lockedAt).toLocaleDateString("zh-CN")} 锁定`
              : ""}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {blocks.length > 0 && !locked && (
        <div
          className="mt-3 max-w-[720px] rounded-card px-4 py-3"
          style={{ background: "var(--caution-soft)", border: "1px solid var(--caution)" }}
        >
          <p className="text-[13px] font-semibold">基线还没锁定</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
            锁定之后，每份 JD 只生成差异部分，措辞就不会飘了。先通读一遍，改到满意再锁。
          </p>
        </div>
      )}

      {busy && <Progress phase={phase} preview={preview} />}

      {phase === "blocked" && <Blocked results={blocked} onRetry={run} />}

      {blocks.length === 0 && !busy && phase !== "blocked" && (
        <p
          className="mt-4 max-w-[52ch] rounded-card px-5 py-4 text-[13.5px] leading-relaxed"
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            color: "var(--slate)",
          }}
        >
          「{targetName}」还没有基线。生成之前先确认两件事：这个方向下的经历策略配好了
          （谁展开、谁一行、谁不出现），互斥组也定了。选材是按那份配置来的。
        </p>
      )}

      <div className="mt-4 flex gap-6">
        {blocks.length > 0 && (
          <ResumePaper
            headline={baseline?.headline ?? ""}
            blocks={blocks}
            skills={baseline?.skills ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            draggable={!locked}
            reveal={shown}
            onMenu={(id, x, y) => {
              if (locked) return;
              setSelectedId(id);
              setMenu({ blockId: id, x, y });
            }}
            onDrop={(fromId, toId) => drop(fromId, toId)}
          />
        )}

        <aside className="w-[300px] shrink-0">
          <InspectPanel
            baseline={baseline}
            preview={preview}
            block={selected}
            locked={locked}
            onMove={(d) => selected && move(selected.id, d)}
            canMoveUp={!!selected && blocks[0]?.id !== selected.id}
            canMoveDown={!!selected && blocks[blocks.length - 1]?.id !== selected.id}
          />
        </aside>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          blockId={menu.blockId}
          onDone={() => {
            setMenu(null);
            router.refresh();
          }}
          onError={(e) => {
            setMenu(null);
            setError(e);
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          mode={confirm}
          draftCount={baseline?.draftCount ?? 0}
          onCancel={() => setConfirm(null)}
          onConfirm={toggleLock}
        />
      )}
    </div>
  );
}

function Progress({ phase, preview }: { phase: Phase; preview: SelectionPreview | null }) {
  return (
    <div
      className="mt-4 max-w-[720px] rounded-card px-4 py-3 text-[13px]"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <p>{phase === "selecting" ? "正在按方向策略选材…" : "正在渲染正文…"}</p>
      {preview && (
        <>
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
            选中 {preview.atoms.length} 条经历，{preview.tradeoffs.length} 条落选，技能栏
            {preview.skills.length} 个标签。
          </p>
          <ul className="mt-2 space-y-1">
            {preview.atoms.map((a) => (
              <li key={a.id} className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                {a.title}
                <span className="ml-1.5" style={{ color: "var(--ghost)" }}>
                  {RENDER_WEIGHT_LABEL[a.renderWeight]}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px]" style={{ color: "var(--mute)" }}>
            渲染是一次 strong 档调用，通常十几秒。写入前还要过一遍门禁。
          </p>
        </>
      )}
    </div>
  );
}

function Blocked({ results, onRetry }: { results: GateResult[]; onRetry: () => void }) {
  return (
    <div
      className="mt-4 max-w-[720px] rounded-card px-4 py-3"
      style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)" }}
    >
      <p className="text-[13.5px] font-medium">
        这一版没过门禁，{results.length} 处必须先解决，没有写入。
      </p>
      <ul className="mt-2 space-y-1.5">
        {results.map((r, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed">
            <span
              className="mr-1.5 rounded-pill px-1.5 py-0.5 text-[11px]"
              style={{ background: "var(--card)", color: "var(--danger)" }}
            >
              {r.code}
            </span>
            {r.message}
            <span className="ml-1" style={{ color: "var(--slate)" }}>
              {r.detail}
            </span>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
        带着这些问题重试一次
      </Button>
    </div>
  );
}

function ContextMenu({
  x,
  y,
  blockId,
  onDone,
  onError,
}: {
  x: number;
  y: number;
  blockId: string;
  onDone: () => void;
  onError: (e: string) => void;
}) {
  const [busy, start] = useTransition();

  function apply(weight: "one_line" | "omit") {
    start(async () => {
      const { setBlockWeight } = await import("@/app/(app)/resume/block-actions");
      const r = await setBlockWeight(blockId, weight);
      if (!r.ok) onError(r.error);
      else onDone();
    });
  }

  return (
    <div
      className="fixed z-50 rounded-card py-1"
      style={{
        left: x,
        top: y,
        background: "var(--card)",
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-2)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <MenuItem disabled={busy} onClick={() => apply("one_line")}>
        压缩为一行
      </MenuItem>
      <MenuItem disabled={busy} onClick={() => apply("omit")}>
        省略
      </MenuItem>
      <p className="px-3 pt-1 text-[11px]" style={{ color: "var(--ghost)", maxWidth: 180 }}>
        改的是这个方向的展开权重，不只是这一块的显示方式。
      </p>
    </div>
  );
}

function MenuItem({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-line-soft disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ConfirmDialog({
  mode,
  draftCount,
  onCancel,
  onConfirm,
}: {
  mode: "lock" | "unlock";
  draftCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "lock" ? "锁定基线" : "解锁修改"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <h2 className="text-[15.5px] font-semibold">
          {mode === "lock" ? "锁定这份基线？" : "解锁修改？"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
          {mode === "lock"
            ? "锁定后，投递版本只会生成差异部分。你随时可以解锁重改，已投递的版本不受影响。"
            : draftCount > 0
              ? `有 ${draftCount} 份草稿版本，解锁后它们的差异会重新计算。已投递的版本不受影响。`
              : "解锁之后可以继续改措辞。已投递的版本不受影响。"}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Button size="sm" onClick={onConfirm}>
            {mode === "lock" ? "锁定" : "解锁"}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="text-[12.5px] hover:underline"
            style={{ color: "var(--mute)" }}
          >
            再想想
          </button>
        </div>
      </div>
    </div>
  );
}
