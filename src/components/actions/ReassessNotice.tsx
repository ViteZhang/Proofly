"use client";

// =============================================================
// Proofly · 「正在重新评估 N 份 JD…」
//
// 入库那一刻能算的东西（证明度、待补项）已经显示了，这一行只管
// 匹配度变化。跑完原地替换成「C 端 68 → 79 · Agent 71 → 80」。
//
// 不是一个转圈：转圈说不出还剩几份、也说不出跑完了会得到什么。
// =============================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  pollReassess,
  retryReassess,
  type ReassessPlan,
} from "@/app/app/actions/reassess-actions";
import type { RippleEffect } from "@/lib/ripple/types";

const POLL_MS = 2500;
/** 超过这个时间还没跑完就当它挂了。三份 JD 的正常耗时在 20 秒上下。 */
const GIVE_UP_MS = 90_000;

export function ReassessNotice({ plan }: { plan: ReassessPlan }) {
  const router = useRouter();
  const [effects, setEffects] = useState<RippleEffect[]>([]);
  const [pending, setPending] = useState(plan.jds.length);
  const [failed, setFailed] = useState(false);
  // 重试时把 effect 重新跑一遍。
  const [tick, setTick] = useState(0);
  // 起点在 effect 里设。渲染期间不许调 Date.now()。
  const startedAt = useRef(0);

  useEffect(() => {
    if (plan.jds.length === 0) return;
    let alive = true;
    startedAt.current = Date.now();

    const tick = async () => {
      if (!alive) return;
      const r = await pollReassess(plan);
      if (!alive) return;

      if (r.ok) {
        setEffects(r.data.effects);
        setPending(r.data.pending);
        if (r.data.done) {
          router.refresh();
          return;
        }
      }
      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        setFailed(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };

    let timer = setTimeout(tick, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [plan, router, tick]);

  if (plan.jds.length === 0) return null;

  const scores = effects.filter((e) => e.kind === "match_score_change");
  const autoDone = effects.filter((e) => e.kind === "task_auto_complete");

  return (
    <div className="mt-1.5 text-[12.5px]">
      {pending > 0 && !failed && (
        <p style={{ color: "var(--mute)" }}>正在重新评估 {pending} 份 JD…</p>
      )}

      {failed && (
        <p style={{ color: "var(--warn)" }}>
          {pending === plan.jds.length
            ? "重新评估失败，"
            : `还有 ${pending} 份没评估成，`}
          <button
            type="button"
            onClick={() => {
              void retryReassess(plan).then(() => {
                startedAt.current = Date.now();
                setFailed(false);
                setTick((n) => n + 1);
              });
            }}
            className="hover:underline"
            style={{ color: "var(--ink)" }}
          >
            可重试
          </button>
          。已经入库的经历不受影响。
        </p>
      )}

      {scores.length > 0 && (
        <p style={{ color: "var(--slate)" }}>
          {scores
            .map((e) =>
              e.kind === "match_score_change"
                ? `${e.targetName} ${Math.round(e.from)} → ${Math.round(e.to)}`
                : "",
            )
            .join(" · ")}
        </p>
      )}

      {autoDone.map((e) =>
        e.kind === "task_auto_complete" ? (
          <p key={e.taskId} style={{ color: "var(--proof)" }}>
            行动「{e.title}」因数据补齐自动完成了
          </p>
        ) : null,
      )}
    </div>
  );
}
