"use server";

import { z } from "zod";

import { billedAction, idempotencyKey } from "@/lib/billing/action";
import { estimateSegments, quoteParse, type ParseQuote } from "@/lib/billing/estimate";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { getBalance } from "@/lib/queries/billing";
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
  /** 解析这份文档预计消耗多少分，逐项可核对（交互方案 2.2） */
  quote: ParseQuote;
  /** 当前余额，用来显示「余额 156 → 120」 */
  balance: number;
};

const KIND_LABEL: Record<string, string> = {
  text: "纯文本",
  docx: "Word 文档",
  pdf_text: "文本型 PDF",
  pdf_scan: "扫描件 PDF",
  image: "图片",
};

/**
 * 上传后的预扫。
 *
 * 计费上这一步记 bundled：它确实烧 token（扫描件要逐页过视觉模型），
 * 但它的成本已经算在「解析文档」的标价里，不单独收费。真正的预扣发生
 * 在用户看过预估、点了「开始解析」之后（见 job-actions.startJob）。
 *
 * **已知敞口**：扫描件的逐页识别发生在这一步，也就是在用户确认之前。
 * 用户传完就走人的话，这次识别的钱我们自己吃。要堵住得把识别挪到确认
 * 之后 —— 那是 Step 2 的结构调整，不在 C2「只加计费包装」的范围里。
 */
export async function registerUpload(
  input: z.input<typeof registerSchema>,
): Promise<ActionResult<UploadSummary>> {
  return billedAction({
    actionCode: "doc_parse_base",
    bundled: true,
    idempotencyKey: idempotencyKey("doc_parse:probe", [input.storagePath]),
    run: () => runRegisterUpload(input),
  });
}

async function runRegisterUpload(
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

  // 扫描件按页计价。页数只有这一刻手上有，结算时文件早不在了。
  const scanPages = result.kind === "pdf_scan" ? (result.pages ?? 0) : 0;

  const { data: row, error } = await supabase
    .from("source_docs")
    .insert({
      filename,
      storage_path: storagePath,
      doc_type: result.kind,
      parsed_text: result.text,
      scan_pages: scanPages,
    })
    .select("id")
    .single();

  if (error || !row) {
    return fail(`解析出来了但没存住：${error?.message ?? "未知原因"}`);
  }

  const balance = await getBalance();

  return ok({
    sourceDocId: row.id,
    filename,
    kind: KIND_LABEL[result.kind] ?? result.kind,
    pages: result.pages,
    chars: result.text.length,
    note: result.note,
    preview: result.text.slice(0, 1200),
    quote: quoteParse(estimateSegments(result.text), scanPages),
    balance: balance.available,
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
