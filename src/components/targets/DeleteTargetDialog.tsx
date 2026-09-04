"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirm() {
    setError(null);
    start(async () => {
      const res = await deleteTarget(targetId);
      if (res.ok) onDeleted();
      else setError(res.error);
    });
  }

  const related: string[] = [];
  if (impact) {
    if (impact.jdCount) related.push(`${impact.jdCount} 份 JD`);
    if (impact.assessmentCount) related.push(`${impact.assessmentCount} 份评估`);
    if (impact.resumeCount) related.push(`${impact.resumeCount} 份简历`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(12,14,20,0.4)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="确认删除求职方向"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        {impact ? (
          <>
            <h2 className="text-[15.5px] font-semibold leading-snug">
              确定删除「{impact.name}」？
            </h2>
            <div className="mt-2.5 space-y-1.5 text-[13.5px]" style={{ color: "var(--slate)" }}>
              {related.length > 0 ? (
                <p>
                  这个方向下的{" "}
                  {related.map((r, i) => (
                    <span key={r}>
                      {i > 0 && "、"}
                      <B>{r}</B>
                    </span>
                  ))}
                  会一并删除。
                </p>
              ) : (
                <p>这个方向下还没有 JD、评估和简历。</p>
              )}
              <p>经历本身不受影响，只是它在这个方向下的策略配置会没掉。</p>
              <p>这个操作不能撤销。</p>
            </div>
          </>
        ) : (
          <p className="text-[13.5px]" style={{ color: "var(--slate)" }}>
            {error ?? "正在算这一删会带走什么…"}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {impact && error && (
            <span className="mr-auto text-[12.5px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={working}>
            取消
          </Button>
          <Button variant="danger" size="sm" onClick={confirm} disabled={!impact || working}>
            {working ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-semibold" style={{ color: "var(--ink)" }}>
      {children}
    </strong>
  );
}
