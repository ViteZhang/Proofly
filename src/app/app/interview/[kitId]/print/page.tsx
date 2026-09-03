import { notFound } from "next/navigation";
import { CheatSheetView } from "@/components/interview/CheatSheetView";
import { getKitById } from "@/lib/queries/interview";
import { buildCheatSheet } from "@/lib/interview/cheatsheet";

// 面试前十分钟在手机上看的那一份。PDF 同样走浏览器打印 ——
// 不引入 Puppeteer / headless Chrome，理由和简历打印页一样。
export default async function CheatSheetPrintPage({
  params,
}: {
  params: Promise<{ kitId: string }>;
}) {
  const { kitId } = await params;
  const kit = await getKitById(kitId);
  if (!kit) notFound();

  const sheet = buildCheatSheet({
    company: kit.company,
    roleTitle: kit.roleTitle,
    questions: kit.questions,
    numbers: kit.numbers,
  });

  return <CheatSheetView sheet={sheet} kitId={kit.id} versionId={kit.versionId} />;
}
