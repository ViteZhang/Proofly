// =============================================================
// Proofly · 面试小抄 Markdown 导出
//
// 跟打印页走同一个 buildCheatSheet —— 纯函数，两处不可能对不上。
// =============================================================

import { NextResponse } from "next/server";

import { logFree } from "@/lib/billing/action";
import { getKitById } from "@/lib/queries/interview";
import {
  buildCheatSheet,
  cheatSheetFilename,
  renderCheatSheetMd,
} from "@/lib/interview/cheatsheet";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kitId: string }> },
) {
  const { kitId } = await params;
  const kit = await getKitById(kitId);
  if (!kit) return new NextResponse("没有这份题包", { status: 404 });

  const sheet = buildCheatSheet({
    company: kit.company,
    roleTitle: kit.roleTitle,
    questions: kit.questions,
    numbers: kit.numbers,
  });
  const md = renderCheatSheetMd(sheet);
  // 导出永远不消耗积分（承诺 4）。留痕是为了让它出现在消费记录里。
  await logFree("data_export");

  const filename = cheatSheetFilename(kit.company, sheet.date, "md");

  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // 文件名里有中文，ASCII 那份留个兜底，UTF-8 那份给认得的浏览器。
      "content-disposition": `attachment; filename="interview-cheatsheet.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
