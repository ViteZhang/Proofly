// =============================================================
// Proofly · 基本信息读取层
//
// 一次把四个区块读完。四个区块各查各的会变成一进页面四五次往返，而它们
// 本来就要一起显示。
//
// 「基本信息」是对用户的说法；「事实层」是架构术语，只留在代码注释和
// 技术文档里，界面上一次都不出现。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { completeness, type Completeness } from "@/lib/profile/completeness";
import { getProfileFacts, type FactKey, type ProfileFact } from "@/lib/queries/facts";
import type {
  AvatarKind,
  BinaryEvidence,
  CredentialKind,
  Degree,
  EducationStatus,
  EmploymentType,
} from "@/types/database";

export type Education = {
  id: string;
  school: string;
  major: string | null;
  degree: Degree | null;
  isFullTime: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  status: EducationStatus;
  evidenceLevel: BinaryEvidence;
  credentialNote: string | null;
  sortOrder: number;
};

export type Employment = {
  id: string;
  org: string;
  title: string | null;
  city: string | null;
  employmentType: EmploymentType;
  periodStart: string;
  periodEnd: string | null;
  entityNote: string | null;
  sortOrder: number;
  /** 挂在这段履历下的经历条数。展开时告诉用户删掉会影响什么。 */
  atomCount: number;
};

export type Credential = {
  id: string;
  kind: CredentialKind;
  name: string;
  issuer: string | null;
  level: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  identifier: string | null;
  url: string | null;
  evidenceLevel: BinaryEvidence;
  sortOrder: number;
};

export type AccountProfile = {
  displayName: string | null;
  avatarKind: AvatarKind;
  avatarColor: string | null;
};

export type ProfileOverview = {
  facts: ProfileFact[];
  /** 预置项里还没有记录的 key，进页面时补建成空行。 */
  missingFactKeys: FactKey[];
  educations: Education[];
  employments: Employment[];
  credentials: Credential[];
  account: AccountProfile;
  completeness: Completeness;
};

export async function listEducations(): Promise<Education[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("educations")
    .select(
      "id,school,major,degree,is_full_time,period_start,period_end,status,evidence_level,credential_note,sort_order",
    )
    // 学历按时间倒序，最高/最近的排最前。sort_order 用于人工置顶。
    .order("sort_order", { ascending: true })
    .order("period_start", { ascending: false, nullsFirst: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    school: r.school,
    major: r.major,
    degree: r.degree,
    isFullTime: r.is_full_time,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status,
    evidenceLevel: r.evidence_level,
    credentialNote: r.credential_note,
    sortOrder: r.sort_order ?? 0,
  }));
}

export async function listEmployments(): Promise<Employment[]> {
  const supabase = await createClient();
  const [{ data }, { data: atoms }] = await Promise.all([
    supabase
      .from("employments")
      .select("id,org,title,city,employment_type,period_start,period_end,entity_note,sort_order")
      .order("period_start", { ascending: false }),
    supabase.from("atoms").select("employment_id").not("employment_id", "is", null),
  ]);

  const count = new Map<string, number>();
  for (const a of atoms ?? []) {
    if (!a.employment_id) continue;
    count.set(a.employment_id, (count.get(a.employment_id) ?? 0) + 1);
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    org: r.org,
    title: r.title,
    city: r.city,
    employmentType: r.employment_type,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    entityNote: r.entity_note,
    sortOrder: r.sort_order ?? 0,
    atomCount: count.get(r.id) ?? 0,
  }));
}

export async function listCredentials(): Promise<Credential[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credentials")
    .select(
      "id,kind,name,issuer,level,issued_at,expires_at,identifier,url,evidence_level,sort_order",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    issuer: r.issuer,
    level: r.level,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    identifier: r.identifier,
    url: r.url,
    evidenceLevel: r.evidence_level,
    sortOrder: r.sort_order ?? 0,
  }));
}

/**
 * 账户信息。
 *
 * 行可能还不存在（注册赠送函数会建，但历史账号未必有），读不到就给一份
 * 空的，不在读取路径上写库 —— 一个 GET 顺手 INSERT 是最难查的那类 bug。
 */
export async function getAccountProfile(): Promise<AccountProfile> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("nickname,avatar_kind,avatar_color")
    .maybeSingle();

  return {
    displayName: data?.nickname ?? null,
    avatarKind: data?.avatar_kind ?? "initial",
    avatarColor: data?.avatar_color ?? null,
  };
}

export async function getProfileOverview(): Promise<ProfileOverview> {
  const [{ facts, missingKeys }, educations, employments, credentials, account] = await Promise.all([
    getProfileFacts(),
    listEducations(),
    listEmployments(),
    listCredentials(),
    getAccountProfile(),
  ]);

  return {
    facts,
    missingFactKeys: missingKeys,
    educations,
    employments,
    credentials,
    account,
    completeness: completeness({
      facts: facts.map((f) => ({ key: f.key, value: f.value })),
      educationCount: educations.length,
      employmentCount: employments.length,
    }),
  };
}

/**
 * 侧栏要的那几样：展示名、头像色、常驻地、还差几项。
 *
 * 不复用 getProfileOverview —— 那个要读五张表，而它挂在 layout 上，
 * 每翻一页都会跑一遍。这里只读三张，且不去数经历。
 */
export async function getNavProfile(): Promise<{
  account: AccountProfile;
  location: string | null;
  missingCount: number;
}> {
  const supabase = await createClient();
  const [{ facts }, account, eduRes, empRes] = await Promise.all([
    getProfileFacts(),
    getAccountProfile(),
    supabase.from("educations").select("id", { count: "exact", head: true }),
    supabase.from("employments").select("id", { count: "exact", head: true }),
  ]);

  const done = completeness({
    facts: facts.map((f) => ({ key: f.key, value: f.value })),
    educationCount: eduRes.count ?? 0,
    employmentCount: empRes.count ?? 0,
  });

  return {
    account,
    location: facts.find((f) => f.key === "location")?.value ?? null,
    missingCount: done.missing.length,
  };
}
