"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  discardJob,
  getJobProgress,
  restartJob,
  resumeJob,
  retryOne,
  stopJob,
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

  // 一次函数调用装不下整个作业：平台有 maxDuration，管道跑到时间不够就主动
  // 让出，把剩下的候选留给下一次。让出时它会把心跳往回拨，于是下面这段
  // 立刻认领并接着抽——所以「续跑」是常态，不是异常。
  //
  // 只要**还在往前走**就一直续。停在原地的那次续跑才算数：续过一轮
  // 一条都没多抽出来，就别在后台反复烧钱了，交给使用者决定。
  // 记的是「上次发起续跑时已经抽好几条」，-1 表示还没续过。
  const resumedAt = useRef(-1);
  const [resumed, setResumed] = useState<"no" | "once" | "stuck">("no");

  // 点了停之后按钮要立刻变样，不能等下一次轮询——那要 2 秒，
  // 这 2 秒里人会以为没点上，再点一次。
  const [stopping, setStopping] = useState(false);

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
        if (r.data.current > resumedAt.current) {
          resumedAt.current = r.data.current;
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

  // 停：只改状态，不去掐 after() 里那次调用（掐不了）。改完之后轮询下一拍
  // 就会看到终态，界面自己往下走——已经抽好的进校对，一条都没有的回上传区。
  async function stop() {
    setStopping(true);
    await stopJob(jobId);
    setStopping(false);
  }

  async function rerun(fn: () => Promise<unknown>) {
    settledSent.current = false;
    resumedAt.current = -1;
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
        <div className="flex shrink-0 items-baseline gap-3">
          {!p.settled && p.total > 0 && (
            <span className="font-mono text-[12px]" style={{ color: "var(--mute)" }}>
              {pct}%
            </span>
          )}
          {/* 抽取途中一直有退路。以前只有「续跑过一次还是不动」和「Pass 1 挂了」
              两种情况才给按钮，作业跑得慢又没断的时候，人是被关在里面的。 */}
          {!p.settled && (
            <Button
              variant="text"
              size="sm"
              className="!px-0"
              disabled={stopping}
              onClick={() => void stop()}
            >
              {stopping ? "正在停…" : "停下"}
            </Button>
          )}
        </div>
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
              一轮跑不完，正接着上次继续。抽好的 {p.current} 条不会重来。
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
