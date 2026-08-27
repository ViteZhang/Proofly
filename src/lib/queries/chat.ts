// =============================================================
// Proofly · 读对话历史
//
// 进页面先取最近 30 条（方案 3.5），往上滚再按游标续取。
// 一律按 created_at 倒序查、正序还给界面。
// =============================================================

import type { ChatMessageView } from "@/lib/chat/message-shape";
import { createClient } from "@/lib/supabase/server";

export type { ChatMessageView };

export const PAGE_SIZE = 30;

export async function loadMessages(before?: string): Promise<ChatMessageView[]> {
  const supabase = await createClient();

  let q = supabase
    .from("chat_messages")
    .select("id, role, kind, content, image_path, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt("created_at", before);

  const { data } = await q;
  return (data ?? [])
    .map((r) => ({
      id: r.id,
      role: r.role,
      kind: r.kind,
      content: r.content ?? "",
      imagePath: r.image_path,
      payload: r.payload,
      createdAt: r.created_at,
    }))
    .reverse();
}
