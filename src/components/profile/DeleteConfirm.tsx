"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
    <ConfirmDialog
      ariaLabel="确认删除档案条目"
      title={`删掉「${name}」？`}
      // 影响范围还没回来就不给按。这一步就是为了让人看完再决定。
      ready={lines !== null}
      busy={pending}
      error={error}
      cancelLabel="不删了"
      confirmLabel="删掉"
      onClose={onClose}
      onConfirm={() =>
        run(async () => {
          const res = await removeProfileItem(entity, id);
          if (res.ok) onClose();
          else setError(res.error);
        })
      }
    >
      {lines === null ? (
        <p style={{ color: "var(--mute)" }}>正在看它被哪些地方用到…</p>
      ) : lines.length === 0 ? (
        <p>没有已生成的简历用到它，删掉不影响别的地方。</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li key={l}>· {l}</li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );
}
