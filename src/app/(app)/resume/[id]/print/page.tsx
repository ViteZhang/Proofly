import { notFound } from "next/navigation";
import { PrintView } from "@/components/resume/PrintView";
import { getPrintDoc } from "@/lib/queries/resume";

// 只渲染简历正文，无导航无按钮。PDF 走浏览器打印，不引入 Puppeteer /
// headless Chrome：Vercel Hobby 上 Chromium 的体积与冷启动是明显负担，
// 而浏览器打印出来的 PDF 带真实文本层，ATS 解析质量反而更好。
export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getPrintDoc(id);
  if (!doc) notFound();

  return <PrintView doc={doc} />;
}
