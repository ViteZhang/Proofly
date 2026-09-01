import type { CrossCompare as Data } from "@/lib/queries/health";

/** C7 的跳转落点：两个方向的原文并排，一眼看出差在哪。 */
export function CrossCompare({ data }: { data: Data }) {
  return (
    <div
      className="mb-5 rounded-card px-5 py-4"
      style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)" }}
    >
      <p className="text-[13.5px] font-medium">
        「{data.atomTitle}」在两个方向的简历里说法不一样
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Side label={data.here.label} text={data.here.text} />
        {data.there ? (
          <Side label={data.there.label} text={data.there.text} />
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--slate)" }}>
            另一个方向的简历里已经没有这条经历了 —— 可能刚改过。回体检页重新扫一次就不会再报了。
          </p>
        )}
      </div>
    </div>
  );
}

function Side({ label, text }: { label: string; text: string }) {
  return (
    <div
      className="rounded-card px-4 py-3"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <p className="text-[11.5px]" style={{ color: "var(--mute)" }}>
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
    </div>
  );
}
