"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog, Emphasis } from "@/components/ui/ConfirmDialog";
import {
  deleteTarget,
  getTargetDeleteImpact,
  type TargetDeleteImpact,
} from "@/app/app/targets/actions";

// 二次确认。牵连数量必须是查库算出来的——「将一并删除 3 份 JD」这句话
// 只有在数字是真的时候才有意义。
export function DeleteTargetDialog({
  targetId,
  onClose,
  onDeleted,
}: {
  targetId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<TargetDeleteImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    let alive = true;
    getTargetDeleteImpact(targetId).then((res) => {
      if (!alive) return;
      if (res.ok) setImpact(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [targetId]);

  const related: string[] = [];
  if (impact) {
    if (impact.jdCount) related.push(`${impact.jdCount} 份 JD`);
    if (impact.assessmentCount) related.push(`${impact.assessmentCount} 份评估`);
    if (impact.resumeCount) related.push(`${impact.resumeCount} 份简历`);
  }

  return (
    <ConfirmDialog
      ariaLabel="确认删除求职方向"
      title={impact ? `确定删除「${impact.name}」？` : "确定删除这个方向？"}
      ready={impact !== null}
      busy={working}
      error={impact ? error : null}
      onClose={onClose}
      onConfirm={() => {
        setError(null);
        start(async () => {
          const res = await deleteTarget(targetId);
          if (res.ok) onDeleted();
          else setError(res.error);
        });
      }}
    >
      {impact === null ? (
        <p>{error ?? "正在算这一删会带走什么…"}</p>
      ) : (
        <>
          {related.length > 0 ? (
            <p>
              这个方向下的{" "}
              {related.map((r, i) => (
                <span key={r}>
                  {i > 0 && "、"}
                  <Emphasis>{r}</Emphasis>
                </span>
              ))}
              会一并删除。
            </p>
          ) : (
            <p>这个方向下还没有 JD、评估和简历。</p>
          )}
          <p>经历本身不受影响，只是它在这个方向下的策略配置会没掉。</p>
          <p>这个操作不能撤销。</p>
        </>
      )}
    </ConfirmDialog>
  );
}
