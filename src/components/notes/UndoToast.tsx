"use client";

// =============================================================
// Proofly · 入库后的撤销条
//
// 六秒倒计时以服务端给的 expires_at 为准，不以点下去那一刻为准 ——
// 网络慢一点，客户端自己数的六秒就会比服务端的窗口长，
// 于是按钮还在、点下去却被接口拒了。那种「明明还能点」最伤人。
// =============================================================

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

export function UndoToast({
  text,
  expiresAt,
  busy,
  onUndo,
  onExpire,
}: {
  text: string;
  expiresAt: string;
  busy: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    const id = setInterval(() => {
      const n = remaining(expiresAt);
      setLeft(n);
      if (n <= 0) onExpire();
    }, 250);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  if (left <= 0) return null;

  return (
    <div
      className="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-pill px-4 py-2.5 shadow-3"
      style={{ background: "var(--ink)", color: "#fff" }}
      role="status"
    >
      <span className="text-[14px]">{text}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={onUndo}
        className="!h-7"
      >
        撤销 {left}s
      </Button>
    </div>
  );
}

function remaining(expiresAt: string): number {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 1000));
}
