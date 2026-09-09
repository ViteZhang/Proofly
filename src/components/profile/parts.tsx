import type { ReactNode } from "react";
import { ProofDot } from "@/components/library/ProofDot";
import type { BinaryEvidence } from "@/types/database";

/** 区块外壳。四个区块长得一样，样式只写一遍。 */
export function Section({
  id,
  title,
  sub,
  desc,
  action,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-card px-5 py-5"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {title}
            {sub && (
              <span className="text-[12.5px] font-normal" style={{ color: "var(--mute)" }}>
                {sub}
              </span>
            )}
          </h2>
          {desc && (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--mute)" }}>
              {desc}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** 空态。一句「暂无数据」等于没写 —— 得说清楚缺了会怎样。 */
export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      className="rounded-btn px-5 py-6 text-center text-[13px]"
      style={{ border: "1.5px dashed var(--line)", color: "var(--mute)" }}
    >
      <b className="block font-medium" style={{ color: "var(--slate)" }}>
        {title}
      </b>
      <span className="mt-0.5 block">{hint}</span>
    </div>
  );
}

/**
 * 可验证条目的证据标记。
 *
 * 复用经历库的 ProofDot，不在这一页另造一套 —— 同一个圆点在两页里
 * 含义不同，是最容易让人不再相信这套标记的做法。
 */
export function ProofTag({ level, note }: { level: BinaryEvidence; note?: string | null }) {
  const measured = level === "measured";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[11.5px] font-medium"
      style={
        measured
          ? { background: "var(--proof-soft)", color: "var(--proof)" }
          : { background: "var(--line-soft)", color: "var(--mute)" }
      }
    >
      <ProofDot level={measured ? "measured" : "absent"} size={9} />
      {measured ? (note?.trim() || "可查") : "不可查"}
    </span>
  );
}

/** 「进简历 / 仅匹配」。一眼看出哪些字段会被原样印出去。 */
export function ExportTag({ exportable }: { exportable: boolean }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-[2px] text-[10.5px] font-medium"
      style={{ background: "var(--line-soft)", color: "var(--mute)" }}
    >
      {exportable ? "进简历" : "仅匹配"}
    </span>
  );
}

/** 条目行：左边一列时间，右边内容，最右操作。 */
export function ItemRow({
  when,
  children,
  actions,
}: {
  when: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  // 首行不要上边框：区块标题下面本来就有间距，再来一条线像是把标题划掉了
  return (
    <div
      className="group flex items-start gap-3 border-t border-[var(--line-soft)] py-3 first:border-t-0 first:pt-0 last:pb-0"
    >
      <span
        className="font-display w-[104px] shrink-0 pt-[2px] text-[12px]"
        style={{ color: "var(--mute)" }}
      >
        {when}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {actions && (
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
