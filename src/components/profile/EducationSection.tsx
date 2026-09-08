import { DEGREE_LABEL, EDUCATION_STATUS_LABEL, period } from "@/lib/profile/labels";
import type { Education } from "@/lib/queries/profile";
import { Empty, ItemRow, ProofTag, Section } from "./parts";

/**
 * 教育经历。
 *
 * 证据等级只有「可查 / 不可查」两档，不套用经历库那套四档。学历没有中间
 * 态 —— 要么学信网上查得到，要么查不到。硬塞「估算」「仅设计」会让那两档
 * 在这里语义落空，反过来污染四档框架本身。
 */
export function EducationSection({
  items,
  action,
  rowActions,
}: {
  items: Education[];
  action?: React.ReactNode;
  rowActions?: (e: Education) => React.ReactNode;
}) {
  return (
    <Section
      id="education"
      title="教育经历"
      desc="很多 JD 把学历写成硬性要求。这里空着，评估时会被判成一个你关不掉的缺口。"
      action={action}
    >
      {items.length === 0 ? (
        <Empty
          title="还没有学历"
          hint="补上学校、专业和起止时间就够了，两分钟的事"
        />
      ) : (
        items.map((e) => (
          <ItemRow
            key={e.id}
            when={period(e.periodStart, e.periodEnd, "在读")}
            actions={rowActions?.(e)}
          >
            <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
              {e.school}
              <ProofTag level={e.evidenceLevel} note={e.credentialNote} />
            </div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
              {[
                e.major,
                e.degree ? DEGREE_LABEL[e.degree] : null,
                e.isFullTime ? "全日制" : "非全日制",
                e.status === "graduated" ? null : EDUCATION_STATUS_LABEL[e.status],
              ]
                .filter(Boolean)
                .join(" · ") || "还没填专业和学历层次"}
            </div>
          </ItemRow>
        ))
      )}
    </Section>
  );
}
