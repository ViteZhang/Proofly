import Link from "next/link";
import type { Completeness } from "@/lib/profile/completeness";

/**
 * 档案完整度。
 *
 * 跟证明度并列，不混算：证明度衡量「经历能不能被证明」，把学历证书这种
 * 填个表就有的东西算进它的分子，指标就从「经历有多硬」退化成「表单填了
 * 多少」了。
 */
export function CompletenessCard({ data }: { data: Completeness }) {
  return (
    <div
      className="rounded-card px-5 py-5"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">
          档案完整度
          <span className="ml-2 text-[12.5px] font-normal" style={{ color: "var(--mute)" }}>
            与证明度分开计算
          </span>
        </h2>
        <span className="text-[12.5px]" style={{ color: "var(--mute)" }}>
          {data.filled} / {data.total} 项
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <span className="font-display text-[30px] font-semibold leading-none tracking-tight">
          {data.percent}
          <span className="text-[16px]" style={{ color: "var(--mute)" }}>
            %
          </span>
        </span>
        <div
          className="h-2 flex-1 overflow-hidden rounded-pill"
          style={{ background: "var(--line-soft)" }}
        >
          <div
            className="h-full rounded-pill transition-[width] duration-700"
            style={{ width: `${data.percent}%`, background: "var(--ink)" }}
          />
        </div>
      </div>

      {data.missing.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {data.missing.map((m) => (
            <Link
              key={m.key}
              href={`#${m.anchor}`}
              className="rounded-pill px-3 py-[5px] text-[12px] transition-colors hover:border-solid hover:text-ink"
              style={{ border: "1px dashed var(--ghost)", color: "var(--slate)" }}
            >
              {m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
