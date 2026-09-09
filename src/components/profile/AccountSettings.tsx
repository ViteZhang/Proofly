"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { saveAccountSettings } from "@/app/app/account/settings/actions";
import { AVATAR_COLORS, avatarCss } from "@/lib/profile/avatars";
import { inputClass, inputStyle } from "./Drawer";

export function AccountSettings({
  displayName,
  avatarColor,
  resumeName,
  fallbackInitial,
}: {
  displayName: string | null;
  avatarColor: string | null;
  /** 档案里的姓名，也就是简历上真正会印的那个。 */
  resumeName: string | null;
  fallbackInitial: string;
}) {
  const [name, setName] = useState(displayName ?? "");
  const [color, setColor] = useState(avatarColor ?? AVATAR_COLORS[0].key);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, run] = useTransition();

  const initial = (name.trim()[0] ?? fallbackInitial).toUpperCase();
  // 两个名字不一样时才提醒。一样的时候这句话是噪音。
  const differs = resumeName !== null && name.trim() !== "" && name.trim() !== resumeName;

  function submit() {
    setError(null);
    setSaved(false);
    run(async () => {
      const res = await saveAccountSettings(name, color);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  return (
    <div
      className="rounded-card px-5 py-5"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-center gap-4">
        <span
          className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-pill text-[21px] font-semibold text-white"
          style={{ background: avatarCss(color) }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-[11.5px] font-medium" style={{ color: "var(--slate)" }}>
            头像底色
          </div>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={`底色 ${c.key}`}
                aria-pressed={c.key === color}
                onClick={() => setColor(c.key)}
                className="h-[26px] w-[26px] rounded-pill transition-transform hover:scale-105"
                style={{
                  background: c.css,
                  boxShadow: c.key === color ? "0 0 0 2px var(--card), 0 0 0 4px var(--ink)" : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: "var(--slate)" }}>
          显示名
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="随便起，只有你自己看得到"
          className={inputClass}
          style={inputStyle}
        />
      </label>

      {/* 只做说明，不做校验、不做拦截。用户想用网名当显示名是他的自由，
          我们要保证的只是他不会因此得到一份印着网名的简历。 */}
      <p className="mt-2 flex gap-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
        <span style={{ color: "var(--warn)", fontWeight: 700 }}>·</span>
        <span>
          这只是显示用的名字，不会出现在任何简历上。
          {differs ? (
            <>
              简历上印的是{" "}
              <b style={{ color: "var(--ink)" }}>{resumeName}</b>，要改去
            </>
          ) : (
            <>简历上印的姓名在</>
          )}{" "}
          <Link href="/app/profile#identity" className="underline">
            基本信息
          </Link>
          。
        </span>
      </p>

      {error && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button disabled={pending} onClick={submit}>
          {pending ? "保存中…" : "保存"}
        </Button>
        {saved && !pending && (
          <span className="text-[12.5px]" style={{ color: "var(--proof)" }}>
            已更新 · 简历姓名没有变
          </span>
        )}
      </div>
    </div>
  );
}
