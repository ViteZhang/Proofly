"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog, Emphasis } from "@/components/ui/ConfirmDialog";
import {
  deleteJd,
  getJdDeleteImpact,
  type JdDeleteImpact,
} from "@/app/app/targets/jd-actions";

/**
 * 删 JD 的二次确认。
 *
 * 原来是点了就删。一份 JD 底下挂着解析出来的要求、历次评估、已经生成的
 * 投递版本和面试题库 —— 后两样花过积分，删掉不退。手滑一下没有任何提示
 * 就没了，这个代价太大。
 */
export function DeleteJdDialog({
  jdId,
  onClose,
  onDeleted,
}: {
  jdId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<JdDeleteImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void getJdDeleteImpact(jdId).then((res) => {
      if (!alive) return;
      if (res.ok) setImpact(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [jdId]);

  const related: string[] = [];
  if (impact) {
    if (impact.requirementCount) related.push(`${impact.requirementCount} 条已解析的要求`);
    if (impact.assessmentCount) related.push(`${impact.assessmentCount} 次评估`);
    if (impact.resumeCount) related.push(`${impact.resumeCount} 份投递版本`);
    if (impact.interviewCount) related.push(`${impact.interviewCount} 份面试题库`);
  }
  // 花过积分的东西被删掉，这句要单独说 —— 它和「要求项没了」不是一个量级。
  const paid = (impact?.resumeCount ?? 0) + (impact?.interviewCount ?? 0) > 0;

  return (
    <ConfirmDialog
      ariaLabel="确认删除岗位描述"
      title={impact ? `确定删除「${impact.name}」？` : "确定删除这份 JD？"}
      ready={impact !== null}
      busy={working}
      error={impact ? error : null}
      onClose={onClose}
      onConfirm={() => {
        setError(null);
        start(async () => {
          const res = await deleteJd(jdId);
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
              这份 JD 下的{" "}
              {related.map((r, i) => (
                <span key={r}>
                  {i > 0 && "、"}
                  <Emphasis>{r}</Emphasis>
                </span>
              ))}
              会一并删除。
            </p>
          ) : (
            <p>这份 JD 还没解析过，也没生成过简历和面试题。</p>
          )}
          {paid && <p>投递版本和面试题库是花过积分生成的，删掉不退，也重建不回来。</p>}
          {impact.taskLinkCount > 0 && (
            <p>
              行动清单里有 <Emphasis>{impact.taskLinkCount} 条任务</Emphasis>
              是从这份 JD 的缺口来的。任务本身留着，但它们会失去「为什么要做这件事」的出处。
            </p>
          )}
          <p>经历库和方向基线不受影响。这个操作不能撤销。</p>
        </>
      )}
    </ConfirmDialog>
  );
}
