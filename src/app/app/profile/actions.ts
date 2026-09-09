"use server";

// =============================================================
// Proofly · 基本信息写操作
//
// 三张表的增删改 + 事实项的行内保存。全部走服务端动作，客户端拿不到
// 直接写库的路径 —— RLS 挡得住越权，但挡不住把一个 degree 写成 'postdoc'
// 这种脏数据，那得靠这里的 zod。
//
// 删除一律先算影响范围再删：一条学历可能正印在两份已经生成的简历里，
// 删掉之后那两份就变成了没有出处的文本。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { FACT_KEYS, FACT_REGISTRY, isFactKey } from "@/lib/profile/registry";

function refresh() {
  revalidatePath("/app/profile");
  revalidatePath("/", "layout"); // 顶栏体检芯片与侧栏徽标跟着走
}

// ---- 公用的小片 ----

const Id = z.uuid("这条记录不存在");
// 日期一律收 YYYY-MM，落库补成当月 1 号。让人填「日」是没有意义的精度，
// 而简历上从来只印到月。
const MONTH_RE = /^\d{4}[-.]\d{1,2}$/;

/** 2015.07 / 2015-7 → 2015-07-01。 */
function toDate(v: string): string {
  const [y, m] = v.replace(".", "-").split("-");
  return `${y}-${m.padStart(2, "0")}-01`;
}

const Month = z
  .string()
  .trim()
  .refine((v) => MONTH_RE.test(v), "填成 2015.07 这种格式")
  .transform(toDate);

// 不用 z.union([Month, z.literal("")])：联合校验失败时 zod 给的是
// 「Invalid input」，那是写给开发者看的，会被原样端到用户脸上。
const OptMonth = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v ?? "")
  .refine((v) => v === "" || MONTH_RE.test(v), "填成 2015.07 这种格式")
  .transform((v) => (v === "" ? null : toDate(v)));

const Text = (max: number, label: string) =>
  z.string().trim().max(max, `${label}最多 ${max} 字`);
const OptText = (max: number, label: string) =>
  Text(max, label)
    .nullish()
    .transform((v) => (v && v !== "" ? v : null));

// ---- 事实项 ----

/**
 * 按 key 保存一条事实。
 *
 * 用 upsert 而不是 update：registry 里新加的 key（微信号、期望城市…）在
 * 老账号里还没有对应的行，进页面时补建那一步万一没跑完，用户在这里敲的
 * 字不该因此丢掉。
 */
export async function saveFact(key: string, value: string): Promise<ActionResult> {
  if (!isFactKey(key)) return fail("没有这一项");
  const spec = FACT_REGISTRY[key];

  const parsed = z.string().trim().max(500, "最多 500 字").safeParse(value);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  // 格式校验只在有值时做，清空一个字段永远合法。
  if (parsed.data !== "" && spec.validate) {
    const msg = spec.validate(parsed.data);
    if (msg) return fail(msg);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_facts")
    .upsert({ key, value: parsed.data || null }, { onConflict: "user_id,key" });

  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok(null);
}

// ---- 从原「事实层」页搬过来的两个动作 ----
//
// 那一页已经并进基本信息，动作跟着搬家，免得留下一个只为了两个函数
// 而存在的目录。

const PRESET = new Set<string>(FACT_KEYS);

/** 首次进入基本信息时把缺的预置项补成空记录，用户看到的是一张完整清单。 */
export async function ensureFacts(keys: string[]): Promise<ActionResult> {
  const wanted = keys.filter((k) => PRESET.has(k));
  if (wanted.length === 0) return ok(null);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_facts")
    .upsert(
      wanted.map((key) => ({ key, value: null })),
      { onConflict: "user_id,key", ignoreDuplicates: true },
    );

  if (error) return fail("没能初始化基本信息，刷新再试");
  refresh();
  return ok(null);
}

/**
 * 定下一个值，冲突就算解决。
 * conflict_log 原样保留——曾经不一致这件事本身是体检模块要追溯的证据。
 */
export async function resolveFact(id: string, value: string): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.uuid("这条事实不存在"),
      value: z.string().trim().min(1, "选一个，或者自己填一个").max(500, "最多 500 字"),
    })
    .safeParse({ id, value });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_facts")
    .update({ value: parsed.data.value, status: "RESOLVED" })
    .eq("id", parsed.data.id);

  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok(null);
}

// ---- 教育经历 ----

const educationInput = z.object({
  school: Text(80, "学校").min(1, "学校要填"),
  major: OptText(80, "专业"),
  degree: z.enum(["doctor", "master", "bachelor", "associate", "vocational", "other"]).nullish(),
  is_full_time: z.boolean().default(true),
  period_start: OptMonth,
  period_end: OptMonth,
  status: z.enum(["graduated", "in_progress", "withdrawn"]).default("graduated"),
  // 学历只有可查 / 不可查两档。这里的 enum 就是那条 CHECK 的前哨。
  evidence_level: z.enum(["measured", "absent"]).default("absent"),
  credential_note: OptText(120, "可查渠道说明"),
});

export type EducationInput = z.input<typeof educationInput>;

export async function saveEducation(
  id: string | null,
  input: EducationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = educationInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  const row = { ...parsed.data, degree: parsed.data.degree ?? null };
  const supabase = await createClient();

  if (id === null) {
    const { data, error } = await supabase.from("educations").insert(row).select("id").single();
    if (error || !data) return fail("没能保存，再试一次");
    refresh();
    return ok({ id: data.id });
  }

  if (!Id.safeParse(id).success) return fail("这条学历不存在");
  const { error } = await supabase.from("educations").update(row).eq("id", id);
  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok({ id });
}

// ---- 工作履历 ----

const employmentInput = z.object({
  org: Text(80, "公司").min(1, "公司要填"),
  title: OptText(60, "职位"),
  city: OptText(40, "城市"),
  employment_type: z.enum(["fulltime", "intern", "contract", "freelance"]).default("fulltime"),
  period_start: Month,
  period_end: OptMonth,
  entity_note: OptText(200, "披露口径"),
});

export type EmploymentInput = z.input<typeof employmentInput>;

export async function saveEmployment(
  id: string | null,
  input: EmploymentInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = employmentInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  const d = parsed.data;
  // 结束早于开始，落库之后会算出一个负数的空档，界面上会出现「与上一段
  // 之间有 -8 个月空档」。在这里拦住比在展示层兜底干净。
  if (d.period_end && d.period_end < d.period_start) return fail("结束时间早于开始时间");

  const supabase = await createClient();

  // 人手动存过一次，就不再是「回填出来还没人看过」的状态了。
  const row = { ...d, needs_review: false };

  if (id === null) {
    const { data, error } = await supabase.from("employments").insert(row).select("id").single();
    if (error || !data) return fail("没能保存，再试一次");
    refresh();
    return ok({ id: data.id });
  }

  if (!Id.safeParse(id).success) return fail("这条履历不存在");
  const { error } = await supabase.from("employments").update(row).eq("id", id);
  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok({ id });
}

// ---- 证书与作品 ----

const credentialInput = z.object({
  kind: z.enum(["certificate", "language", "award", "publication", "link"]).default("certificate"),
  name: Text(80, "名称").min(1, "名称要填"),
  issuer: OptText(80, "颁发机构"),
  level: OptText(40, "等级"),
  issued_at: OptMonth,
  expires_at: OptMonth,
  identifier: OptText(80, "编号"),
  url: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "链接要以 http 开头")
    .transform((v) => (v === "" ? null : v)),
  evidence_level: z.enum(["measured", "absent"]).default("absent"),
});

export type CredentialInput = z.input<typeof credentialInput>;

export async function saveCredential(
  id: string | null,
  input: CredentialInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = credentialInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  const supabase = await createClient();

  if (id === null) {
    const { data, error } = await supabase
      .from("credentials")
      .insert(parsed.data)
      .select("id")
      .single();
    if (error || !data) return fail("没能保存，再试一次");
    refresh();
    return ok({ id: data.id });
  }

  if (!Id.safeParse(id).success) return fail("这条记录不存在");
  const { error } = await supabase.from("credentials").update(parsed.data).eq("id", id);
  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok({ id });
}

// ---- 删除 ----

const TABLES = {
  education: "educations",
  employment: "employments",
  credential: "credentials",
} as const;

export type ProfileEntity = keyof typeof TABLES;

export async function removeProfileItem(
  entity: ProfileEntity,
  id: string,
): Promise<ActionResult> {
  if (!(entity in TABLES)) return fail("删不了这个");
  if (!Id.safeParse(id).success) return fail("这条记录不存在");

  const supabase = await createClient();
  const { error } = await supabase.from(TABLES[entity]).delete().eq("id", id);
  if (error) return fail("没能删掉，再试一次");
  refresh();
  return ok(null);
}

/**
 * 删之前先算影响范围。
 *
 * 「这条学历出现在 2 份简历里，删掉后那两份需要重新生成」—— 用户得先
 * 知道代价，再决定删不删。判定靠 rendered_md 里有没有出现这条记录的
 * 名字：简历正文是唯一能证明「它确实印出去过」的东西，比任何外键都准。
 */
export async function profileItemImpact(
  entity: ProfileEntity,
  id: string,
): Promise<ActionResult<{ lines: string[] }>> {
  if (!(entity in TABLES)) return fail("没有这个条目");
  if (!Id.safeParse(id).success) return fail("这条记录不存在");

  const supabase = await createClient();
  const lines: string[] = [];

  // 三张表分开查，不拼动态列名：表名与列名一起变的查询在类型上是一团
  // 联合，读起来也猜不出实际取的是哪一列。
  const needle = (await (async () => {
    if (entity === "education") {
      const { data } = await supabase.from("educations").select("school").eq("id", id).maybeSingle();
      return data?.school ?? null;
    }
    if (entity === "employment") {
      const { data } = await supabase.from("employments").select("org").eq("id", id).maybeSingle();
      return data?.org ?? null;
    }
    const { data } = await supabase.from("credentials").select("name").eq("id", id).maybeSingle();
    return data?.name ?? null;
  })())?.trim();

  if (needle === undefined || needle === null) return fail("这条记录已经不在了");

  if (entity === "employment") {
    const { count } = await supabase
      .from("atoms")
      .select("id", { count: "exact", head: true })
      .eq("employment_id", id);
    if ((count ?? 0) > 0) {
      lines.push(`有 ${count} 条经历挂在这段履历下。删掉履历不会删经历，但它们会变回「无归属」。`);
    }
  }

  if (needle !== "") {
    const [{ data: baselines }, { data: versions }] = await Promise.all([
      supabase.from("resume_baselines").select("id,rendered_md"),
      supabase.from("resume_versions").select("id,rendered_md"),
    ]);
    const hit =
      (baselines ?? []).filter((b) => b.rendered_md?.includes(needle)).length +
      (versions ?? []).filter((v) => v.rendered_md?.includes(needle)).length;
    if (hit > 0) {
      lines.push(`「${needle}」出现在 ${hit} 份已经生成的简历里，删掉后那几份需要重新生成。`);
    }
  }

  return ok({ lines });
}

// ---- 由经历库回填履历 ----

/**
 * 按 org 把经历聚合成履历草稿。
 *
 * 起止时间取该公司名下所有经历的 min / max —— 这个结果必然偏窄：在职但
 * 那几个月没有可写的项目，那段时间就聚合不出来。所以回填出来的每一条都
 * 打上 needs_review，人在界面上逐条校对过才算数。
 *
 * 个人项目、志愿、社区类的经历不参与：它们不属于任何一段任职，硬塞进去
 * 会凭空造出一家叫「个人项目」的公司。
 *
 * 已经存在的同名履历不动，只把经历挂上去 —— 用户可能已经手工填过并校对
 * 过时间了，回填不该把它盖回一个偏窄的值。
 */
export async function backfillEmployments(): Promise<
  ActionResult<{ created: number; linked: number }>
> {
  const supabase = await createClient();

  const [{ data: atoms }, { data: existing }] = await Promise.all([
    supabase
      .from("atoms")
      .select("id,org,role,period_start,period_end,employment_id,context,level")
      .eq("context", "employment")
      .not("org", "is", null),
    supabase.from("employments").select("id,org"),
  ]);

  const byOrg = new Map<string, typeof atoms>();
  for (const a of atoms ?? []) {
    const org = a.org?.trim();
    if (!org) continue;
    const list = byOrg.get(org) ?? [];
    list.push(a);
    byOrg.set(org, list);
  }
  if (byOrg.size === 0) return ok({ created: 0, linked: 0 });

  const idByOrg = new Map((existing ?? []).map((e) => [e.org.trim(), e.id]));
  let created = 0;

  for (const [org, list] of byOrg) {
    if (idByOrg.has(org)) continue;

    const starts = (list ?? []).map((a) => a.period_start).filter((d): d is string => !!d);
    const running = (list ?? []).some((a) => a.period_end === null);
    const ends = (list ?? []).map((a) => a.period_end).filter((d): d is string => !!d);

    // 一条时间都没有的公司不建：那样会造出一条起止全空的履历，
    // 而 period_start 是必填的，只能瞎填一个日期 —— 那是编造。
    if (starts.length === 0) continue;

    const { data, error } = await supabase
      .from("employments")
      .insert({
        org,
        title: (list ?? []).find((a) => a.role)?.role ?? null,
        period_start: starts.reduce((a, b) => (a < b ? a : b)),
        period_end: running || ends.length === 0 ? null : ends.reduce((a, b) => (a > b ? a : b)),
        needs_review: true,
      })
      .select("id")
      .single();

    if (error || !data) continue;
    idByOrg.set(org, data.id);
    created += 1;
  }

  let linked = 0;
  for (const [org, list] of byOrg) {
    const empId = idByOrg.get(org);
    if (!empId) continue;
    const ids = (list ?? []).filter((a) => a.employment_id !== empId).map((a) => a.id);
    if (ids.length === 0) continue;
    const { error } = await supabase.from("atoms").update({ employment_id: empId }).in("id", ids);
    if (!error) linked += ids.length;
  }

  refresh();
  return ok({ created, linked });
}
