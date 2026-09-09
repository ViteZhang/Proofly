import { redirect } from "next/navigation";

/**
 * 老入口。
 *
 * 「事实层」这个词已经从界面上撤了，页面本身并进了「基本信息」。这里保留
 * 一个重定向而不是直接删掉：体检报告、旧的截图、用户自己存的书签都可能
 * 还指着这个地址，让它 404 是把自己的历史扔给用户处理。
 *
 * key / highlight 两个 query 原样带过去 —— 体检的「去解决」就靠它定位。
 */
export default async function FactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["key", "highlight"]) {
    const v = params[k];
    if (typeof v === "string") qs.set(k, v);
  }
  redirect(qs.size > 0 ? `/app/profile?${qs}` : "/app/profile");
}
