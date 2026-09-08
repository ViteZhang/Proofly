// =============================================================
// Proofly · 基本信息的展示文案与日期格式
// =============================================================

import type {
  CredentialKind,
  Degree,
  EducationStatus,
  EmploymentType,
} from "@/types/database";

export const DEGREE_LABEL: Record<Degree, string> = {
  doctor: "博士",
  master: "硕士",
  bachelor: "本科",
  associate: "大专",
  vocational: "职高/中专",
  other: "其他",
};

/** 由高到低。硬门槛比对靠这个顺序，不靠字符串。 */
export const DEGREE_ORDER: Degree[] = [
  "doctor",
  "master",
  "bachelor",
  "associate",
  "vocational",
  "other",
];

export const EDUCATION_STATUS_LABEL: Record<EducationStatus, string> = {
  graduated: "已毕业",
  in_progress: "在读",
  withdrawn: "肄业",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  fulltime: "全职",
  intern: "实习",
  contract: "外包",
  freelance: "自由职业",
};

export const CREDENTIAL_KIND_LABEL: Record<CredentialKind, string> = {
  certificate: "证书",
  language: "语言",
  award: "奖项",
  publication: "论文/专利",
  link: "作品链接",
};

export const CREDENTIAL_KIND_ORDER: CredentialKind[] = [
  "certificate",
  "language",
  "award",
  "publication",
  "link",
];

/** 2011-09-01 → 2011.09。null 交给调用方决定说「至今」还是「在读」。 */
export function month(d: string | null): string | null {
  if (!d) return null;
  return `${d.slice(0, 4)}.${d.slice(5, 7)}`;
}

export function period(start: string | null, end: string | null, openLabel = "至今"): string {
  const a = month(start);
  const b = month(end);
  if (!a && !b) return "时间未填";
  if (!b) return a ? `${a} – ${openLabel}` : openLabel;
  return a ? `${a} – ${b}` : `至 ${b}`;
}

/** 相隔几个月。两端都要有值，否则返回 null —— 空档告警不能建立在猜测上。 */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = [Number(a.slice(0, 4)), Number(a.slice(5, 7))];
  const [by, bm] = [Number(b.slice(0, 4)), Number(b.slice(5, 7))];
  return (by - ay) * 12 + (bm - am);
}
