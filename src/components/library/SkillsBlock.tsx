"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { unlinkSkill } from "@/app/app/library/actions";
import { STRENGTH_LABEL } from "@/lib/domain";
import type { AtomSkill } from "@/lib/queries/atoms";
import { SkillCombobox } from "./SkillCombobox";
import { StrengthDot } from "./StrengthDot";

export function SkillsBlock({ atomId, skills }: { atomId: string; skills: AtomSkill[] }) {
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<AtomSkill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 存完等新数据回来再收，跟指标区一个道理
  const [awaiting, setAwaiting] = useState(false);
  const [seen, setSeen] = useState(skills);
  if (seen !== skills) {
    setSeen(skills);
    if (awaiting) {
      setAwaiting(false);
      setAdding(false);
      setConfirming(null);
    }
  }
  const working = pending || awaiting;

  function unlink(linkId: string) {
    setError(null);
    start(async () => {
      const res = await unlinkSkill(linkId);
      if (res.ok) setAwaiting(true);
      else setError(res.error);
    });
  }

  return (
    <>
      {skills.length === 0 && !adding && (
        <p className="mb-2 text-[13px]" style={{ color: "var(--mute)" }}>
          还没关联技能。没有经历支撑的技能不会出现在简历技能栏里。
        </p>
      )}

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span
              key={s.linkId}
              className="group inline-flex items-center gap-1.5 rounded-pill py-[3px] pl-2.5 pr-1.5 text-[12.5px]"
              style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
            >
              <StrengthDot strength={s.evidence_strength} />
              {s.label}
              <span style={{ color: "var(--mute)" }}>{STRENGTH_LABEL[s.evidence_strength]}</span>
              <button
                type="button"
                aria-label={`解除关联 ${s.label}`}
                disabled={working}
                onClick={() => (s.linkCount <= 1 ? setConfirming(s) : unlink(s.linkId))}
                className="rounded-pill px-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30"
                style={{ color: "var(--mute)" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 解完就没有任何经历撑着的技能，先说清楚后果 */}
      {confirming && (
        <div
          className="mt-2 rounded-btn px-3 py-2.5"
          style={{ background: "var(--warn-soft)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--ink)" }}>
            解除后「{confirming.label}」就没有任何经历支撑了，简历里不会再出现它。
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(null)}
              disabled={working}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => unlink(confirming.linkId)}
              disabled={working}
            >
              仍然解除
            </Button>
          </div>
        </div>
      )}

      {adding ? (
        <div className="mt-2 flex items-start gap-2">
          <SkillCombobox
            atomId={atomId}
            linkedIds={skills.map((s) => s.id)}
            onDone={() => setAwaiting(true)}
            onCancel={() => setAdding(false)}
          />
          <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>
            取消
          </Button>
        </div>
      ) : (
        <Button variant="text" size="sm" className="mt-1 px-0" onClick={() => setAdding(true)}>
          ＋ 关联技能
        </Button>
      )}

      {error && (
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </>
  );
}
