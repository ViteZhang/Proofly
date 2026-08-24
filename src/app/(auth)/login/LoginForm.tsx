"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { LogoWordmark } from "@/components/layout/Logo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LEN = 6;

export function LoginForm({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
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
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setSending(false);
    if (error) {
      setSendError(
        /rate limit|too many/i.test(error.message)
          ? "太频繁了，等一会儿再试"
          : "没发出去，再试一次",
      );
      return;
    }
    setSent(true);
    setCooldown(60);
  }

  function onSubmitEmail(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setEmailError("这个邮箱看起来不太对"); // 格式错误：不发请求
      return;
    }
    setEmailError(null);
    void send(email);
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (token.length !== CODE_LEN) {
      setCodeError(`验证码是 ${CODE_LEN} 位`);
      return;
    }
    setCodeError(null);
    setVerifying(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setCodeError(
        /expired/i.test(error.message)
          ? "验证码过期了，重新发一封吧"
          : "验证码不对，再看看邮件",
      );
      return;
    }
    router.push("/");
    router.refresh();
  }

  function useAnotherEmail() {
    setSent(false);
    setCode("");
    setCodeError(null);
    setSendError(null);
    setCooldown(0);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* 左上角固定 Logo */}
      <div className="absolute left-6 top-6">
        <LogoWordmark tone="ink" height={22} />
      </div>

      {/* 右下角装饰：四档证明度圆点，整体透明度 6%，不拦截交互 */}
      <ProofDecor />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* 品牌区 */}
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoWordmark tone="ink" height={46} priority />
          <p className="mt-3 text-[14px]" style={{ color: "var(--slate)" }}>
            让你的经历真正产生价值
          </p>
        </div>

        {sent ? (
          <SentCard
            email={email}
            code={code}
            codeError={codeError}
            verifying={verifying}
            sending={sending}
            cooldown={cooldown}
            onCodeChange={(v) => {
              setCode(v);
              if (codeError) setCodeError(null);
            }}
            onSubmit={onSubmitCode}
            onResend={() => void send(email)}
            onUseAnotherEmail={useAnotherEmail}
          />
        ) : (
          <form onSubmit={onSubmitEmail} noValidate>
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
  code,
  codeError,
  verifying,
  sending,
  cooldown,
  onCodeChange,
  onSubmit,
  onResend,
  onUseAnotherEmail,
}: {
  email: string;
  code: string;
  codeError: string | null;
  verifying: boolean;
  sending: boolean;
  cooldown: number;
  onCodeChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onResend: () => void;
  onUseAnotherEmail: () => void;
}) {
  return (
    <div>
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
      </div>

      {/* 也可以直接填邮件里的验证码（同一封邮件里既有链接也有验证码） */}
      <form onSubmit={onSubmit} noValidate className="mt-5">
        <label
          htmlFor="code"
          className="mb-1.5 block text-[13px]"
          style={{ color: "var(--slate)" }}
        >
          或者填邮件里的验证码
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LEN}
          placeholder="6 位数字"
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
          aria-invalid={codeError ? true : undefined}
          className="font-display h-11 w-full rounded-btn px-3.5 text-[16px] tracking-[0.3em] outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ink"
          style={{
            background: "var(--card)",
            border: `1px solid ${codeError ? "var(--danger)" : "var(--line)"}`,
            color: "var(--ink)",
          }}
        />
        {codeError && (
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--danger)" }}>
            {codeError}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          disabled={verifying || code.length !== CODE_LEN}
        >
          {verifying ? "验证中…" : "登录"}
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-center gap-3 text-[13px]">
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || sending}
          className="underline underline-offset-2 disabled:no-underline disabled:opacity-50"
          style={{ color: "var(--ink)" }}
        >
          重新发送
        </button>
        {cooldown > 0 && (
          <span style={{ color: "var(--mute)" }}>{cooldown} 秒后可用</span>
        )}
        <span style={{ color: "var(--line)" }}>·</span>
        <button
          type="button"
          onClick={onUseAnotherEmail}
          className="underline underline-offset-2"
          style={{ color: "var(--slate)" }}
        >
          换个邮箱
        </button>
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
        <circle cx="96" cy="96" r="52" fill="var(--proof)" />
        <circle cx="196" cy="120" r="44" fill="var(--proof)" fillOpacity="0.5" />
        <circle
          cx="110"
          cy="200"
          r="46"
          fill="none"
          stroke="var(--proof)"
          strokeWidth="6"
        />
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
