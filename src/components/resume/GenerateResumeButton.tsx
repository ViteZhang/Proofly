"use client";

// 求职方向页 JD 行上的「生成简历」——三个生成入口里的主路径。
// 基线没锁定时这里不做前置判断，直接调，让服务端给出那句「先锁定基线」：
// 前端再判一次就有两处规则，两处规则迟早会不一致。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useBillingFeedback } from "@/components/billing/BillingFeedback";
import { CreditCost } from "@/components/billing/CreditTag";
import { ACTION_PRICES } from "@/config/plan";
import { Button } from "@/components/ui/Button";
import { generateVersion } from "@/app/app/resume/version-actions";

export function GenerateResumeButton({ jdId }: { jdId: string }) {
  const feedback = useBillingFeedback();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await generateVersion(jdId);
            if (!r.ok) {
              feedback.report("生成投递版本", r);
              setError(r.code === "INSUFFICIENT" ? null : r.error);
              return;
            }
            router.push(`/app/resume/${r.data.versionId}`);
          });
        }}
      >
        {busy ? "生成中…" : "生成简历"}
        {!busy && <CreditCost credits={ACTION_PRICES.resume_delta} />}
      </Button>
      {feedback.node}
      {error && (
        <p className="mt-2 w-full text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </>
  );
}
