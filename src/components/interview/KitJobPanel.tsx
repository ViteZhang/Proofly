"use client";

// =============================================================
// Proofly · 出题作业进度
//
// 进度必须是真实数字：说清楚在哪一步、已经等了多久、已经出了几道。
// 两次大调用，没有更细的刻度可给 —— 那就不假装有，不放假进度条。
//
// 深挖题落库之后这里会先报出「项目深挖 18 道已出」，那十几道题这时
// 已经能在下面看了，不必等案例题。
// =============================================================

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  getKitJobProgress,
  resumeKitJob,
  type KitJobProgress,
} from "@/app/app/interview/job-actions";

const POLL_MS = 4000;

// 连着问不到才算断。单次网络抖动就停掉轮询，界面会停在旧数字上不动 ——
// 那正是「卡住了」最难查的一种样子。
const MAX_MISSES = 3;

export function KitJobPanel({
  kitId,
  onSettled,
}: {
  kitId: string;
  onSettled: (p: KitJobProgress) => void;
}) {
  const [p, setP] = useState<KitJobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const settledSent = useRef(false);
  // 深挖题刚落库那一下要刷一次页面，否则那十几道题在下面看不到。
  const probeShown = useRef(0);
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
        r = await getKitJobProgress(kitId);
      } catch {
        // 抛出来的（网络断了、服务端重启了）跟返回失败一样对待，
        // 但不能让它把 tick 的 promise 拒掉 —— 那样轮询就再也接不上了。
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

      if (r.data.probeCount > probeShown.current) {
        probeShown.current = r.data.probeCount;
        onSettled(r.data);
      }

      if (r.data.settled) {
        if (!settledSent.current) {
          settledSent.current = true;
          onSettled(r.data);
        }
        return; // 停了就别一直问
      }
      again();
    }

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // nonce 用来在「续一次」之后把轮询重新点着
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId, nonce]);

  if (error) {
    return (
      <Box tone="danger">
        <p>{error}</p>
      </Box>
    );
  }
  if (!p) {
    return (
      <Box>
        <p>正在读作业状态…</p>
      </Box>
    );
  }

  const running = p.status === "running" && !p.stalled;

  return (
    <Box tone={p.status === "failed" || p.stalled ? "danger" : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        {running && <Spinner />}
        <p className="min-w-0 flex-1">{p.headline}</p>
        {(p.stalled || p.status === "failed") && (
          <Button
            size="sm"
            variant="secondary"
            disabled={resuming}
            onClick={() => {
              setResuming(true);
              void resumeKitJob(p.kitId).then(() => {
                setResuming(false);
                settledSent.current = false;
                setNonce((n) => n + 1);
              });
            }}
          >
            {resuming ? "正在重来…" : "重跑一次"}
          </Button>
        )}
      </div>
      {running && (
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--mute)" }}>
          出题是两次大生成，一次十来分钟。可以关掉页面，作业在后台接着跑。
        </p>
      )}
    </Box>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2"
      style={{ borderColor: "var(--line)", borderTopColor: "var(--ink)" }}
    />
  );
}

function Box({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div
      className="mt-3 rounded-card border px-4 py-3 text-[13px]"
      style={{
        borderColor: tone === "danger" ? "var(--danger)" : "var(--line-soft)",
        background: tone === "danger" ? "var(--danger-soft)" : "var(--card)",
      }}
    >
      {children}
    </div>
  );
}
