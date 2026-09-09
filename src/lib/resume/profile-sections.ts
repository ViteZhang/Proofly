// =============================================================
// Proofly · 简历里的教育背景 / 证书段落
//
// 这两段不从 atom 来，也不进 resume_blocks —— 它们没有「来源经历」，
// 塞进 blocks 会让门禁的每一条（must_say 覆盖、措辞模板、互斥消解）
// 都得为它们开一个特例。它们是档案的直接投影：改了基本信息，下次生成
// 就变，中间不经过任何模型。
//
// 「不可查」的条目默认不导出。一个写在简历上却拿不出编号的证书，面试
// 时是负分不是加分。学历没有这条规矩 —— 学历真伪不该由这个产品来判。
//
// 纯函数，不连库。
// =============================================================

import { DEGREE_LABEL, EDUCATION_STATUS_LABEL, month, period } from "@/lib/profile/labels";
import type { Credential, Education, Employment } from "@/lib/queries/profile";

/** 一行 = 一条。左边是主体，右边是时间，中间用全角空格 —— 与经历块同一套排版。 */
export type ProfileLine = { main: string; when: string };

export function educationLines(items: Education[]): ProfileLine[] {
  return items.map((e) => ({
    main: [
      e.school,
      [
        e.major,
        e.degree ? DEGREE_LABEL[e.degree] : null,
        e.isFullTime ? null : "非全日制",
        e.status === "graduated" ? null : EDUCATION_STATUS_LABEL[e.status],
      ]
        .filter(Boolean)
        .join(" · "),
    ]
      .filter((s) => s && s !== "")
      .join("　"),
    when: period(e.periodStart, e.periodEnd, "在读"),
  }));
}

export function credentialLines(items: Credential[]): ProfileLine[] {
  return items
    .filter((c) => c.evidenceLevel === "measured")
    .map((c) => ({
      main: [
        [c.name, c.level].filter(Boolean).join(" · "),
        c.issuer,
        // 编号写进简历：一张说得出编号的证书，对面才有得核。
        c.identifier ? `编号 ${c.identifier}` : c.url,
      ]
        .filter(Boolean)
        .join("　"),
      when: month(c.issuedAt) ?? "",
    }));
}

/**
 * 一条经历块该挂哪段履历的时间。
 *
 * 公司与起止时间取自 employments，项目明细仍取自 atom。原来两者都由该
 * 公司名下所有经历的 period 聚合得出，「在职却没有可写项目」的月份被
 * 整段吞掉，导出的日期因此偏窄 —— 那是一份错的简历。
 */
export function employmentMeta(
  e: Pick<Employment, "org" | "title" | "periodStart" | "periodEnd">,
): string {
  return [[e.org, e.title].filter(Boolean).join(" · "), period(e.periodStart, e.periodEnd)]
    .filter((s) => s !== "")
    .join("　");
}

/**
 * 一个经历块的 meta（标题右边那行时间）该写什么。
 *
 * 优先级：履历表 > 模型写的 > 由这条经历自己的时间兜底。
 *
 * 履历排第一，是因为模型看到的时间是这条经历自己的，而「在职却没有可写
 * 项目」的那几个月它根本看不见 —— 写出来的日期必然偏窄。
 *
 * 只在生成时定一次，不在渲染时反复覆盖：meta 是可以手工改的，渲染时
 * 覆盖等于把人改过的东西悄悄扔掉。所以老基线要等下次重新生成才会跟上，
 * 这是有意的。
 */
export function blockMeta(
  fromEmployment: string | undefined,
  fromModel: string,
  fallback: string,
): string {
  return fromEmployment ?? (fromModel.trim() || fallback);
}
