"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { generatePlan } from "@/app/app/actions/plan-actions";
import { dismissGap, dropTask, pinTask } from "@/app/app/actions/task-actions";
import {
  EMPTY_TASK,
  TaskFormDialog,
  type AnchorOption,
  type GapOption,
  type TaskDraft,
} from "./TaskFormDialog";
import { GAP_COPY } from "@/lib/scoring/gap-copy";
import { ReflowPanel } from "./ReflowPanel";
import { reopenTask } from "@/app/app/actions/reflow-actions";
import { ACTION_COPY, EMPTY_COPY, SORT_LABEL } from "@/lib/planning/labels";
import { IMPACT_IS_ESTIMATED_NOTE } from "@/lib/planning/config";
import { sortTasks, type SortMode } from "@/lib/planning/sort";
import type { TaskBoard, TaskView } from "@/lib/queries/tasks";

// S7。全局任务池：不随方向切换，方向选择器在这一页是灰的（见 lib/nav.ts）。
export function ActionsView({
  board,
  gaps,
  anchors,
}: {
  board: TaskBoard;
  gaps: GapOption[];
  anchors: AnchorOption[];
}) {
  const router = useRouter();
  // 从首页或 Step 4 的逐条对照跳过来时带着 ?task=，那条要展开并高亮。
  const highlight = useSearchParams().get("task");
  const [mode, setMode] = useState<SortMode>("priority");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | null>(null);

  function regenerate() {
    setError(null);
    setNote(null);
    start(async () => {
      const r = await generatePlan();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNote(
        r.data.gapsIn === 0
          ? "现在没有待处理的缺口，没什么可生成的。"
          : `新增 ${r.data.created} 条，更新 ${r.data.updated} 条。`,
      );
      router.refresh();
    });
  }

  const sorted = sortTasks(
    board.open.map((t) => ({
      ...t,
      actionType: t.actionType as string,
    })),
    mode,
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">行动清单</h1>
          <p className="mt-1.5 flex items-center gap-2 text-[14px]" style={{ color: "var(--slate)" }}>
            <span
              className="rounded-pill px-2 py-0.5 text-[11.5px]"
              style={{ background: "var(--line-soft)", color: "var(--slate)" }}
            >
              全局 · 所有方向共用
            </span>
            不随顶栏方向切换
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDraft(EMPTY_TASK)}>
            ＋ 手动添加
          </Button>
          <Button variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
            {busy ? "生成中…" : "重新生成"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {note && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--slate)" }}>
          {note}
        </p>
      )}

      {board.open.length === 0 && board.done.length === 0 ? (
        <Empty />
      ) : (
        <>
          <Overview board={board} />

          <div className="mt-5 flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold">待办 {board.open.length} 条</h2>
            <div className="flex items-center gap-1">
              {(["priority", "hours", "type"] as SortMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="rounded-pill px-2.5 py-1 text-[12px]"
                  style={
                    mode === m
                      ? { background: "var(--ink)", color: "#fff" }
                      : { color: "var(--slate)" }
                  }
                >
                  {SORT_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-2 space-y-2">
            {sorted.map((t) => (
              <TaskCard
                key={t.id}
                t={board.open.find((x) => x.id === t.id)!}
                onEdit={setDraft}
                highlighted={t.id === highlight}
              />
            ))}
            {board.open.length === 0 && (
              <li className="text-[13px]" style={{ color: "var(--mute)" }}>
                待办清空了。
              </li>
            )}
          </ul>

          {board.done.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="text-[13px] hover:underline"
                style={{ color: "var(--slate)" }}
              >
                已完成 {board.done.length} 条 {showDone ? "▴" : "▾"}
              </button>
              {showDone && (
                <ul className="mt-2 space-y-2">
                  {board.done.map((t) => (
                    <DoneCard key={t.id} t={t} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {draft && (
        <TaskFormDialog
          key={draft.id ?? "__new__"}
          draft={draft}
          gaps={gaps}
          anchors={anchors}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Empty() {
  return (
    <div
      className="mt-6 rounded-card px-6 py-10 text-center"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <p className="text-[14px]" style={{ color: "var(--slate)" }}>
        {EMPTY_COPY}
      </p>
      <Link href="/app/targets" className="mt-4 inline-block">
        <Button size="sm">去评估一份 JD</Button>
      </Link>
    </div>
  );
}

/** 概览条。方向那一格有几个方向就列几个 —— 不汇总成一个数。 */
function Overview({ board }: { board: TaskBoard }) {
  return (
    <div
      className="mt-4 flex flex-wrap items-stretch gap-x-8 gap-y-3 rounded-card px-5 py-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <Stat label="待办行动" value={`${board.open.length}`} />
      <Stat label="预计总工时" value={`${board.totalHours}h`} />
      <div>
        <div className="text-[11.5px]" style={{ color: "var(--mute)" }}>
          各方向预期提升
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {board.perTarget.length === 0 && (
            <span className="text-[13px]" style={{ color: "var(--mute)" }}>
              还没有求职方向
            </span>
          )}
          {board.perTarget.map((t) => (
            <span key={t.targetId} className="text-[13px]">
              {t.targetName}{" "}
              <span className="font-display font-semibold" style={{ color: "var(--proof)" }}>
                +{t.impact}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11.5px]" style={{ color: "var(--mute)" }}>
        {label}
      </div>
      <div className="font-display mt-0.5 text-[20px] font-semibold leading-none">{value}</div>
    </div>
  );
}

export function ActionTag({ type }: { type: TaskView["actionType"] }) {
  const c = ACTION_COPY[type];
  return (
    <span
      className="inline-block shrink-0 rounded-pill px-2 py-0.5 text-[11.5px]"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

function TaskCard({
  t,
  onEdit,
  highlighted = false,
}: {
  t: TaskView;
  onEdit: (d: TaskDraft) => void;
  highlighted?: boolean;
}) {
  const router = useRouter();
  // 就地展开，不跳页 —— 清单的价值在于一眼扫完，跳走就断了。
  const [open, setOpen] = useState(highlighted);
  // 勾选不直接标记完成，先弹回流面板。闭环成不成立就看这一步。
  const [reflow, setReflow] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function act(fn: () => Promise<{ ok: boolean }>) {
    start(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <li
      className="rounded-card px-4 py-3.5"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        // 跳过来的那条描个边，不然一屏十条根本找不到是哪一条。
        outline: highlighted ? "2px solid var(--ink)" : undefined,
        outlineOffset: highlighted ? "-2px" : undefined,
      }}
    >
      {reflow && <ReflowPanel task={t} onClose={() => setReflow(false)} />}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setReflow(true)}
          aria-label={`完成「${t.title}」`}
          title="完成这条行动"
          className="mt-[3px] text-[14px]"
          style={{ color: "var(--ghost)" }}
        >
          ☐
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-baseline gap-2 text-left"
          >
            {t.pinned && (
              <span aria-label="已置顶" title="已置顶" style={{ color: "var(--slate)" }}>
                ↑
              </span>
            )}
            <h3 className="text-[14.5px] font-medium">{t.title}</h3>
            <span aria-hidden className="ml-auto text-[11px]" style={{ color: "var(--ghost)" }}>
              {open ? "▴" : "▾"}
            </span>
          </button>

          {t.rationale && (
            <p
              className={`mt-1 text-[13px] leading-relaxed ${open ? "" : "line-clamp-2"}`}
              style={{ color: "var(--slate)" }}
            >
              {t.rationale}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
            <ActionTag type={t.actionType} />
            <span style={{ color: "var(--slate)" }}>{t.estimatedHours}h</span>
            {/* 「服务 N 个方向」是方向平权下唯一的排序依据，做成主色的芯片，
                不是一句灰字 —— 分配时间时先看的就是这个数。 */}
            <span
              className="rounded-pill px-2 py-0.5 font-medium"
              style={{ background: "var(--ai-soft)", color: "var(--ai)" }}
            >
              服务 {t.targetCount} 个方向
            </span>
            {t.source === "manual" && <span style={{ color: "var(--mute)" }}>手动添加</span>}
            {/* 方向被删掉之后 task_targets 级联清空，这条行动就没有落点了。
                不声不响留在清单上会一直占着位置，标出来让人决定留还是放弃。 */}
            {t.targetCount === 0 && t.source === "ai_generated" && (
              <span
                className="rounded-pill px-2 py-0.5"
                style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
              >
                已失去关联方向，处理一下
              </span>
            )}
            {t.edited && <span style={{ color: "var(--mute)" }}>已编辑</span>}
          </div>

          <PerTargetImpact t={t} />

          {t.anchorTitle && (
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--mute)" }}>
              挂靠 ·{" "}
              <Link href="/app/library" className="hover:underline">
                {t.anchorTitle}
              </Link>
            </p>
          )}
          {t.deliverable && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--mute)" }}>
              完成后产出 → {t.deliverable}
            </p>
          )}

          {open && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <h4 className="text-[12px] font-medium" style={{ color: "var(--slate)" }}>
                这条补上的缺口
              </h4>
              <ul className="mt-1.5 space-y-1.5">
                {t.targets.length === 0 && (
                  <li className="text-[12.5px]" style={{ color: "var(--mute)" }}>
                    没有关联缺口，预期提升为 0。
                  </li>
                )}
                {t.targets.map((x) => (
                  <li key={`${x.targetId}-${x.gapId}`} className="flex items-start gap-2 text-[12.5px]">
                    <span className="shrink-0" style={{ color: "var(--mute)" }}>
                      {x.targetName}
                    </span>
                    {x.gapType && (
                      <span
                        className="shrink-0 rounded-pill px-1.5 text-[11px]"
                        style={{ background: GAP_COPY[x.gapType].bg, color: GAP_COPY[x.gapType].fg }}
                      >
                        {GAP_COPY[x.gapType].label}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">{x.requirementText || "（要求原文缺失）"}</span>
                    <span
                      className="font-display shrink-0 font-semibold"
                      style={{ color: "var(--proof)" }}
                    >
                      +{x.impact.toFixed(1)}
                    </span>
                    {x.gapId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          start(async () => {
                            const r = await dismissGap(t.id, x.gapId!);
                            if (r.ok && r.data.remaining === 0) {
                              setAsk("这条行动的关联缺口都被忽略了，要一并放弃吗？");
                            }
                            router.refresh();
                          })
                        }
                        className="shrink-0 hover:underline"
                        style={{ color: "var(--mute)" }}
                      >
                        这条不重要
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {ask && (
                <div className="mt-2 flex items-center gap-2 text-[12.5px]">
                  <span style={{ color: "var(--slate)" }}>{ask}</span>
                  <button
                    type="button"
                    onClick={() => act(() => dropTask(t.id))}
                    className="hover:underline"
                    style={{ color: "var(--danger)" }}
                  >
                    放弃
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsk(null)}
                    className="hover:underline"
                    style={{ color: "var(--mute)" }}
                  >
                    留着
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onEdit({
                      id: t.id,
                      title: t.title,
                      rationale: t.rationale,
                      actionType: t.actionType,
                      estimatedHours: t.estimatedHours,
                      deliverable: t.deliverable,
                      anchorAtomId: t.anchorAtomId,
                      gapIds: t.targets.map((x) => x.gapId).filter((x): x is string => !!x),
                    })
                  }
                  className="hover:underline"
                  style={{ color: "var(--slate)" }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => pinTask(t.id, !t.pinned))}
                  className="hover:underline"
                  style={{ color: "var(--slate)" }}
                >
                  {t.pinned ? "取消置顶" : "置顶"}
                </button>
                {confirmDrop ? (
                  <span className="flex items-center gap-2">
                    <span style={{ color: "var(--slate)" }}>放弃这条行动？</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(() => dropTask(t.id))}
                      className="hover:underline"
                      style={{ color: "var(--danger)" }}
                    >
                      确认放弃
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDrop(false)}
                      className="hover:underline"
                      style={{ color: "var(--mute)" }}
                    >
                      取消
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDrop(true)}
                    className="hover:underline"
                    style={{ color: "var(--mute)" }}
                  >
                    放弃
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** 各方向 impact 分别列出，不给总和 —— 得知道这条主要是补哪个方向。 */
function PerTargetImpact({ t }: { t: TaskView }) {
  const byTarget = new Map<string, number>();
  for (const x of t.targets) {
    byTarget.set(x.targetName, (byTarget.get(x.targetName) ?? 0) + x.impact);
  }
  if (byTarget.size === 0) return null;

  // 改叙事类补的是印象分，不是客观匹配度，必须标出来。不标注就是在骗自己。
  const estimated = t.actionType === "rewrite_narrative";

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
      {[...byTarget].map(([name, impact], i) => (
        <span key={name} style={{ color: "var(--slate)" }}>
          {i > 0 && <span style={{ color: "var(--ghost)" }}>· </span>}
          {name}{" "}
          <span className="font-display font-semibold" style={{ color: "var(--proof)" }}>
            +{impact.toFixed(1)}
          </span>
        </span>
      ))}
      {estimated && (
        <span
          title={IMPACT_IS_ESTIMATED_NOTE}
          aria-label={IMPACT_IS_ESTIMATED_NOTE}
          className="cursor-help rounded-pill px-1.5 text-[11px]"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          ?
        </span>
      )}
    </p>
  );
}

function DoneCard({ t }: { t: TaskView }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <li
      className="rounded-card px-4 py-3"
      style={{ background: "var(--card)", border: "1px solid var(--line)", opacity: 0.75 }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-[2px] text-[13px]" style={{ color: "var(--proof)" }}>
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-medium line-through" style={{ color: "var(--slate)" }}>
            {t.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--mute)" }}>
            <ActionTag type={t.actionType} />
            <span>实际 {t.actualHours === null ? "未记录" : `${t.actualHours}h`}</span>
            {t.autoCompleted && (
              <span
                className="rounded-pill px-1.5"
                style={{ background: "var(--ai-soft)", color: "var(--ai)" }}
              >
                因数据补齐自动完成
              </span>
            )}
            {/* 自动完成可能判错，必须能改回待办。 */}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await reopenTask(t.id);
                  router.refresh();
                })
              }
              className="hover:underline"
              style={{ color: "var(--mute)" }}
            >
              改回待办
            </button>
            {t.producesTitle && (
              <span>
                产出 →{" "}
                <Link href="/app/library" className="hover:underline">
                  {t.producesTitle}
                </Link>
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
