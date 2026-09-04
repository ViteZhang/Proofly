"use client";

// =============================================================
// Proofly · 计费的完成反馈（交互方案 3.1、3.2）
//
// 三件事必须让用户看见：
// - 花了多少：「面试题包好了 · 消耗 25 分，余额 131」
// - 退了多少：「没生成成功，25 分已退回，余额还是 156」
//   失败退还必须明说 —— 用户看到的是余额先减后加，不解释他会以为
//   系统在乱扣；明确告知反而证明「失败不扣分」这个承诺真的在执行
// - 没花钱：免费执行时也要说一句，否则免费层的价值感不会自动兑现
//
// 余额不足不只说「不够」，要说清差多少，并提醒免费功能不受影响 ——
// 余额为零时用户最容易觉得产品废了，这一句能显著降低流失。
// =============================================================

import { useCallback, useState } from "react";

import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";

export type BilledOutcome =
  | { ok: true; charged: number; freeReason?: string; balanceAfter: number }
  | {
      ok: false;
      error: string;
      code?: "INSUFFICIENT" | "BLOCKED" | "FAILED" | "CANCELLED";
      required?: number;
      available?: number;
    };

type Toast = { tone: "ok" | "warn"; text: string; onRetry?: () => void };

export function useBillingFeedback() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [short, setShort] = useState<{ label: string; required: number; available: number } | null>(
    null,
  );

  const report = useCallback(
    (label: string, r: BilledOutcome, onRetry?: () => void) => {
      if (r.ok) {
        setToast({
          tone: "ok",
          text:
            r.charged === 0
              ? `${label}好了 · 这次不扣分，余额还是 ${r.balanceAfter}`
              : `${label}好了 · 消耗 ${r.charged} 分，余额 ${r.balanceAfter}`,
        });
        return;
      }
      if (r.code === "INSUFFICIENT") {
        setShort({ label, required: r.required ?? 0, available: r.available ?? 0 });
        return;
      }
      setToast({ tone: "warn", text: r.error, onRetry });
    },
    [],
  );

  const node = (
    <>
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-pill px-4 py-2.5 text-[13px] font-medium shadow-lg"
          style={
            toast.tone === "ok"
              ? { background: "var(--proof-soft)", color: "#0A7355" }
              : { background: "var(--caution-soft, #FFF4E5)", color: "#8A5A00" }
          }
          role="status"
        >
          <span>{toast.text}</span>
          {toast.onRetry && (
            <button
              type="button"
              className="rounded-pill px-2.5 py-1 text-[12px]"
              style={{ background: "var(--card)" }}
              onClick={() => {
                setToast(null);
                toast.onRetry?.();
              }}
            >
              重试
            </button>
          )}
          <button
            type="button"
            aria-label="关闭"
            className="opacity-60"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}

      {short && (
        <Modal
          title="积分不够了"
          onClose={() => setShort(null)}
          footer={
            <Button variant="secondary" onClick={() => setShort(null)}>
              知道了
            </Button>
          }
        >
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
            {short.label}需要 <b className="font-display">{short.required}</b> 分，你还有{" "}
            <b className="font-display">{short.available}</b> 分。
            <br />差 <b className="font-display">{short.required - short.available}</b> 分。
          </p>
          <p
            className="mt-4 pt-3.5 text-[12.5px] leading-relaxed"
            style={{ borderTop: "1px solid var(--line-soft)", color: "var(--slate)" }}
          >
            顺便说一句：<b className="font-semibold">体检、简历评分、行动排序、日常维护</b>
            这些都是免费的，不受影响。
          </p>
        </Modal>
      )}
    </>
  );

  return { report, node };
}
