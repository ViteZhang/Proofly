// =============================================================
// Proofly · 文档解析
//
// 目标只有一个：把上传的文件变成一段可靠的纯文本。
// 不做总结、不做改写——那是 Pass 2 的事，这里多一个字都是幻觉的入口。
//
// 服务端专用：依赖 mammoth / unpdf / @napi-rs/canvas 与 callLLM。
// =============================================================

import { callLLM } from "@/lib/llm";

export type ParseKind = "text" | "docx" | "pdf_text" | "pdf_scan" | "image";

export type ParseOutcome =
  | {
      ok: true;
      text: string;
      kind: ParseKind;
      pages: number | null;
      /** 需要在界面上说清楚的事，比如「这个 PDF 是扫描件，走图像识别，会慢一点」 */
      note: string | null;
    }
  | { ok: false; error: string };

// 认得的扩展名。列表要和报错文案里的一致，别让用户猜。
const TEXT_EXT = ["md", "markdown", "txt", "text"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif"];
export const SUPPORTED_HINT = "支持 .md .txt .docx .pdf，以及 .png .jpg .webp 图片";

// 抽出的字符数 ÷ 页数低于这个值，就当扫描件或复杂排版处理。
const SCAN_THRESHOLD = 100;

// 扫描件逐页过视觉模型，页数多了又慢又贵。超过就先认下这些页，并说清楚。
const MAX_SCAN_PAGES = 40;

// 逐页识别的并发。和 Pass 2 一样是 3，别把中转站打挂。
const PAGE_CONCURRENCY = 3;

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

export async function parseDocument(
  bytes: Uint8Array,
  filename: string,
): Promise<ParseOutcome> {
  const ext = extensionOf(filename);

  if (TEXT_EXT.includes(ext)) {
    const text = new TextDecoder("utf-8").decode(bytes).trim();
    return text === ""
      ? { ok: false, error: "这个文件是空的" }
      : { ok: true, text, kind: "text", pages: null, note: null };
  }

  if (ext === "docx") return parseDocx(bytes);
  if (ext === "pdf") return parsePdf(bytes);
  if (IMAGE_EXT.includes(ext)) return parseImage(bytes, ext);

  if (ext === "doc") {
    return {
      ok: false,
      error: `.doc 是旧版 Word 格式，读不了。用 Word 另存为 .docx 再传。${SUPPORTED_HINT}`,
    };
  }
  return {
    ok: false,
    error: `不认识 .${ext || "（没有扩展名）"} 这种格式。${SUPPORTED_HINT}`,
  };
}

// ---- docx ----

async function parseDocx(bytes: Uint8Array): Promise<ParseOutcome> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    const text = value.trim();
    return text === ""
      ? { ok: false, error: "这个 .docx 里没有文字" }
      : { ok: true, text, kind: "docx", pages: null, note: null };
  } catch (e) {
    return { ok: false, error: `.docx 读不开：${message(e)}` };
  }
}

// ---- pdf ----

async function parsePdf(bytes: Uint8Array): Promise<ParseOutcome> {
  let pages: number;
  let text: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const out = await extractText(doc, { mergePages: true });
    pages = out.totalPages;
    text = String(out.text).trim();
  } catch (e) {
    return { ok: false, error: `PDF 读不开：${message(e)}` };
  }

  const perPage = pages > 0 ? text.length / pages : 0;
  if (perPage >= SCAN_THRESHOLD) {
    return { ok: true, text, kind: "pdf_text", pages, note: null };
  }

  // 文字太少 —— 要么是扫描件，要么是排版复杂到抽不出来。转图片走视觉模型。
  return parseScannedPdf(bytes, pages);
}

async function parseScannedPdf(
  bytes: Uint8Array,
  pages: number,
): Promise<ParseOutcome> {
  const count = Math.min(pages, MAX_SCAN_PAGES);
  let render: typeof import("unpdf").renderPageAsImage;
  try {
    ({ renderPageAsImage: render } = await import("unpdf"));
  } catch (e) {
    return { ok: false, error: `PDF 转图片失败：${message(e)}` };
  }

  const pageTexts = new Array<string>(count).fill("");
  const failed: number[] = [];

  await inBatches(count, PAGE_CONCURRENCY, async (i) => {
    const pageNo = i + 1;
    try {
      const png = await render(new Uint8Array(bytes), pageNo, {
        scale: 2,
        canvasImport: () => import("@napi-rs/canvas"),
      });
      const r = await ocrImage(Buffer.from(png).toString("base64"), pageNo);
      if (r === null) failed.push(pageNo);
      else pageTexts[i] = r;
    } catch {
      failed.push(pageNo);
    }
  });

  const text = pageTexts.filter((t) => t !== "").join("\n\n").trim();
  if (text === "") {
    return { ok: false, error: "这个 PDF 逐页识别下来一个字也没认出来" };
  }

  const notes = [`这个 PDF 是扫描件，走图像识别，会慢一点。已认 ${count} 页。`];
  if (pages > MAX_SCAN_PAGES) {
    notes.push(`原文共 ${pages} 页，只认了前 ${MAX_SCAN_PAGES} 页。`);
  }
  if (failed.length > 0) {
    notes.push(`第 ${failed.sort((a, b) => a - b).join("、")} 页没认出来。`);
  }
  return { ok: true, text, kind: "pdf_scan", pages, note: notes.join("") };
}

// ---- 图片 ----

async function parseImage(bytes: Uint8Array, ext: string): Promise<ParseOutcome> {
  const mime = ext === "jpg" ? "jpeg" : ext;
  const b64 = `data:image/${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const text = await ocrImage(b64, null);
  if (text === null || text.trim() === "") {
    return { ok: false, error: "这张图里没认出文字" };
  }
  return {
    ok: true,
    text: text.trim(),
    kind: "image",
    pages: 1,
    note: "图片走的是图像识别，认错字比读文本文件多，抽完记得对一眼原文。",
  };
}

// 转写提示词。这里的克制程度直接决定后面幻觉率能不能压到 0：
// 认不出来就留空，绝不能猜一个像样的词填进去。
const OCR_SYSTEM = `你是一个文字转写器。把图片里的文字逐字打出来。

只做转写。不总结、不改写、不补全、不解释、不修正错别字。
认不出的字用 □ 代替，认不出的整行就跳过。宁可缺字，不要猜字。
保留原有的分段与列表结构，去掉页眉页脚与页码。
图片里没有文字就输出空字符串。
只输出转写结果本身，不要任何前后说明。`;

async function ocrImage(
  base64OrDataUrl: string,
  pageNo: number | null,
): Promise<string | null> {
  const r = await callLLM({
    tier: "vision",
    purpose: pageNo === null ? "parse_image" : "parse_pdf_page",
    system: OCR_SYSTEM,
    user: pageNo === null ? "转写这张图里的文字。" : `转写这一页（第 ${pageNo} 页）里的文字。`,
    images: [base64OrDataUrl],
  });
  return r.ok ? r.data : null;
}

// ---- 小工具 ----

// 固定并发跑 n 个任务。没有引入队列库的必要。
async function inBatches(
  n: number,
  concurrency: number,
  run: (i: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, n) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      await run(i);
    }
  });
  await Promise.all(workers);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
