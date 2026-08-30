"use client";

// =============================================================
// Proofly · 完成回流面板（S7）
//
// 勾选复选框不直接标记完成，先弹这个。默认路径是回流 ——
// 「只标记完成」允许存在，但做成文字按钮，视觉上明显弱于主按钮。
// 闭环成不成立就看这一步：任务做完了要变成一条经历，
// 而不是一个被划掉的复选框。
// =============================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ChatConfirmCard } from "@/components/notes/ChatConfirmCard";
import {
  commitReflow,
  describeReflow,
  markDone,
} from "@/app/(app)/actions/reflow-actions";
import type { Choice } from "@/app/(app)/notes/commit-actions";
import { confirmCard, type ChatMessageView } from "@/lib/chat/message-shape";
import type { TaskView } from "@/lib/queries/tasks";

type Mode = "describe" | "upload";

export function ReflowPanel({
  task,
  onClose,
}: {
  task: TaskView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("describe");
  const [text, setText] = useState("");
  const [hours, setHours] = useState("");
  const [cards, setCards] = useState<ChatMessageView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hoursValue = hours.trim() === "" ? null : Number(hours);

  function describe() {
    setError(null);
    start(async () => {
      const r = await describeReflow(task.id, text);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data.units === 0) {
        setError("这段话里没读出可以入档的内容，说具体一点：做了什么、拿到了什么数。");
        return;
      }
      setCards(r.data.messages);
    });
  }

  function commit(draftId: string, choice?: Choice) {
    setError(null);
    start(async () => {
      const r = await commitReflow(task.id, draftId, hoursValue, choice);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function onlyMark() {
    setError(null);
    start(async () => {
      const r = await markDone(task.id, hoursValue);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="这条行动产出了什么"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[560px] overflow-y-auto rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <h2 className="text-[15.5px] font-semibold">这条行动产出了什么？</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--mute)" }}>
          {task.title}
        </p>

        {cards.length === 0 ? (
          <>
            <div className="mt-4 flex items-center gap-4 text-[13px]">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  checked={mode === "upload"}
                  onChange={() => setMode("upload")}
                />
                上传交付物
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  checked={mode === "describe"}
                  onChange={() => setMode("describe")}
                />
                直接描述
              </label>
            </div>

            {mode === "describe" ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="招了 50 个内测用户跑满两周，第二周回访率 38%，人均问 AI 11.4 次，断点续学用了 62%。"
                className="mt-2.5 w-full rounded-btn px-2.5 py-2 text-[13.5px] leading-relaxed focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              />
            ) : (
              <div
                className="mt-2.5 rounded-btn px-3 py-4 text-[13px]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <p style={{ color: "var(--slate)" }}>
                  交付物走导入那条链路：上传 → 抽取 → 校对入库，跟平时导入一份材料
                  完全一样。
                </p>
                <Link
                  href={`/import?task=${task.id}`}
                  className="mt-2.5 inline-block text-[13px] hover:underline"
                  style={{ color: "var(--ink)" }}
                >
                  去上传交付物 →
                </Link>
                <p className="mt-2 text-[12px]" style={{ color: "var(--mute)" }}>
                  入库之后这条行动会自动标成完成，产出的经历也会挂上来。
                </p>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <span style={{ color: "var(--slate)" }}>实际花了</span>
              <input
                type="number"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-[80px] rounded-btn px-2 py-1 text-[13.5px] focus:outline-2 focus:outline-offset-[-1px] focus:outline-ink"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              />
              <span style={{ color: "var(--slate)" }}>小时</span>
              <span className="text-[12px]" style={{ color: "var(--mute)" }}>
                预计 {task.estimatedHours}h
              </span>
            </div>

            {error && (
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center gap-3">
              {mode === "describe" && (
                <Button size="sm" onClick={describe} disabled={busy || text.trim() === ""}>
                  {busy ? "处理中…" : "生成经历并完成"}
                </Button>
              )}
              {/* 文字按钮，不是主按钮。回流是默认路径。 */}
              <button
                type="button"
                onClick={onlyMark}
                disabled={busy}
                className="text-[12.5px] hover:underline disabled:opacity-50"
                style={{ color: "var(--mute)" }}
              >
                只标记完成
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="ml-auto text-[12.5px] hover:underline"
                style={{ color: "var(--mute)" }}
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <p className="text-[13px]" style={{ color: "var(--slate)" }}>
              确认一下要往档案里写什么。确认之后这条行动就算完成。
            </p>
            <div className="mt-2.5 space-y-2.5">
              {cards.map((m) => {
                const card = m.kind === "confirm_card" ? confirmCard(m.payload) : null;
                return card ? (
                  <ChatConfirmCard
                    key={m.id}
                    card={card}
                    headline={m.content}
                    imageUrl={null}
                    busy={busy}
                    onCommit={(choice) => commit(card.draftId, choice)}
                  />
                ) : (
                  <p key={m.id} className="text-[13px]" style={{ color: "var(--slate)" }}>
                    {m.content}
                  </p>
                );
              })}
            </div>
            {error && (
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            {/* 半路关掉不会把行动误标成完成，草稿也留着 —— 回头从随手记或
                导入校对页都能接着处理。 */}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 text-[12.5px] hover:underline"
              style={{ color: "var(--mute)" }}
            >
              先放着，回头再确认
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
