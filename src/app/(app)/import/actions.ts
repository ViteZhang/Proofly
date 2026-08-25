"use server";

import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/domain";
import { SUPPORTED_HINT, extensionOf, parseDocument } from "@/lib/parse";
import { createClient } from "@/lib/supabase/server";

// 上传本身由浏览器直传 Storage（避开 Server Action 的请求体上限），
// 这里只负责：把文件读回来解析，落 source_docs。

const registerSchema = z.object({
  storagePath: z.string().min(1),
  filename: z.string().min(1).max(300),
});

export type UploadSummary = {
  sourceDocId: string;
  filename: string;
  kind: string;
  pages: number | null;
  chars: number;
  note: string | null;
  preview: string;
};

const KIND_LABEL: Record<string, string> = {
  text: "纯文本",
  docx: "Word 文档",
  pdf_text: "文本型 PDF",
  pdf_scan: "扫描件 PDF",
  image: "图片",
};

export async function registerUpload(
  input: z.input<typeof registerSchema>,
): Promise<ActionResult<UploadSummary>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail("上传信息不完整，重新传一次");
  const { storagePath, filename } = parsed.data;

  const supabase = await createClient();

  const { data: blob, error: dlError } = await supabase.storage
    .from("source-docs")
    .download(storagePath);
  if (dlError || !blob) {
    return fail(`文件存进去了但读不回来：${dlError?.message ?? "未知原因"}`);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = await parseDocument(bytes, filename);

  if (!result.ok) {
    // 解析失败就把文件删掉，别在桶里留一堆读不了的东西
    await supabase.storage.from("source-docs").remove([storagePath]);
    return fail(result.error);
  }

  const { data: row, error } = await supabase
    .from("source_docs")
    .insert({
      filename,
      storage_path: storagePath,
      doc_type: result.kind,
      parsed_text: result.text,
    })
    .select("id")
    .single();

  if (error || !row) {
    return fail(`解析出来了但没存住：${error?.message ?? "未知原因"}`);
  }

  return ok({
    sourceDocId: row.id,
    filename,
    kind: KIND_LABEL[result.kind] ?? result.kind,
    pages: result.pages,
    chars: result.text.length,
    note: result.note,
    preview: result.text.slice(0, 1200),
  });
}

// 客户端在直传前先问一句：这个扩展名认不认。
// 认不了就别浪费一次上传，直接说清楚支持哪些。
export async function checkExtension(filename: string): Promise<ActionResult<null>> {
  const ext = extensionOf(filename);
  const known = ["md", "markdown", "txt", "text", "docx", "pdf", "png", "jpg", "jpeg", "webp", "gif"];
  if (known.includes(ext)) return ok(null);
  if (ext === "doc") {
    return fail(`.doc 是旧版 Word 格式，读不了。用 Word 另存为 .docx 再传。${SUPPORTED_HINT}`);
  }
  return fail(`不认识 .${ext || "（没有扩展名）"} 这种格式。${SUPPORTED_HINT}`);
}
