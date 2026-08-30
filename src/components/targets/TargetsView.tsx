"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DeleteTargetDialog } from "@/components/targets/DeleteTargetDialog";
import { TargetFormDialog, type TargetDraft } from "@/components/targets/TargetFormDialog";
import type { TargetCard } from "@/lib/queries/targets";

// S6 区块一。
// 平权的实现要点：所有卡片共用同一份 className 与内联样式，尺寸、底色、
// 字重没有任何按分数或顺序变化的分支；选中态只加一圈 outline（不占布局），
// 不改字重也不改背景。这里不要加星标、置顶、「主方向」徽标。
export function TargetsView({
  targets,
  selectedId,
  openNew = false,
}: {
  targets: TargetCard[];
  selectedId: string | null;
  // 顶栏选择器里的「＋ 新建方向」跳到 /targets?new=1，由这里接住并把标记消费掉。
  openNew?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TargetDraft | null>(null);
  const [newDismissed, setNewDismissed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const selected = targets.find((t) => t.id === selectedId) ?? null;

  // 弹窗开不开是从 URL 直接推出来的，不在 effect 里 setState——
  // 那样会多渲染一轮，而且 ?new=1 还在地址栏时状态容易对不上。
  const open = draft ?? (openNew && !newDismissed ? EMPTY_DRAFT : null);

  function select(id: string) {
    router.replace(`/targets?target=${id}`, { scroll: false });
  }

  // 关掉弹窗时顺手把 ?new=1 抹掉，否则刷新会重新弹一次。
  function closeForm() {
    setDraft(null);
    if (openNew) {
      setNewDismissed(true);
      router.replace(selectedId ? `/targets?target=${selectedId}` : "/targets", { scroll: false });
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">求职方向</h1>
          <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
            几个方向平等地并排放着，没有主次。切换方向只换这一页的上下文。
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDraft(EMPTY_DRAFT)}
        >
          ＋ 新建方向
        </Button>
      </div>

      {targets.length === 0 ? (
        <EmptyTargets onCreate={() => setDraft(EMPTY_DRAFT)} />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            {targets.map((t) => (
              <TargetCardButton
                key={t.id}
                target={t}
                selected={t.id === selectedId}
                onSelect={() => select(t.id)}
              />
            ))}
          </div>

          {selected && (
            <SelectedPanel
              target={selected}
              onEdit={() =>
                setDraft({
                  id: selected.id,
                  name: selected.name,
                  direction: selected.direction ?? "",
                  narrative: selected.narrative ?? "",
                })
              }
              onDelete={() => setDeleting(selected.id)}
            />
          )}
        </>
      )}

      {open && (
        <TargetFormDialog
          // key 换了才会重新挂载。少了它，编辑完 A 再点新建，
          // 表单里还留着 A 的名字（useState 的初值只在挂载时读一次）。
          key={open.id ?? "__new__"}
          draft={open}
          onClose={closeForm}
          onSaved={(id) => {
            setDraft(null);
            setNewDismissed(true);
            select(id);
            router.refresh();
          }}
        />
      )}

      {deleting && (
        <DeleteTargetDialog
          targetId={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            router.replace("/targets", { scroll: false });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const EMPTY_DRAFT: TargetDraft = { id: null, name: "", direction: "", narrative: "" };

// 卡片本体。样式常量提到组件外，保证每张卡片走的是同一份值。
const CARD_CLASS =
  "relative w-[216px] shrink-0 rounded-card px-4 py-3.5 text-left " +
  "transition-colors duration-150 cursor-pointer " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const CARD_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  boxShadow: "var(--shadow-1)",
} as const;

function TargetCardButton({
  target,
  selected,
  onSelect,
}: {
  target: TargetCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={CARD_CLASS}
      style={
        selected
          ? // outline 不占布局，选中卡片跟其他卡片仍然一样大
            { ...CARD_STYLE, outline: "2px solid var(--ink)", outlineOffset: "-2px" }
          : CARD_STYLE
      }
    >
      <div
        className="truncate text-[14.5px] font-semibold leading-[20px]"
        style={{ color: "var(--ink)" }}
      >
        {target.name}
      </div>
      <div className="mt-0.5 h-[16px] truncate text-[12px]" style={{ color: "var(--mute)" }}>
        {target.direction ?? ""}
      </div>

      <div className="mt-3 flex h-[22px] items-baseline gap-1.5">
        {target.matchScore === null ? (
          <span className="text-[13px] leading-[22px]" style={{ color: "var(--mute)" }}>
            还没评估
          </span>
        ) : (
          <>
            <span
              className="font-display text-[22px] font-semibold leading-none tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              {Math.round(target.matchScore)}
            </span>
            <span className="text-[12px]" style={{ color: "var(--slate)" }}>
              匹配度
            </span>
          </>
        )}
      </div>

      <div className="mt-2 text-[12.5px] leading-[18px]" style={{ color: "var(--slate)" }}>
        {target.jdCount} 份 JD · {target.gapCount} 个缺口
      </div>
    </button>
  );
}

function SelectedPanel({
  target,
  onEdit,
  onDelete,
}: {
  target: TargetCard;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="mt-5 rounded-card px-5 py-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium" style={{ color: "var(--slate)" }}>
            主线故事
          </div>
          <p
            className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed"
            style={{ color: target.narrative ? "var(--ink)" : "var(--mute)" }}
          >
            {target.narrative ?? "还没写。简历的开头和面试的自我介绍都会从这里长出来。"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* 批量配置这个方向下每条经历讲多少 */}
          <Link
            href={`/targets/strategy?target=${target.id}`}
            className="inline-flex h-[30px] items-center rounded-btn px-3 text-[13px] font-medium transition-colors hover:bg-line-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            配置经历策略
          </Link>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            编辑
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyTargets({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="mt-6 rounded-card px-6 py-10 text-center"
      style={{ background: "var(--card)", border: "1px dashed var(--line)" }}
    >
      <p className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
        还没有求职方向。想投什么岗位？
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px]" style={{ color: "var(--slate)" }}>
        方向定下来，才知道手上的经历该怎么讲、还差什么。可以先建两个平行的方向，
        同一批经历在不同方向下讲法不一样。
      </p>
      <div className="mt-4 flex justify-center">
        <Button size="sm" onClick={onCreate}>
          ＋ 新建方向
        </Button>
      </div>
    </div>
  );
}
