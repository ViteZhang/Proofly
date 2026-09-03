"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { deleteAtom, getDeleteImpact, type DeleteImpact } from "@/app/app/library/actions";

// 二次确认。影响范围必须是查库算出来的真实数字——写死的数字会在
// 用户真正需要它的那一次骗到人。
export function DeleteAtomDialog({
  atomId,
  onClose,
  onDeleted,
}: {
  atomId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    let alive = true;
    getDeleteImpact(atomId).then((res) => {
      if (!alive) return;
      if (res.ok) setImpact(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [atomId]);

  // 弹窗开着的时候 Esc 关弹窗（编辑表单那边会让开）
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
      const res = await deleteAtom(atomId);
      if (res.ok) onDeleted();
      else setError(res.error);
    });
  }

  const related: string[] = [];
  if (impact) {
    if (impact.metricCount) related.push(`${impact.metricCount} 条指标`);
    if (impact.guardCount) related.push(`${impact.guardCount} 组叙事护栏`);
    if (impact.skillLinkCount) related.push(`${impact.skillLinkCount} 个技能关联`);
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
        aria-label="确认删除"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-card px-6 py-5"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-3)" }}
      >
        {impact ? (
          <>
            <h2 className="text-[15.5px] font-semibold leading-snug">
              确定删除「{impact.title}」？
            </h2>
            <div className="mt-2.5 space-y-1.5 text-[13.5px]" style={{ color: "var(--slate)" }}>
              {impact.childCount > 0 && (
                <p>
                  这条经历下面有 <B>{impact.childCount} 个能力点</B>，会一起删掉。
                </p>
              )}
              {related.length > 0 && (
                <p>
                  关联的{" "}
                  {related.map((r, i) => (
                    <span key={r}>
                      {i > 0 && "、"}
                      <B>{r}</B>
                    </span>
                  ))}
                  也会删除。
                </p>
              )}
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
