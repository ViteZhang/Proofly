import Link from "next/link";
import { listBlockingIssues } from "@/lib/queries/resume";

// 临时的问题列表页。Step 8 的体检页做出来之后，「去看看」改指那里，
// 这一页就可以删。现在它存在的唯一理由是：导出被拦下的时候，
// 「有 2 处问题必须先解决」后面得有个地方可去。
export default async function IssuesPage() {
  const issues = await listBlockingIssues();

  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold tracking-tight">必须先解决的问题</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        这些问题不解决，导出会被拦住
      </p>

      {issues.length === 0 ? (
        <p
          className="mt-5 max-w-[52ch] rounded-card px-5 py-4 text-[13.5px] leading-relaxed"
          style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--proof)" }}
        >
          没有必须先解决的问题。可以导出了。
        </p>
      ) : (
        <ul className="mt-5 space-y-2" style={{ maxWidth: 720 }}>
          {issues.map((c) => (
            <li
              key={c.id}
              className="rounded-card px-5 py-4"
              style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)" }}
            >
              <p className="text-[13.5px] font-medium">
                <span className="mr-1.5" style={{ color: "var(--danger)" }}>
                  {c.code}
                </span>
                {c.title}
              </p>
              {c.detail && (
                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
                  {c.detail}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[13px]">
        <Link href="/resume" className="underline" style={{ color: "var(--ink)" }}>
          ← 回到简历
        </Link>
      </p>
    </div>
  );
}
