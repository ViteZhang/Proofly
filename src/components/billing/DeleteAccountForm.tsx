"use client";

// =============================================================
// Proofly · 删除账号
//
// 两道门：先点一次「我要删除」，再手打一遍自己的邮箱。
// 删除不可恢复，多这一步比事后道歉便宜得多。
//
// 未使用的积分不退，这句必须写在确认页上而不只写在条款里 ——
// 条款是签之前看的，这一刻才是他真的要做决定的时候。
// =============================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteAccount } from "@/app/app/account/delete/actions";
import { Button } from "@/components/ui/Button";

export function DeleteAccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="mt-6 rounded-card p-5" style={{ background: "var(--card)" }}>
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
        删除之后，你的经历库、简历、面试题包、消费记录会全部清除，
        <b className="font-semibold" style={{ color: "var(--ink)" }}>
          不可恢复
        </b>
        ，我们这边也找不回来。
      </p>
      <p className="mt-2.5 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
        账上<b className="font-semibold" style={{ color: "var(--ink)" }}>未使用的积分不予退还</b>。
        如果还有没用完的购买积分并且想退款，请先联系我们办理，再回来删除。
      </p>

      <p className="mt-3.5 text-[13px]">
        <Link href="/app/account/export" style={{ color: "var(--proof)" }}>
          先导出我的数据 →
        </Link>
      </p>

      {!armed ? (
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setArmed(true);
            setError(null);
          }}
        >
          我要删除账号
        </Button>
      ) : (
        <div className="mt-4">
          <label className="mb-2 block text-[12.5px]" style={{ color: "var(--slate)" }}>
            输入 <b className="font-display">{email}</b> 确认
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={email}
            className="w-full rounded-btn px-3.5 py-2.5 outline-none"
            style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setArmed(false);
                setTyped("");
              }}
              disabled={busy}
            >
              算了
            </Button>
            <button
              type="button"
              disabled={busy || typed.trim() === ""}
              className="inline-flex h-9 items-center rounded-btn px-4 text-[13.5px] font-medium disabled:opacity-50"
              style={{ background: "var(--danger)", color: "#fff" }}
              onClick={() => {
                setError(null);
                start(async () => {
                  const r = await deleteAccount(typed);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  router.push("/");
                });
              }}
            >
              {busy ? "正在删除…" : "永久删除"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
