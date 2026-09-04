"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { redeem } from "@/app/app/account/redeem/actions";
import { Button } from "@/components/ui/Button";

export function RedeemForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<{ credits: number; balance: number } | null>(null);
  const [busy, start] = useTransition();

  function submit() {
    setError(null);
    setOkMsg(null);
    start(async () => {
      const r = await redeem(code);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOkMsg({ credits: r.data.credits, balance: r.data.balanceAfter });
      setCode("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="rounded-card p-5" style={{ background: "var(--card)" }}>
        <label className="mb-2 block text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
          兑换码
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) submit();
          }}
          placeholder="PROOFLY-JOB-XXXXXX"
          className="w-full rounded-btn px-3.5 py-2.5 font-display tracking-wide outline-none"
          style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
        />
        <Button className="mt-3 w-full" onClick={submit} disabled={busy || code.trim() === ""}>
          {busy ? "兑换中…" : "兑换"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {okMsg && (
        <div
          className="mt-3 rounded-card p-5 text-[13.5px] leading-relaxed"
          style={{ background: "var(--proof-soft)", color: "#0A7355" }}
        >
          <b className="font-semibold">
            到账 {okMsg.credits} 分，余额 {okMsg.balance}
          </b>
          <br />
          这批是购买积分，永不过期。
        </div>
      )}
    </>
  );
}
