"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  discardJob,
  getJobProgress,
  restartJob,
  resumeJob,
  retryOne,
  type JobProgress,
} from "@/app/app/import/job-actions";

const POLL_MS = 2000;

// 连着问不到才算断。单次网络抖动就停掉轮询，界面会停在旧数字上不动——
// 那正是「卡住了」最难查的一种样子。
const MAX_MISSES = 3;

export function JobProgressPanel({
  jobId,
  onSettled,
  onDiscard,
}: {
  jobId: string;
  onSettled?: (p: JobProgress) => void;
  onDiscard?: () => void;
}) {
  const [p, setP] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settledSent = useRef(false);

  // 后台作业跑在 after() 里，进程一没（热重载、重启、崩溃）活就没人接了。
  // 作业会一直标着 extracting，进度停住，还不报错。发现了先自己续一次；
  // 续过还断，就交给使用者决定，别在后台反复烧钱。
  const triedResume = useRef(false);
  const [resumed, setResumed] = useState<"no" | "once" | "stuck">("no");

  // 重试 / 重来会把作业推回 extracting，但那时轮询已经停了。
  // 用一个计数把 effect 重新点着，否则界面会一直停在旧数字上。
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let misses = 0;

    const again = () => {
      if (alive) timer = setTimeout(() => void tick(), POLL_MS);
    };

    async function tick() {
      let r;
      try {
        r = await getJobProgress(jobId);
      } catch {
        // 抛出来的（网络断了、服务端重启了）跟返回失败一样对待，
        // 但不能让它把 tick 的 promise 拒掉——那样轮询就再也接不上了。
        r = { ok: false as const, error: "跟服务端断了联系" };
      }
      if (!alive) return;

      if (!r.ok) {
        misses += 1;
        if (misses >= MAX_MISSES) setError(r.error);
        else again();
        return;
      }
      misses = 0;

      setP(r.data);
      if (r.data.settled && !settledSent.current) {
        settledSent.current = true;
        onSettled?.(r.data);
      }

      if (r.data.settled) return; // 跑完就停下来，别一直问

      if (r.data.stalled) {
        if (!triedResume.current) {
          triedResume.current = true;
          setResumed("once");
          await resumeJob(jobId);
        } else {
          setResumed("stuck");
        }
      }
      again();
    }

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onSettled, nonce]);

  async function rerun(fn: () => Promise<unknown>) {
    settledSent.current = false;
    triedResume.current = false;
    setResumed("no");
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

      {resumed !== "no" && !p.settled && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {resumed === "once" ? (
            <p className="text-[13px]" style={{ color: "var(--slate)" }}>
              抽取中途断过一次，已经接着上次继续了。抽好的 {p.current} 条不会重来。
            </p>
          ) : (
            <>
              <p className="text-[13px]" style={{ color: "var(--warn)" }}>
                接着抽了一次还是没动。已经抽好的 {p.current} 条还在，剩下 {p.total - p.current} 条没跑完。
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void rerun(() => resumeJob(jobId))}
                >
                  再接着抽
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => void rerun(() => restartJob(jobId))}
                >
                  从头重来
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => void discardJob(jobId).then(() => onDiscard?.())}
                >
                  放弃这份，换一份传
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {dead ? (
        <div className="mt-3">
          <p className="text-[13.5px]" style={{ color: "var(--danger)" }}>
            {p.errorMessage}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void rerun(() => restartJob(jobId))}
            >
              重新抽一次
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() =>
                void discardJob(jobId).then(() => onDiscard?.())
              }
            >
              放弃这份，换一份传
            </Button>
          </div>
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
                    onClick={() => void rerun(() => retryOne(jobId, c.index))}
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
