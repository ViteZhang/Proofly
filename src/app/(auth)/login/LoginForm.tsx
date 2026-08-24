"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // 重发冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(target: string) {
    setSending(true);
    setSendError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      setSendError("没发出去，再试一次");
      return;
    }
    setSent(true);
    setCooldown(60);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setEmailError("这个邮箱看起来不太对"); // 格式错误：不发请求
      return;
    }
    setEmailError(null);
    void send(email);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* 左上角固定 Logo */}
      <div className="font-display absolute left-6 top-6 text-[17px] font-semibold tracking-tight">
        Proofly
      </div>

      {/* 右下角装饰：四档证明度圆点，整体透明度 6%，不拦截交互 */}
      <ProofDecor />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* 品牌区 */}
        <div className="mb-8 text-center">
          <div className="font-display text-[34px] font-semibold tracking-tight">
            Proofly
          </div>
          <p className="mt-1 text-[14px]" style={{ color: "var(--slate)" }}>
            让你的经历真正产生价值
          </p>
        </div>

        {sent ? (
          <SentCard
            email={email}
            cooldown={cooldown}
            sending={sending}
            onResend={() => void send(email)}
          />
        ) : (
          <form onSubmit={onSubmit} noValidate>
            {expired && (
              <div
                className="mb-4 rounded-btn px-4 py-3 text-[13px]"
                style={{ background: "var(--warn-soft)", color: "var(--ink)" }}
              >
                链接过期了，重新发一封吧
              </div>
            )}

            <label
              htmlFor="email"
              className="mb-1.5 block text-[13px]"
              style={{ color: "var(--slate)" }}
            >
              邮箱
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
                if (sendError) setSendError(null);
              }}
              aria-invalid={emailError ? true : undefined}
              className="h-11 w-full rounded-btn px-3.5 text-[14px] outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ink"
              style={{
                background: "var(--card)",
                border: `1px solid ${emailError ? "var(--danger)" : "var(--line)"}`,
                color: "var(--ink)",
              }}
            />
            {emailError && (
              <p className="mt-1.5 text-[13px]" style={{ color: "var(--danger)" }}>
                {emailError}
              </p>
            )}
            {sendError && (
              <p className="mt-1.5 text-[13px]" style={{ color: "var(--danger)" }}>
                {sendError}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-4 w-full"
              disabled={sending}
            >
              {sending ? "发送中…" : "发送登录链接"}
            </Button>

            <p
              className="mt-4 text-center text-[13px]"
              style={{ color: "var(--mute)" }}
            >
              不用记密码。我们发一封带链接的邮件，点开就进。
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function SentCard({
  email,
  cooldown,
  sending,
  onResend,
}: {
  email: string;
  cooldown: number;
  sending: boolean;
  onResend: () => void;
}) {
  return (
    <div
      className="rounded-card p-5"
      style={{
        background: "var(--proof-soft)",
        border: "1px solid var(--proof-mid)",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 text-[15px]"
          style={{ color: "var(--proof)" }}
        >
          ✓
        </span>
        <div className="text-[14px]" style={{ color: "var(--ink)" }}>
          链接已发到 {email}
        </div>
      </div>
      <p className="mt-2 text-[13px]" style={{ color: "var(--slate)" }}>
        15 分钟内有效。没收到就看看垃圾箱，或者重发一次。
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="secondary"
          size="md"
          onClick={onResend}
          disabled={cooldown > 0 || sending}
        >
          重新发送
        </Button>
        {cooldown > 0 && (
          <span className="text-[13px]" style={{ color: "var(--mute)" }}>
            {cooldown} 秒后可用
          </span>
        )}
      </div>
    </div>
  );
}

// 四档证明度：实心 / 实心半透 / 粗描边 / 虚线描边
function ProofDecor() {
  const base = 120;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-[-40px] right-[-40px] select-none"
      style={{ opacity: 0.06 }}
    >
      <svg width={base * 2.4} height={base * 2.4} viewBox="0 0 288 288">
        {/* 实心 */}
        <circle cx="96" cy="96" r="52" fill="var(--proof)" />
        {/* 实心半透 */}
        <circle cx="196" cy="120" r="44" fill="var(--proof)" fillOpacity="0.5" />
        {/* 粗描边 */}
        <circle
          cx="110"
          cy="200"
          r="46"
          fill="none"
          stroke="var(--proof)"
          strokeWidth="6"
        />
        {/* 虚线描边 */}
        <circle
          cx="206"
          cy="212"
          r="40"
          fill="none"
          stroke="var(--proof)"
          strokeWidth="3"
          strokeDasharray="6 7"
        />
      </svg>
    </div>
  );
}
