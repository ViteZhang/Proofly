// =============================================================
// Proofly · 随手记粘贴的图片 → 文字
//
// 不写新的转写提示词：parse/index.ts 里那段已经在 Step 2 用了一整轮，
// 「认不出的字用 □、宁可缺字不要猜字」是它把幻觉压到 0 的原因。
// 聊天里粘的截图和上传的图片是同一件事，没有理由两套措辞。
// =============================================================

import { EMPTY_IMAGE_ERROR, parseDocument } from "@/lib/parse";
import { createClient } from "@/lib/supabase/server";

export const CHAT_IMAGE_BUCKET = "chat-images";

export type OcrOutcome = { text: string; error: string | null };

export async function ocrChatImage(imagePath: string): Promise<OcrOutcome> {
  const supabase = await createClient();
  const { data: blob, error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .download(imagePath);
  if (error || !blob) {
    return { text: "", error: `图存进去了但读不回来：${error?.message ?? "未知原因"}` };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const r = await parseDocument(bytes, filenameOf(imagePath));
  // 图里确实没字不算出错：粘一张风景照只是没什么可记的，
  // 上面那层会问一句「你想记的是哪件事」，而不是弹一个失败。
  if (!r.ok) {
    return r.error === EMPTY_IMAGE_ERROR
      ? { text: "", error: null }
      : { text: "", error: r.error };
  }
  return { text: r.text.trim(), error: null };
}

// 路径是 {user_id}/{uuid}-{原文件名}，parseDocument 靠扩展名选解析器
function filenameOf(path: string): string {
  const last = path.split("/").pop() ?? path;
  return last.replace(/^[0-9a-f-]{36}-/i, "");
}
