// =============================================================
// Proofly · 读对话历史
//
// 进页面先取最近 30 条（方案 3.5），往上滚再按游标续取。
// 一律按 created_at 倒序查、正序还给界面。
//
// 图片存在私有桶里，直接给路径前端看不了。签名有有效期，
// 所以每次读消息现签一批，不往库里存 URL——存进去的第二天就是死链。
// =============================================================

import {
  toMessageView,
  type ChatMessageView,
  type ChatMessageRow,
} from "@/lib/chat/message-shape";
import { CHAT_IMAGE_BUCKET } from "@/lib/chat/ocr";
import { obj } from "@/lib/chat/message-shape";
import { createClient } from "@/lib/supabase/server";

export type { ChatMessageView };

export const PAGE_SIZE = 30;
const SIGNED_FOR_SECONDS = 3600;

const COLUMNS = "id, role, kind, content, image_path, payload, created_at";

export async function loadMessages(before?: string): Promise<ChatMessageView[]> {
  const supabase = await createClient();

  let q = supabase
    .from("chat_messages")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt("created_at", before);

  const { data } = await q;
  return signImages(((data ?? []) as ChatMessageRow[]).map(toMessageView).reverse());
}

/**
 * 给带图的消息补上签名 URL。
 *
 * 两处会带图：用户自己贴的那条（image_path 列），和确认卡（payload.image_path）——
 * 卡片上必须能看到原图缩略图，那是图片这条路径唯一的防幻觉手段。
 */
export async function signImages(messages: ChatMessageView[]): Promise<ChatMessageView[]> {
  const paths = new Set<string>();
  for (const m of messages) {
    if (m.imagePath) paths.add(m.imagePath);
    const p = obj(m.payload).image_path;
    if (typeof p === "string" && p !== "") paths.add(p);
  }
  if (paths.size === 0) return messages;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .createSignedUrls([...paths], SIGNED_FOR_SECONDS);

  const url = new Map<string, string>();
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) url.set(s.path, s.signedUrl);
  }

  return messages.map((m) => {
    const p = m.imagePath ?? (typeof obj(m.payload).image_path === "string"
      ? (obj(m.payload).image_path as string)
      : null);
    return p === null ? m : { ...m, imageUrl: url.get(p) ?? null };
  });
}
