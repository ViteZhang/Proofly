import { EMPLOYMENT_TYPE_LABEL, monthsBetween, period } from "@/lib/profile/labels";
import type { Employment } from "@/lib/queries/profile";
import { Empty, ItemRow, Section } from "./parts";

/** 空档超过这个月数就提醒一句。见 §7.3，取 6 个月：换工作歇三个月太常见，
 *  报出来只会变成噪音；半年以上面试官一定会问，那时候没准备好才是问题。 */
export const GAP_MONTHS = 6;

/** 相邻两段之间的空档。按开始时间升序排好再算。 */
export function gapsBetween(items: Employment[]): Map<string, number> {
  const sorted = [...items]
    .filter((e) => e.periodStart)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const out = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].periodEnd;
    // 上一段还没结束（在职）就不算空档 —— 那是兼着两份，不是断档。
    if (!prevEnd) continue;
    const months = monthsBetween(prevEnd, sorted[i].periodStart);
    if (months > GAP_MONTHS) out.set(sorted[i].id, months);
  }
  return out;
}

/**
 * 工作履历。
 *
 * 项目明细仍然在经历库，这里只管「哪家公司、什么职位、从几月到几月」。
 * 之前这三样只能由该公司名下所有经历的时间聚合出来，于是「在职但那阵子
 * 没有可写的项目」的空档被整段吞掉，导出的简历日期偏窄。
 */
export function EmploymentSection({
  items,
  action,
  rowActions,
}: {
  items: Employment[];
  action?: React.ReactNode;
  rowActions?: (e: Employment) => React.ReactNode;
}) {
  const gaps = gapsBetween(items);

  return (
    <Section
      id="employment"
      title="工作履历"
      sub="简历里的公司与起止时间取自这里"
      desc="项目明细仍在经历库。这里只管哪家公司、什么职位、从几月到几月。"
      action={action}
    >
      {items.length === 0 ? (
        <Empty
          title="还没有履历"
          hint="填一条，简历的工作经历段落就有准确的起止时间了"
        />
      ) : (
        items.map((e) => {
          const gap = gaps.get(e.id);
          return (
            <ItemRow
              key={e.id}
              when={period(e.periodStart, e.periodEnd)}
              actions={rowActions?.(e)}
            >
              <div className="text-[14px] font-semibold">{e.org}</div>
              <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
                {[e.title, e.city, EMPLOYMENT_TYPE_LABEL[e.employmentType]]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div
                className="mt-1.5 flex flex-wrap gap-2.5 text-[11.5px]"
                style={{ color: "var(--mute)" }}
              >
                <span>关联 {e.atomCount} 条经历</span>
                {e.entityNote && <span>对外品牌与主体不一致，已设披露口径</span>}
                {gap !== undefined && (
                  <span style={{ color: "var(--warn)" }}>与上一段之间有 {gap} 个月空档</span>
                )}
              </div>
            </ItemRow>
          );
        })
      )}
    </Section>
  );
}
