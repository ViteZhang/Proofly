"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  getJobProgress,
  restartJob,
  retryOne,
  type JobProgress,
} from "@/app/(app)/import/job-actions";

const POLL_MS = 2000;

export function JobProgressPanel({
  jobId,
  onSettled,
}: {
  jobId: string;
  onSettled?: (p: JobProgress) => void;
}) {
  const [p, setP] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settledSent = useRef(false);

  // 重试 / 重来会把作业推回 extracting，但那时轮询已经停了。
  // 用一个计数把 effect 重新点着，否则界面会一直停在旧数字上。
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      const r = await getJobProgress(jobId);
      if (!alive) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setP(r.data);
      if (r.data.settled && !settledSent.current) {
        settledSent.current = true;
        onSettled?.(r.data);
      }
      // 跑完就停下来，别一直问
      if (!r.data.settled) timer = setTimeout(() => void tick(), POLL_MS);
    }

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onSettled, nonce]);

  async function again(fn: () => Promise<unknown>) {
    settledSent.current = false;
    await fn();
    setNonce((n) => n + 1);
  }

  if (error) {
    return (
      <p className="text-[13.5px]" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  }
  if (!p) {
    return (
      <p className="text-[13.5px]" style={{ color: "var(--mute)" }}>
        正在通读文档…
      </p>
    );
  }

  const failed = p.candidates.filter((c) => c.state === "failed");
  const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
  // Pass 1 挂了：没有候选，也不在跑
  const dead = p.errorMessage !== null && p.total === 0;

  return (
    <div
      className="rounded-card p-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium">{p.headline}</p>
        {!p.settled && p.total > 0 && (
          <span className="shrink-0 font-mono text-[12px]" style={{ color: "var(--mute)" }}>
            {pct}%
          </span>
        )}
      </div>

      {p.total > 0 && (
        <div
          className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: "var(--line)" }}
        >
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${pct}%`, background: "var(--ink)" }}
          />
        </div>
      )}

      {dead ? (
        <div className="mt-3">
          <p className="text-[13.5px]" style={{ color: "var(--danger)" }}>
            {p.errorMessage}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void again(() => restartJob(jobId))}
          >
            重新抽一次
          </Button>
        </div>
      ) : (
        failed.length > 0 && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            <p className="text-[13px]" style={{ color: "var(--slate)" }}>
              有 {failed.length} 条没抽出来。其他条不受影响，这几条可以单独再试。
            </p>
            <ul className="mt-2 space-y-1.5">
              {failed.map((c) => (
                <li key={c.index} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[13px]">
                    <span className="truncate font-medium">{c.title || `第 ${c.index} 条`}</span>
                    {c.error && (
                      <span className="ml-2" style={{ color: "var(--mute)" }}>
                        {c.error}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="text"
                    size="sm"
                    className="shrink-0 !px-0"
                    onClick={() => void again(() => retryOne(jobId, c.index))}
                  >
                    再试一次
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
