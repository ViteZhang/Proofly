"use client";

import { useState } from "react";
import { joinWaitlist } from "@/app/join-actions";

export function JoinForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="done" role="status">
        <b>
          <span className="pd m" />
          记下了
        </b>
        <p>
          轮到你的时候，会往这个邮箱发一封带链接的邮件，点开就能进。除了邀请，我们不会发别的。
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await joinWaitlist(email);
    if (res.ok) {
      setDone(true);
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <>
      <form className="form" onSubmit={submit} noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="邮箱地址"
          autoComplete="email"
          maxLength={254}
          disabled={busy}
        />
        <button type="submit" className="btn big" disabled={busy}>
          {busy ? "提交中" : "申请内测"}
        </button>
      </form>
      {error && <p className="err">{error}</p>}
    </>
  );
}
