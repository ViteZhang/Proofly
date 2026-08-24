"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/layout/Logo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 注册开启了邮箱确认时，signUp 不返回 session，需提示去邮箱点确认
  const [confirmSent, setConfirmSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setFieldError(null);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setFieldError("这个邮箱看起来不太对");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setFieldError(`密码至少 ${MIN_PASSWORD} 位`);
      return;
    }
    setFieldError(null);
    setFormError(null);
    setBusy(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setFormError(mapSignInError(error.message));
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    // 注册
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setFormError(mapSignUpError(error.message));
      return;
    }
    if (data.session) {
      // Confirm email 关闭：注册即登录
      router.push("/");
      router.refresh();
      return;
    }
    // Confirm email 开启：等用户去邮箱确认
    setConfirmSent(true);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* 左上角固定 Logo */}
      <div className="absolute left-6 top-6 flex items-center gap-2">
        <LogoMark size={20} />
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Proofly
        </span>
      </div>

      {/* 右下角装饰：四档证明度圆点 */}
      <ProofDecor />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* 品牌区 */}
        <div className="mb-8 text-center">
          <div className="mb-2 flex justify-center">
            <LogoMark size={44} />
          </div>
          <div className="font-display text-[34px] font-semibold tracking-tight">
            Proofly
          </div>
          <p className="mt-1 text-[14px]" style={{ color: "var(--slate)" }}>
            让你的经历真正产生价值
          </p>
        </div>

        {confirmSent ? (
          <ConfirmCard email={email} />
        ) : (
          <>
            {/* 登录 / 注册 切换 */}
            <div
              className="mb-5 flex rounded-btn p-1"
              style={{ background: "var(--line-soft)" }}
            >
              <TabButton
                active={mode === "signin"}
                onClick={() => switchMode("signin")}
              >
                登录
              </TabButton>
              <TabButton
                active={mode === "signup"}
                onClick={() => switchMode("signup")}
              >
                注册
              </TabButton>
            </div>

            <form onSubmit={onSubmit} noValidate>
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
                  if (fieldError) setFieldError(null);
                  if (formError) setFormError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                className="h-11 w-full rounded-btn px-3.5 text-[14px] outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ink"
                style={{
                  background: "var(--card)",
                  border: `1px solid ${fieldError ? "var(--danger)" : "var(--line)"}`,
                  color: "var(--ink)",
                }}
              />

              <label
                htmlFor="password"
                className="mb-1.5 mt-4 block text-[13px]"
                style={{ color: "var(--slate)" }}
              >
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={mode === "signup" ? `至少 ${MIN_PASSWORD} 位` : "输入密码"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldError) setFieldError(null);
                    if (formError) setFormError(null);
                  }}
                  className="h-11 w-full rounded-btn pl-3.5 pr-16 text-[14px] outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ink"
                  style={{
                    background: "var(--card)",
                    border: `1px solid ${fieldError ? "var(--danger)" : "var(--line)"}`,
                    color: "var(--ink)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px]"
                  style={{ color: "var(--mute)" }}
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </div>

              {fieldError && (
                <p className="mt-1.5 text-[13px]" style={{ color: "var(--danger)" }}>
                  {fieldError}
                </p>
              )}
              {formError && (
                <p className="mt-1.5 text-[13px]" style={{ color: "var(--danger)" }}>
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="mt-5 w-full"
                disabled={busy}
              >
                {busy
                  ? mode === "signin"
                    ? "登录中…"
                    : "注册中…"
                  : mode === "signin"
                    ? "登录"
                    : "注册"}
              </Button>

              <p
                className="mt-4 text-center text-[13px]"
                style={{ color: "var(--mute)" }}
              >
                {mode === "signin" ? (
                  <>
                    还没有账号？{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="underline underline-offset-2"
                      style={{ color: "var(--ink)" }}
                    >
                      去注册
                    </button>
                  </>
                ) : (
                  <>
                    已有账号？{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="underline underline-offset-2"
                      style={{ color: "var(--ink)" }}
                    >
                      去登录
                    </button>
                  </>
                )}
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function TabButton({
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

function ConfirmCard({ email }: { email: string }) {
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
          确认邮件已发到 {email}
        </div>
      </div>
      <p className="mt-2 text-[13px]" style={{ color: "var(--slate)" }}>
        点开邮件里的链接完成注册，然后回来登录。没收到就看看垃圾箱。
      </p>
    </div>
  );
}

// Supabase 英文报错 → 中文文案
function mapSignInError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "邮箱或密码不对";
  if (m.includes("email not confirmed")) return "邮箱还没确认，先去邮件里点确认链接";
  if (m.includes("rate limit")) return "太频繁了，等一会儿再试";
  return "登录没成功，再试一次";
}

function mapSignUpError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered"))
    return "这个邮箱已经注册过了，直接登录吧";
  if (m.includes("password")) return `密码至少 ${MIN_PASSWORD} 位`;
  if (m.includes("rate limit")) return "太频繁了，等一会儿再试";
  return "注册没成功，再试一次";
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
