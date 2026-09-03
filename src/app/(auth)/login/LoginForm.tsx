"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { LogoWordmark } from "@/components/layout/Logo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LEN = 6;
const MIN_PASSWORD = 8;

// signin：已注册用户，邮箱 + 密码直接进
// signup：没注册过，先验邮箱（验证码）再设密码
// reset ：忘了密码，同样先验邮箱再设新密码
type Mode = "signin" | "signup" | "reset";

export function LoginForm({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  // signup / reset 的第二步：已发出验证码，等用户填码 + 设密码
  const [awaitingCode, setAwaitingCode] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function switchMode(next: Mode) {
    setMode(next);
    setAwaitingCode(false);
    setPassword("");
    setCode("");
    setFieldError(null);
    setCooldown(0);
  }

  function clearError() {
    if (fieldError) setFieldError(null);
  }

  // —— 已注册：邮箱 + 密码 ——
  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setFieldError("这个邮箱看起来不太对");
    if (!password) return setFieldError("填一下密码");
    setFieldError(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) return setFieldError(mapSignInError(error.message));
    router.push("/app");
    router.refresh();
  }

  // —— 没注册 / 忘密码：先发验证码验邮箱 ——
  async function sendCode(silent = false) {
    if (!EMAIL_RE.test(email)) return setFieldError("这个邮箱看起来不太对");
    setFieldError(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      // 注册允许建号；重置密码只发给已存在的账号
      options: { shouldCreateUser: mode === "signup" },
    });
    setBusy(false);
    if (error) return setFieldError(mapSendError(error.message, mode));
    if (!silent) setAwaitingCode(true);
    setCooldown(60);
  }

  // —— 验码 + 设密码，一步完成 ——
  async function verifyAndSetPassword(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length !== CODE_LEN)
      return setFieldError(`验证码是 ${CODE_LEN} 位`);
    if (password.length < MIN_PASSWORD)
      return setFieldError(`密码至少 ${MIN_PASSWORD} 位`);
    setFieldError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (otpError) {
      setBusy(false);
      return setFieldError(mapVerifyError(otpError.message));
    }
    // 验证码换到 session 后，把密码设上，之后就能直接用密码登录
    const { error: pwError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (pwError) return setFieldError("密码没设成功，换一个再试试");
    router.push("/app");
    router.refresh();
  }

  const title =
    mode === "signin" ? "登录" : mode === "signup" ? "注册" : "重设密码";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="absolute left-6 top-6">
        <LogoWordmark tone="ink" height={22} />
      </div>
      <ProofDecor />

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoWordmark tone="ink" height={46} priority />
          <p className="mt-3 text-[14px]" style={{ color: "var(--slate)" }}>
            让你的经历真正产生价值
          </p>
        </div>

        {expired && !awaitingCode && (
          <div
            className="mb-4 rounded-btn px-4 py-3 text-[13px]"
            style={{ background: "var(--warn-soft)", color: "var(--ink)" }}
          >
            链接过期了，重新发一封吧
          </div>
        )}

        {/* 登录 / 注册 切换。重设密码不占 tab，从登录页入口进 */}
        {mode !== "reset" && !awaitingCode && (
          <div
            className="mb-5 flex rounded-btn p-1"
            style={{ background: "var(--line-soft)" }}
          >
            <Tab active={mode === "signin"} onClick={() => switchMode("signin")}>
              登录
            </Tab>
            <Tab active={mode === "signup"} onClick={() => switchMode("signup")}>
              注册
            </Tab>
          </div>
        )}

        {awaitingCode ? (
          <form onSubmit={verifyAndSetPassword} noValidate>
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
                  验证码已发到 {email}
                </div>
              </div>
              <p className="mt-2 text-[13px]" style={{ color: "var(--slate)" }}>
                15 分钟内有效。没收到就看看垃圾箱，或者重发一次。
              </p>
            </div>

            <Field label="验证码" htmlFor="code" className="mt-5">
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LEN}
                placeholder="6 位数字"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  clearError();
                }}
                className={inputCls}
                style={inputStyle(!!fieldError)}
              />
            </Field>

            <Field
              label={mode === "signup" ? "设置密码" : "新密码"}
              htmlFor="new-password"
              className="mt-4"
            >
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                placeholder={`至少 ${MIN_PASSWORD} 位`}
                value={password}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={(v) => {
                  setPassword(v);
                  clearError();
                }}
                invalid={!!fieldError}
              />
            </Field>

            <ErrorText>{fieldError}</ErrorText>

            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
              {busy ? "处理中…" : mode === "signup" ? "完成注册" : "重设密码"}
            </Button>

            <div className="mt-4 flex items-center justify-center gap-3 text-[13px]">
              <button
                type="button"
                onClick={() => void sendCode(true)}
                disabled={cooldown > 0 || busy}
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
                onClick={() => switchMode(mode)}
                className="underline underline-offset-2"
                style={{ color: "var(--slate)" }}
              >
                换个邮箱
              </button>
            </div>
          </form>
        ) : mode === "signin" ? (
          <form onSubmit={signIn} noValidate>
            <Field label="邮箱" htmlFor="email">
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                className={inputCls}
                style={inputStyle(!!fieldError)}
              />
            </Field>

            <Field label="密码" htmlFor="password" className="mt-4">
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="输入密码"
                value={password}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={(v) => {
                  setPassword(v);
                  clearError();
                }}
                invalid={!!fieldError}
              />
            </Field>

            <ErrorText>{fieldError}</ErrorText>

            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
              {busy ? "登录中…" : "登录"}
            </Button>

            <p
              className="mt-4 text-center text-[13px]"
              style={{ color: "var(--mute)" }}
            >
              还没有账号？{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="underline underline-offset-2"
                style={{ color: "var(--ink)" }}
              >
                去注册
              </button>
              <span className="mx-2" style={{ color: "var(--line)" }}>
                ·
              </span>
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="underline underline-offset-2"
                style={{ color: "var(--slate)" }}
              >
                忘记密码
              </button>
            </p>
          </form>
        ) : (
          // signup / reset 第一步：只要邮箱
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
            noValidate
          >
            {mode === "reset" && (
              <div className="mb-4 text-[14px]" style={{ color: "var(--slate)" }}>
                填注册时用的邮箱，我们发一个验证码给你重设密码。
              </div>
            )}

            <Field label="邮箱" htmlFor="email">
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                className={inputCls}
                style={inputStyle(!!fieldError)}
              />
            </Field>

            <ErrorText>{fieldError}</ErrorText>

            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
              {busy ? "发送中…" : "发送验证码"}
            </Button>

            <p
              className="mt-4 text-center text-[13px]"
              style={{ color: "var(--mute)" }}
            >
              {mode === "signup"
                ? "注册只要验证一次邮箱，之后用密码登录。"
                : ""}
            </p>
            <p className="mt-2 text-center text-[13px]" style={{ color: "var(--mute)" }}>
              已有账号？{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="underline underline-offset-2"
                style={{ color: "var(--ink)" }}
              >
                去登录
              </button>
            </p>
          </form>
        )}
      </div>

      <span className="sr-only">{title}</span>
    </main>
  );
}

/* ---------- 小组件 ---------- */

const inputCls =
  "h-11 w-full rounded-btn px-3.5 text-[14px] outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ink";

function inputStyle(invalid: boolean) {
  return {
    background: "var(--card)",
    border: `1px solid ${invalid ? "var(--danger)" : "var(--line)"}`,
    color: "var(--ink)",
  } as const;
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px]"
        style={{ color: "var(--slate)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  show,
  invalid,
  placeholder,
  autoComplete,
  onChange,
  onToggle,
}: {
  id: string;
  value: string;
  show: boolean;
  invalid: boolean;
  placeholder: string;
  autoComplete: string;
  onChange: (v: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} pr-16`}
        style={inputStyle(invalid)}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px]"
        style={{ color: "var(--mute)" }}
      >
        {show ? "隐藏" : "显示"}
      </button>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-[13px]" style={{ color: "var(--danger)" }}>
      {children}
    </p>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 flex-1 rounded-btn text-[13px] font-medium transition-colors"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--ink)" : "var(--slate)",
        boxShadow: active ? "var(--shadow-1)" : "none",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- 报错文案 ---------- */

function mapSignInError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "邮箱或密码不对。没注册过的话，先去注册";
  if (m.includes("email not confirmed")) return "邮箱还没验证，先去注册流程验一下";
  if (m.includes("rate limit") || m.includes("too many"))
    return "太频繁了，等一会儿再试";
  return "登录没成功，再试一次";
}

function mapSendError(msg: string, mode: Mode): string {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many"))
    return "太频繁了，等一会儿再试";
  if (m.includes("signups not allowed") || m.includes("user not found"))
    return mode === "reset" ? "这个邮箱还没注册过" : "没发出去，再试一次";
  return "没发出去，再试一次";
}

function mapVerifyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("expired")) return "验证码过期了，重新发一封吧";
  return "验证码不对，再看看邮件";
}

/* ---------- 装饰 ---------- */

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
        <circle cx="110" cy="200" r="46" fill="none" stroke="var(--proof)" strokeWidth="6" />
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
