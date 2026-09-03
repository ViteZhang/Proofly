"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDeepScanProgress,
  startDeepScan,
  type DeepScanProgress,
} from "@/app/app/health/job-actions";

const POLL_MS = 3000;
const MAX_MISSES = 3;

export function DeepScanPanel({ initialScanId }: { initialScanId: string | null }) {
  const router = useRouter();
  const [scanId, setScanId] = useState<string | null>(initialScanId);
  const [progress, setProgress] = useState<DeepScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const misses = useRef(0);

  useEffect(() => {
    if (!scanId) return;
    let alive = true;

    const tick = async () => {
      const p = await getDeepScanProgress(scanId);
      if (!alive) return;
      if (!p) {
        misses.current += 1;
        if (misses.current >= MAX_MISSES) setScanId(null);
        return;
      }
      misses.current = 0;
      setProgress(p);
      if (p.settled) {
        setScanId(null);
        router.refresh();
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [scanId, router]);

  const start = async () => {
    setStarting(true);
    setError(null);
    const r = await startDeepScan();
    setStarting(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    misses.current = 0;
    setScanId(r.scanId);
  };

  const running = scanId !== null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void start()}
        disabled={running || starting}
        className="rounded-btn px-3 py-1.5 text-[13px] disabled:opacity-50"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        {running ? "深度扫描中…" : "深度扫描"}
      </button>

      {progress && (
        <div className="mt-2 text-[13px]" style={{ color: "var(--slate)" }}>
          {progress.headline}
          {progress.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[12px]" style={{ color: "var(--caution)" }}>
              {progress.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
