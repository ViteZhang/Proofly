"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/domain";
import { clearDemoAtoms, seedDemoAtoms } from "./actions";

// 开发工具，切片 1.7 收尾时随本页一起删除。
export function SeedControls() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult<unknown>>, done: string) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? done : res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(seedDemoAtoms, "样例数据已灌入")}
        className="rounded-btn px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
        style={{ background: "var(--ink)" }}
      >
        灌入样例数据
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(clearDemoAtoms, "样例数据已清空")}
        className="rounded-btn px-3 py-1.5 text-[13px] disabled:opacity-50"
        style={{ border: "1px solid var(--line)", color: "var(--slate)" }}
      >
        清空样例数据
      </button>
      {msg && (
        <span className="text-[12.5px]" style={{ color: "var(--slate)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
