// =============================================================
// Proofly · 体检的读与写
//
// 一次扫描把库读完，喂给全部检查项。不让十个检查各查各的——那是
// 进一次页面几十条查询，而快扫的要求是「零 LLM 调用、一秒内完成」。
//
// 结果写进 check_results，origin='health'。每次扫描前先清空自己那拨
// 未解决的旧记录再重写：累积会让体检页越看越多，而里面大半是已经修好的。
// 门禁那拨（origin='gate'）一根不碰——C2..C5 正是从它汇总出来的。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parseFactConflicts, parseStringList } from "@/lib/domain";
import { FACT_LABEL, type FactKey } from "@/lib/queries/facts";
import { parseOutline } from "@/lib/queries/interview";
import { QUICK_CHECKS, DEEP_CHECKS } from "@/lib/health/registry";
import { buildReport, type HealthReport, type IgnoreRecord } from "@/lib/health/report";
import type {
  GateRow,
  HealthAtom,
  HealthContext,
  HealthIssue,
  HealthResume,
} from "@/lib/health/types";
import type { Database, Json } from "@/types/database";

export type Coverage = {
  atoms: number;
  skills: number;
  resumes: number;
  sourceDocs: number;
};

export type ScanMeta = {
  finishedAt: string | null;
  coverage: Coverage | null;
};

// ---- 读 ----

export async function loadHealthContext(now = new Date()): Promise<HealthContext> {
  const supabase = await createClient();

  // 一批发出去，不分两轮。快扫的预算是一秒，而这里每多一轮串行往返就是
  // 一个 Supabase RTT——查询本身不慢，慢的是来回。
  const [
    factsQ,
    atomsQ,
    metricsQ,
    srcLinkQ,
    skillsQ,
    skillLinkQ,
    targetsQ,
    docsQ,
    gateQ,
    outlineQ,
    resumes,
  ] = await Promise.all([
      supabase.from("profile_facts").select("id,key,value,status,conflict_log,disclosure_rule"),
      supabase
        .from("atoms")
        .select(
          "id,title,org,role,status,evidence_level,situation,task,actions,period_start,period_end,updated_at,last_deep_scan_rev",
        ),
      supabase
        .from("metrics")
        .select("id,atom_id,name,kind,from_value,to_value,delta,method,evidence_level"),
      supabase.from("atom_sources").select("atom_id,source_doc_id"),
      supabase.from("skills").select("id,label,evidence_strength"),
      supabase.from("atom_skills").select("atom_id,skill_id"),
      supabase.from("targets").select("id,name"),
      supabase.from("source_docs").select("id,filename,parsed_text,ingested_at"),
      supabase
        .from("check_results")
        .select("id,code,level,title,detail,ref_ids")
        .eq("origin", "gate")
        .is("resolved_at", null),
      supabase.from("interview_questions").select("id,from_atom_id,answer_outline"),
      loadResumes(supabase),
    ]);

  const metricsByAtom = new Map<string, HealthAtom["metrics"]>();
  for (const m of metricsQ.data ?? []) {
    const list = metricsByAtom.get(m.atom_id) ?? [];
    list.push({
      id: m.id,
      name: m.name,
      kind: m.kind,
      fromValue: m.from_value,
      toValue: m.to_value,
      delta: m.delta,
      method: m.method,
      evidenceLevel: m.evidence_level,
    });
    metricsByAtom.set(m.atom_id, list);
  }

  const docsByAtom = new Map<string, string[]>();
  for (const l of srcLinkQ.data ?? []) {
    const list = docsByAtom.get(l.atom_id) ?? [];
    list.push(l.source_doc_id);
    docsByAtom.set(l.atom_id, list);
  }

  const atoms: HealthAtom[] = (atomsQ.data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    org: a.org,
    role: a.role,
    status: a.status,
    evidenceLevel: a.evidence_level,
    situation: a.situation,
    task: a.task,
    actions: parseStringList(a.actions),
    periodStart: a.period_start,
    periodEnd: a.period_end,
    metrics: metricsByAtom.get(a.id) ?? [],
    updatedAt: a.updated_at ?? new Date(0).toISOString(),
    lastDeepScanRev: a.last_deep_scan_rev,
    sourceDocIds: docsByAtom.get(a.id) ?? [],
  }));

  const gateRows: GateRow[] = (gateQ.data ?? []).map((r) => {
    const ref = (r.ref_ids ?? {}) as { owner?: string | null; blockId?: string | null };
    return {
      id: r.id,
      code: r.code,
      level: r.level === "info" ? "warning" : r.level,
      title: r.title,
      detail: r.detail,
      owner: typeof ref.owner === "string" ? ref.owner : null,
      blockId: typeof ref.blockId === "string" ? ref.blockId : null,
    };
  });

  return {
    facts: (factsQ.data ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      label: FACT_LABEL[f.key as FactKey] ?? f.key,
      value: f.value,
      status: f.status,
      conflicts: parseFactConflicts(f.conflict_log),
      disclosureRule: f.disclosure_rule,
    })),
    atoms,
    skills: (skillsQ.data ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      evidenceStrength: s.evidence_strength,
      atomIds: (skillLinkQ.data ?? []).filter((l) => l.skill_id === s.id).map((l) => l.atom_id),
    })),
    targets: (targetsQ.data ?? []).map((t) => ({ id: t.id, name: t.name })),
    resumes,
    sourceDocs: (docsQ.data ?? []).map((d) => ({
      id: d.id,
      filename: d.filename,
      parsedText: d.parsed_text,
      ingestedAt: d.ingested_at,
    })),
    gateRows,
    // 应答骨架是 [{label, content}]，C6 只关心里面的文字，拼成一段扫。
    interviewOutlines: (outlineQ.data ?? [])
      .map((q) => ({
        id: q.id,
        atomId: q.from_atom_id,
        text: parseOutline(q.answer_outline)
          .map((o) => `${o.label} ${o.content}`)
          .join("\n")
          .trim(),
      }))
      .filter((q) => q.text !== ""),
    now,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function loadResumes(supabase: Client): Promise<HealthResume[]> {
  const [baseQ, verQ, blockQ, targetQ, jdQ] = await Promise.all([
    supabase.from("resume_baselines").select("id,target_id,rendered_md"),
    supabase.from("resume_versions").select("id,baseline_id,jd_id,rendered_md"),
    supabase
      .from("resume_blocks")
      .select("id,atom_id,rendered_text,baseline_id,resume_version_id"),
    supabase.from("targets").select("id,name"),
    supabase.from("jds").select("id,company,role_title"),
  ]);

  const targetName = new Map((targetQ.data ?? []).map((t) => [t.id, t.name]));
  const jd = new Map((jdQ.data ?? []).map((j) => [j.id, j]));
  const baselineTarget = new Map((baseQ.data ?? []).map((b) => [b.id, b.target_id]));

  const blocksOf = (key: "baseline_id" | "resume_version_id", id: string) =>
    (blockQ.data ?? [])
      .filter((b) => b[key] === id)
      .map((b) => ({ id: b.id, atomId: b.atom_id, renderedText: b.rendered_text }));

  const out: HealthResume[] = [];

  for (const b of baseQ.data ?? []) {
    const name = targetName.get(b.target_id) ?? "未命名方向";
    out.push({
      kind: "baseline",
      id: b.id,
      targetId: b.target_id,
      targetName: name,
      label: `${name} · 基线`,
      renderedMd: b.rendered_md,
      blocks: blocksOf("baseline_id", b.id),
    });
  }

  for (const v of verQ.data ?? []) {
    const tid = baselineTarget.get(v.baseline_id) ?? "";
    const name = targetName.get(tid) ?? "未命名方向";
    const j = jd.get(v.jd_id);
    const company = j?.company?.trim() || j?.role_title?.trim() || "某家公司";
    out.push({
      kind: "version",
      id: v.id,
      targetId: tid,
      targetName: name,
      label: `${name} · ${company}`,
      renderedMd: v.rendered_md,
      blocks: blocksOf("resume_version_id", v.id),
    });
  }

  return out;
}

export async function listIgnores(): Promise<IgnoreRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("health_ignores").select("fingerprint,reason");
  return (data ?? []).map((r) => ({ fingerprint: r.fingerprint, reason: r.reason }));
}

// ---- 跑 ----

/** 深扫的结果留在库里，快扫不碰它——否则点一次重新扫描，二十秒的深扫白跑。 */
const QUICK_CODES = QUICK_CHECKS.map((c) => c.code);
export const DEEP_CODES = DEEP_CHECKS.map((c) => c.code);

export async function runQuickScan(now = new Date()): Promise<HealthReport> {
  const ctx = await loadHealthContext(now);
  const issues: HealthIssue[] = [];
  for (const check of QUICK_CHECKS) {
    issues.push(...(await check.run(ctx)));
  }

  // 深扫的结果这次没重跑，但它还在库里——报告要把两拨合起来，
  // 否则点一次「重新扫描」，二十秒的语义冲突结果就从页面上消失了。
  const [, ignores, deepIssues] = await Promise.all([
    replaceHealthIssues(QUICK_CODES, issues),
    listIgnores(),
    readPersistedIssues(DEEP_CODES),
    recordScan("quick", coverageOf(ctx)),
  ]);

  const ranDeep =
    DEEP_CHECKS.length > 0 && (deepIssues.length > 0 || (await hasScan("deep")));
  const ran = [...QUICK_CHECKS, ...(ranDeep ? DEEP_CHECKS : [])].map((c) => ({
    code: c.code,
    label: c.label,
  }));

  return buildReport([...issues, ...deepIssues], ignores, ran);
}

export function coverageOf(ctx: HealthContext): Coverage {
  return {
    atoms: ctx.atoms.length,
    skills: ctx.skills.length,
    resumes: ctx.resumes.length,
    sourceDocs: ctx.sourceDocs.length,
  };
}

/** 只替换给定这几个 code 的记录。深扫与快扫互不覆盖。 */
export async function replaceHealthIssues(codes: string[], issues: HealthIssue[]): Promise<void> {
  const supabase = await createClient();
  if (codes.length === 0) return;

  await supabase
    .from("check_results")
    .delete()
    .eq("origin", "health")
    .in("code", codes)
    .is("resolved_at", null);

  if (issues.length === 0) return;

  const rows: Database["public"]["Tables"]["check_results"]["Insert"][] = issues.map((i) => ({
    origin: "health" as const,
    scope: scopeOf(i.code),
    level: i.level,
    code: i.code,
    title: i.title,
    detail: i.detail,
    ref_ids: i.refIds as unknown as Json,
    resolve_link: i.resolveLink,
    fingerprint: i.fingerprint,
  }));

  await supabase.from("check_results").insert(rows);
}

function scopeOf(code: string): Database["public"]["Tables"]["check_results"]["Insert"]["scope"] {
  const c = [...QUICK_CHECKS, ...DEEP_CHECKS].find((x) => x.code === code);
  return c?.scope ?? "resume";
}

async function recordScan(kind: "quick" | "deep", coverage: Coverage): Promise<void> {
  const supabase = await createClient();
  await supabase.from("health_scans").insert({
    kind,
    status: "done" as const,
    done_count: 0,
    total_count: 0,
    coverage: coverage as unknown as Json,
    finished_at: new Date().toISOString(),
  });
}

// ---- 读回报告 ----

/** 从 check_results 读已落库的体检结果，套上忽略状态。不重跑检查。 */
export async function readPersistedIssues(codes?: string[]): Promise<HealthIssue[]> {
  const supabase = await createClient();
  if (codes && codes.length === 0) return [];

  let q = supabase
    .from("check_results")
    .select("id,code,level,title,detail,ref_ids,resolve_link,fingerprint")
    .eq("origin", "health")
    .is("resolved_at", null);
  if (codes) q = q.in("code", codes);

  const { data } = await q.order("created_at", { ascending: true });

  return (data ?? [])
    .filter((r) => r.level !== "pass")
    .map((r) => ({
      code: r.code ?? "",
      level: r.level === "pass" ? "info" : r.level,
      title: r.title,
      detail: r.detail ?? "",
      refIds: Array.isArray(r.ref_ids) ? (r.ref_ids as string[]) : [],
      resolveLink: r.resolve_link ?? "/app/health",
      fingerprint: r.fingerprint ?? `${r.code}:${r.id}`,
      autoFixable: false,
    }));
}

/** 只读不跑。用在不该触发扫描的地方——顶栏芯片、首页卡、生成拦截。 */
export async function readReport(): Promise<HealthReport> {
  const [issues, ignores] = await Promise.all([readPersistedIssues(), listIgnores()]);

  // 通过项只算「这一轮真的跑过的检查」。深扫没跑过就不该出现在通过列表里，
  // 否则用户以为语义冲突也查过了。
  const ranDeep = await hasScan("deep");

  const ran = [...QUICK_CHECKS, ...(ranDeep ? DEEP_CHECKS : [])].map((c) => ({
    code: c.code,
    label: c.label,
  }));

  return buildReport(issues, ignores, ran);
}

async function hasScan(kind: "quick" | "deep"): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("health_scans")
    .select("id")
    .eq("kind", kind)
    .eq("status", "done")
    .limit(1);
  return (data ?? []).length > 0;
}

export async function lastScan(kind: "quick" | "deep"): Promise<ScanMeta | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("health_scans")
    .select("finished_at,coverage")
    .eq("kind", kind)
    .eq("status", "done")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const c = (data.coverage ?? {}) as Partial<Coverage>;
  return {
    finishedAt: data.finished_at,
    coverage:
      typeof c.atoms === "number"
        ? { atoms: c.atoms, skills: c.skills ?? 0, resumes: c.resumes ?? 0, sourceDocs: c.sourceDocs ?? 0 }
        : null,
  };
}

// ---- C7 的跨方向对照 ----

export type CrossCompare = {
  atomTitle: string;
  here: { label: string; text: string };
  there: { label: string; text: string } | null;
};

/**
 * C7 的「去解决」带着 ?block=&compare= 过来。跳到简历页只看见一处，
 * 用户还得自己切到另一个方向再翻一遍 —— 那等于没做跳转。这里把另一处
 * 的原文一起取出来，两处并排放在页面顶上。
 */
export async function getCrossCompare(
  blockId: string,
  otherTargetId: string,
): Promise<CrossCompare | null> {
  const ctx = await loadHealthContext();

  let here: { resume: HealthResume; text: string; atomId: string } | null = null;
  for (const r of ctx.resumes) {
    for (const b of r.blocks) {
      if (b.id !== blockId || !b.atomId) continue;
      here = { resume: r, text: b.renderedText ?? "", atomId: b.atomId };
    }
  }
  if (!here) return null;

  let there: { label: string; text: string } | null = null;
  for (const r of ctx.resumes) {
    if (r.targetId !== otherTargetId) continue;
    for (const b of r.blocks) {
      if (b.atomId !== here.atomId || !b.renderedText) continue;
      there = { label: r.label, text: b.renderedText };
      break;
    }
    if (there) break;
  }

  const atom = ctx.atoms.find((a) => a.id === here.atomId);
  return {
    atomTitle: atom?.title ?? "这条经历",
    here: { label: here.resume.label, text: here.text },
    there,
  };
}

// ---- 忽略 ----

export async function ignoreIssue(
  fingerprint: string,
  code: string,
  reason: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("health_ignores")
    .upsert(
      { fingerprint, code, reason: reason.trim() === "" ? null : reason.trim() },
      { onConflict: "user_id,fingerprint" },
    );
}

export async function restoreIssue(fingerprint: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("health_ignores").delete().eq("fingerprint", fingerprint);
}

// ---- 导入新材料后建议深扫 ----

/**
 * 上一次深扫之后又导入了新材料，那次深扫就不算数了 —— 新旧材料之间的
 * 矛盾正是这一项要找的东西，而它还没看过新的那份。
 */
export async function shouldSuggestDeepScan(): Promise<boolean> {
  const supabase = await createClient();
  const [docQ, scanQ] = await Promise.all([
    supabase
      .from("source_docs")
      .select("ingested_at")
      .not("ingested_at", "is", null)
      .order("ingested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("health_scans")
      .select("finished_at")
      .eq("kind", "deep")
      .eq("status", "done")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const newest = docQ.data?.ingested_at;
  if (!newest) return false;
  // 一份材料都没扫过 → 建议扫；扫过但之后又导入了新的 → 也建议扫。
  const last = scanQ.data?.finished_at;
  return !last || Date.parse(newest) > Date.parse(last);
}

// ---- 顶栏芯片与首页卡 ----

export type HealthSummary = {
  scanned: boolean;
  blockingCount: number;
  minorCount: number;
};

/**
 * 只读不跑。顶栏芯片挂在每个页面上，不能一进任何页面就触发一次全量扫描。
 * 扫描时机按方案定死：进体检页、生成简历前、生成简历后，不做定时扫描。
 *
 * 所以有个「还没扫过」的状态 —— 一次都没体检过时说「一切正常」是撒谎。
 */
export async function healthSummary(): Promise<HealthSummary> {
  const [report, scanned] = await Promise.all([readReport(), hasScan("quick")]);
  return { scanned, blockingCount: report.blockingCount, minorCount: report.minorCount };
}

// ---- 生成前拦截 ----

/**
 * 简历产物里的问题（C3 C4 C5 C6-on-resume C7）**不**作为生成前的拦截项。
 *
 * 理由是它们会死锁：这些问题是上一次生成的产物写出来的，而修好它们的办法
 * 恰恰是重新生成一次（Step 6 还会把上一轮的门禁反馈附给模型）。拿它们拦住
 * 重新生成，等于把用户锁在一个改不了的状态里。
 *
 * 它们照旧拦导出 —— 那是 Step 6 已经做的事，也是真正该拦的那一刀：
 * 有问题的简历可以存在，不可以发出去。
 *
 * 这里拦的是事实层与技能层的阻断（C1 C2）：那些不重新生成也能修，
 * 而且不修的话这次生成出来还是错的。
 */
const PRE_GENERATION_CODES = ["C1", "C2"];

export type PreGenerationBlock = { code: string; title: string; detail: string };

export async function blockingBeforeGeneration(): Promise<PreGenerationBlock[]> {
  // 生成简历前自动跑一次快扫（§五-8.6 自动扫描时机）。
  const report = await runQuickScan();
  return report.blocking
    .filter((i) => PRE_GENERATION_CODES.includes(i.code))
    .map((i) => ({ code: i.code, title: i.title, detail: i.detail }));
}
