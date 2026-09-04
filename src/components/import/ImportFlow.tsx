"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { UploadZone } from "./UploadZone";
import { JobProgressPanel } from "./JobProgressPanel";
import { ParseQuoteDialog } from "./ParseQuoteDialog";
import { startJob, type JobProgress } from "@/app/app/import/job-actions";
import type { UploadSummary } from "@/app/app/import/actions";
import { Button } from "@/components/ui/Button";

export function ImportFlow({
  resumeJobId,
  taskId = null,
}: {
  resumeJobId: string | null;
  /** 从行动清单的回流面板过来时带着的行动 id，入库后要标它完成。 */
  taskId?: string | null;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(resumeJobId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<JobProgress | null>(null);
  // 传完不直接开跑：先把预估明细摆出来让用户核对（交互方案 2.2）。
  const [pendingDoc, setPendingDoc] = useState<UploadSummary | null>(null);
  const [starting, setStarting] = useState(false);

  function onUploaded(s: UploadSummary) {
    setError(null);
    setPendingDoc(s);
  }

  async function confirmParse() {
    if (!pendingDoc) return;
    setStarting(true);
    const r = await startJob(pendingDoc.sourceDocId);
    setStarting(false);
    if (!r.ok) {
      setPendingDoc(null);
      setError(r.error);
      return;
    }
    setPendingDoc(null);
    setJobId(r.data);
  }

  const onSettled = useCallback((p: JobProgress) => setDone(p), []);

  if (jobId) {
    return (
      <div>
        <JobProgressPanel
          jobId={jobId}
          onSettled={onSettled}
          onDiscard={() => {
            setJobId(null);
            setDone(null);
          }}
        />
        {done && (
          <div className="mt-4 flex items-center gap-2">
            {done.draftCount > 0 ? (
              <Button onClick={() => router.push(`/app/import/review/${jobId}${taskId ? `?task=${taskId}` : ""}`)}>
                去确认这 {done.draftCount} 条
              </Button>
            ) : (
              <p className="text-[13.5px]" style={{ color: "var(--slate)" }}>
                这份文档里没有可以入库的经历。换一份试试，或者到经历库手动加一条。
              </p>
            )}
            <Button
              variant="text"
              onClick={() => {
                setJobId(null);
                setDone(null);
              }}
            >
              再传一份
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <UploadZone onDone={onUploaded} />
      {pendingDoc && (
        <ParseQuoteDialog
          summary={pendingDoc}
          pending={starting}
          onCancel={() => setPendingDoc(null)}
          onConfirm={() => void confirmParse()}
        />
      )}
      {error && (
        <p
          className="mt-3 rounded-card px-4 py-3 text-[13.5px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}
    </>
  );
}
