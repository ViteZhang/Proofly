"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  profileItemImpact,
  removeProfileItem,
  type ProfileEntity,
} from "@/app/app/profile/actions";

/**
 * 删除确认。
 *
 * 打开时先去问一次影响范围 —— 「这条学历出现在 2 份简历里」这句话必须在
 * 用户按下删除之前出现。删完再说等于没说。
 */
export function DeleteConfirm({
  entity,
  id,
  name,
  onClose,
}: {
  entity: ProfileEntity;
  id: string;
  name: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();

  useEffect(() => {
    let alive = true;
    void profileItemImpact(entity, id).then((res) => {
      if (!alive) return;
      if (res.ok) setLines(res.data.lines);
      else setLines([]);
    });
    return () => {
      alive = false;
    };
  }, [entity, id]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(12,14,20,0.34)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-card"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        <div className="px-5 py-5">
          <h3 className="text-[15px] font-semibold">删掉「{name}」？</h3>

          {lines === null ? (
            <p className="mt-2 text-[13px]" style={{ color: "var(--mute)" }}>
              正在看它被哪些地方用到…
            </p>
          ) : lines.length === 0 ? (
            <p className="mt-2 text-[13px]" style={{ color: "var(--slate)" }}>
              没有已生成的简历用到它，删掉不影响别的地方。
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {lines.map((l) => (
                <li key={l} className="text-[13px]" style={{ color: "var(--slate)" }}>
                  · {l}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex justify-end gap-2 px-5 py-3.5"
          style={{ borderTop: "1px solid var(--line-soft)" }}
        >
          <Button variant="text" disabled={pending} onClick={onClose}>
            不删了
          </Button>
          <Button
            variant="danger"
            // 影响范围还没回来就不给按。这一步就是为了让人看完再决定。
            disabled={pending || lines === null}
            onClick={() =>
              run(async () => {
                const res = await removeProfileItem(entity, id);
                if (res.ok) onClose();
                else setError(res.error);
              })
            }
          >
            {pending ? "删除中…" : "删掉"}
          </Button>
        </div>
      </div>
    </>
  );
}
