import Link from "next/link";

import { SiteNav } from "@/components/site/SiteNav";

/**
 * 合规页的外壳。
 *
 * 跟官网同一套样式，因为这两份文本是给还没注册的人看的 ——
 * 决定要不要把简历交给我们之前，他得先看得到这些。
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="site">
      <SiteNav />
      <main className="wrap" style={{ paddingTop: 96, paddingBottom: 80, maxWidth: 760 }}>
        <h1 className="h2" style={{ marginBottom: 8 }}>
          {title}
        </h1>
        <p style={{ color: "var(--mute)", fontSize: 13, marginBottom: 32 }}>
          最后更新：{updated}
        </p>
        <article className="legal">{children}</article>
        <p style={{ marginTop: 48, fontSize: 13 }}>
          <Link href="/" style={{ color: "var(--slate)" }}>
            ← 回首页
          </Link>
        </p>
      </main>
    </div>
  );
}
