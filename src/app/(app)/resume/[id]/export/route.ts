// =============================================================
// Proofly · Markdown 导出
//
// 直接输出跟屏幕上同一份内容 —— renderMarkdown 是纯函数，预览、
// rendered_md、这里三处走的是同一个函数，不可能对不上。
//
// 有 blocking 问题时不给下载。前端的按钮已经禁用了，这里再拦一次：
// 拿到链接直接敲进地址栏也不行，否则那个禁用就只是装饰。
// =============================================================

import { NextResponse } from "next/server";
import { getPrintDoc } from "@/lib/queries/resume";
import { exportFilename, renderMarkdown } from "@/lib/resume/markdown";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await getPrintDoc(id);
  if (!doc) return new NextResponse("没有这份简历", { status: 404 });
  if (doc.blockingCount > 0) {
    return new NextResponse(
      `还有 ${doc.blockingCount} 处问题必须先解决，导出被拦下了。去 /resume/issues 看看。`,
      { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const md = renderMarkdown({
    name: doc.name,
    contact: doc.contact,
    headline: doc.headline,
    blocks: doc.blocks.map((b) => ({
      section: b.section,
      title: b.title,
      meta: b.meta,
      summary: b.summary,
      bullets: b.bullets,
    })),
    skills: doc.skills,
  });

  const filename = exportFilename(doc.name, doc.roleLabel, "md");
  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // 文件名里有中文，ASCII 那份留个兜底，UTF-8 那份给认得的浏览器。
      "content-disposition": `attachment; filename="resume.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
