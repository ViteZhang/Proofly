"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createAtom } from "@/app/(app)/library/actions";

// 新建一条经历（project），建完直接跳过去开编辑态。
export function NewAtomButton({
  label,
  variant = "secondary",
  className,
  sortOrder = 0,
}: {
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
  sortOrder?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    start(async () => {
      const res = await createAtom({
        title: "未命名经历",
        level: "project",
        parent_id: null,
        context: "employment",
        org: null,
        role: null,
        period_start: null,
        period_end: null,
        status: "concept",
        situation: null,
        task: null,
        actions: [],
        sort_order: sortOrder,
      });
      if (res.ok) router.push(`/library?atom=${res.data.id}&edit=1`, { scroll: false });
      else setError(res.error);
    });
  }

  return (
    <>
      <Button variant={variant} size="sm" className={className} onClick={create} disabled={pending}>
        {pending ? "正在新建…" : label}
      </Button>
      {error && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </>
  );
}
