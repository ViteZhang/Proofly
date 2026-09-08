"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { backfillEmployments } from "@/app/app/profile/actions";

/**
 * 从经历库整理一份履历草稿。
 *
 * 结果一定要人再看一遍，所以这里的成功文案说的是「整理出 N 段，起止时间
 * 要逐条核对」，而不是「整理完成」—— 后者会让人以为可以直接用了。
 */
export function BackfillButton({ compact = false }: { compact?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, run] = useTransition();

  function go() {
    setMsg(null);
    run(async () => {
      const res = await backfillEmployments();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setMsg(
        res.data.created === 0
          ? "经历库里没有能整理成履历的公司，手动加一条吧"
          : `整理出 ${res.data.created} 段，挂上了 ${res.data.linked} 条经历。起止时间要逐条核对 —— 聚合出来的日期只算到「有项目可写」的那几个月。`,
      );
    });
  }

  return (
    <div className={compact ? "" : "mt-3 text-center"}>
      <Button size="sm" variant="secondary" disabled={pending} onClick={go}>
        {pending ? "整理中…" : "从经历库整理"}
      </Button>
      {msg && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--slate)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}
