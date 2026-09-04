"use client";

// QUERY 回答下面的跳转按钮。回答本身由代码渲染，这里只是把召回到的
// 那几条经历接上——用户看完得能一步点过去核对。

import Link from "next/link";

import type { AnswerLink } from "@/lib/chat/message-shape";

export function AnswerLinks({ links }: { links: AnswerLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.atomId}
          href={`/app/library?atom=${l.atomId}`}
          className="rounded-btn border px-2.5 py-1 text-[12px] transition-colors hover:bg-[var(--line-soft)]"
          style={{ borderColor: "var(--line)", color: "var(--slate)" }}
        >
          去看「{l.title}」
        </Link>
      ))}
    </div>
  );
}
