"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeTaskWithAtom } from "@/app/(app)/actions/reflow-actions";

import { Button } from "@/components/ui/Button";
import type { ReviewQueue as Queue, ReviewDraft } from "@/lib/queries/drafts";
import type { ExtractedAtom } from "@/lib/ingest/schema";
import {
  acceptAllCreates,
  acceptDraft,
  rejectDraft,
  type CommitResult,
} from "@/app/(app)/import/review/[jobId]/actions";
import { ConfirmCard } from "./ConfirmCard";

// 分组顺序固定：需你判断 → 更新 → 新增。需要动脑的排前面。
const SECTIONS = [
  { key: "ask" as const, title: "需你判断", hint: "这几条合并或独立都说得通，只有你知道该怎么算" },
  { key: "update" as const, title: "更新", hint: "改的是已有的经历，覆盖前看清楚改了什么" },
  { key: "create" as const, title: "新增", hint: "库里没有的，收下就进事实层" },
];

export function ReviewQueue({
  queue,
  taskId = null,
}: {
  queue: Queue;
  /** 从行动清单的回流面板过来时带着的行动 id。入库之后把它标成完成。 */
  taskId?: string | null;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reflowed, setReflowed] = useState(false);

  const left = (list: ReviewDraft[]) => list.filter((d) => !gone.has(d.id));
  const total = left(queue.ask).length + left(queue.update).length + left(queue.create).length;

  // 处理完一张卡：缩到 0.98 + 淡出 180ms，然后从列表里摘掉，下一张上移
  function retire(id: string) {
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => {
      setGone((s) => new Set(s).add(id));
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 180);
  }

  function announce(r: CommitResult) {
    if (r.atomId) setFlashIds((s) => [...s, r.atomId]);
    setToast(
      r.scoreAfter === r.scoreBefore
        ? "已入库"
        : `已入库 · 证明度 ${r.scoreBefore}% → ${r.scoreAfter}%`,
    );
    setTimeout(() => setToast(null), 3200);
  }

  async function accept(
    d: ReviewDraft,
    atom: ExtractedAtom | null,
    parentId: string | null,
    asCreate: boolean,
  ) {
    const r = await acceptDraft({
      draftId: d.id,
      atom,
      parentAtomId: parentId,
      asCreate,
    });
    if (!r.ok) throw new Error(r.error);
    // 回流上传路径：这条经历就是那条行动的产出。入库成功才标完成 ——
    // 标早了会出现「行动完成了但档案里什么都没有」。
    if (taskId && r.data.atomId) {
      const done = await completeTaskWithAtom(taskId, r.data.atomId, null);
      if (done.ok) setReflowed(true);
    }
    announce(r.data);
    retire(d.id);
  }

  async function reject(d: ReviewDraft) {
    const r = await rejectDraft(d.id);
    if (!r.ok) throw new Error(r.error);
    retire(d.id);
  }

  async function acceptAll() {
    setBusy(true);
    const r = await acceptAllCreates(queue.jobId);
    setBusy(false);
    if (!r.ok) return;
    announce(r.data);
    for (const d of queue.create) {
      if ((d.confidence ?? 0) >= 0.9) retire(d.id);
    }
  }

  if (total === 0) {
    return (
      <div
        className="rounded-card px-6 py-7"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <p className="text-[15px] font-medium">这份文档处理完了</p>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--slate)" }}>
          收下的经历已经进了事实层。去经历库看看，补上缺的结果数据，证明度还能往上走。
        </p>
        {reflowed && (
          <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--proof)" }}>
            对应的那条行动已经标成完成，产出的经历也挂上去了。
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() =>
              router.push(
                flashIds.length > 0
                  ? `/library?atom=${flashIds[0]}&flash=${flashIds.join(",")}`
                  : "/library",
              )
            }
          >
            去经历库
          </Button>
          <Button variant="text" onClick={() => router.push("/import")}>
            再传一份
          </Button>
        </div>
      </div>
    );
  }

  const bulk = queue.create.filter((d) => !gone.has(d.id) && (d.confidence ?? 0) >= 0.9).length;

  return (
    <div>
      {/* 批量：只给新增，且只给高置信度的。更新永远没有批量。 */}
      {bulk > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void acceptAll()}>
            {busy ? "入库中…" : `全部接受新增（${bulk} 条）`}
          </Button>
          <span className="text-[12.5px]" style={{ color: "var(--mute)" }}>
            只对置信度 90% 以上的新增生效，更新和需你判断的不动
          </span>
        </div>
      )}

      <div className="space-y-6">
        {SECTIONS.map((s) => {
          const list = left(queue[s.key]);
          if (list.length === 0) return null;
          return (
            <section key={s.key}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-[15px] font-semibold">{s.title}</h2>
                <span className="text-[12.5px]" style={{ color: "var(--mute)" }}>
                  {list.length} 条 · {s.hint}
                </span>
              </div>
              <div className="space-y-3">
                {list.map((d) => (
                  <ConfirmCard
                    key={d.id}
                    draft={d}
                    projects={queue.projects}
                    leaving={leaving.has(d.id)}
                    action={{
                      accept: (atom, parentId, asCreate) => accept(d, atom, parentId, asCreate),
                      reject: () => reject(d),
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-card px-4 py-2.5 text-[13.5px] font-medium shadow-lg"
          style={{ background: "var(--ink)", color: "#fff" }}
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
