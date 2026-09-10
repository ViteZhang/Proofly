// =============================================================
// Proofly · 基线落库后的两件收尾事
//
// 手工改了一个块之后，rendered_md 与 check_results 都会过期。
// 过期的 rendered_md 会被导出成一份跟屏幕上不一样的简历；过期的
// check_results 会让导出拦截放行一份其实有问题的简历。两样都得
// 在每次改动之后重算，所以放在一起。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parseStringList } from "@/lib/domain";
import { renderMarkdown } from "./markdown";
import { period } from "@/lib/profile/labels";
import type { LayoutEmployment } from "./layout";
import { checkAll, type GateAtom, type GateBlock, type GateResult } from "./gate";
import { replaceResumeChecks } from "./check-results";
import { loadBaselineInput, loadProfileSections } from "@/lib/queries/resume";
import type { EvidenceLevel } from "@/types/database";

type BlockRow = {
  id: string;
  atom_id: string | null;
  section: string | null;
  title: string | null;
  meta: string | null;
  summary: string | null;
  bullets: unknown;
  template_used: string | null;
  order_index: number | null;
};

function toGateBlock(r: BlockRow): GateBlock {
  return {
    id: r.id,
    atomId: r.atom_id,
    section: r.section ?? "",
    title: r.title ?? "",
    meta: r.meta ?? "",
    summary: r.summary ?? "",
    bullets: parseStringList(r.bullets as never),
    templateUsed: (r.template_used ?? "absent") as EvidenceLevel,
  };
}

async function loadBlocks(baselineId: string): Promise<BlockRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resume_blocks")
    .select("id,atom_id,section,title,meta,summary,bullets,template_used,order_index")
    .eq("baseline_id", baselineId)
    .order("order_index", { ascending: true });
  return (data ?? []) as BlockRow[];
}

/** 每个块挂在哪一段任职下、来源经历自己的 org 是什么。渲染分组要这两样。 */
export async function employmentByAtom(
  atomIds: string[],
): Promise<Map<string, { employment: LayoutEmployment | null; org: string | null }>> {
  const out = new Map<string, { employment: LayoutEmployment | null; org: string | null }>();
  if (atomIds.length === 0) return out;
  const supabase = await createClient();
  const [{ data: atoms }, { data: emps }] = await Promise.all([
    supabase.from("atoms").select("id,org,employment_id").in("id", atomIds),
    supabase.from("employments").select("id,org,title,period_start,period_end"),
  ]);
  const byId = new Map(
    (emps ?? []).map((e) => [
      e.id,
      {
        id: e.id,
        org: e.org ?? "",
        role: e.title ?? "",
        period: period(e.period_start, e.period_end),
      },
    ]),
  );
  for (const a of atoms ?? []) {
    out.set(a.id, {
      employment: a.employment_id ? byId.get(a.employment_id) ?? null : null,
      org: a.org,
    });
  }
  return out;
}

/** 整份重跑门禁并落进 check_results。返回结果供调用方判断要不要拦。 */
export async function rerunGate(
  baselineId: string,
  targetId: string,
): Promise<GateResult[]> {
  const input = await loadBaselineInput(targetId);
  if (!input) return [];
  const supabase = await createClient();
  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("headline")
    .eq("id", baselineId)
    .maybeSingle();
  const rows = await loadBlocks(baselineId);
  const blocks = rows.map(toGateBlock);
  const used = new Set(blocks.map((b) => b.atomId).filter((x): x is string => !!x));
  const atoms: GateAtom[] = input.atoms.filter((a) => used.has(a.id));

  const results = checkAll(
    blocks,
    atoms,
    input.facts,
    input.skills
      .filter((s) => s.strength !== "none")
      .map((s) => ({ label: s.label, strength: s.strength })),
    input.atoms.map((a) => ({
      atomId: a.id,
      atomTitle: a.title,
      exclusiveGroup: a.exclusiveGroup,
    })),
    // 定位段一起重查。这里是整份替换 check_results，漏掉它等于每改一次块
    // 就把定位段的问题悄悄清一次。
    baseline?.headline ?? "",
  );
  await replaceResumeChecks({ kind: "baseline", id: baselineId }, results);
  return results;
}

/** 按库里当前的块重算 rendered_md 与 block_order。 */
export async function refreshRenderedMd(baselineId: string): Promise<void> {
  const supabase = await createClient();
  const rows = await loadBlocks(baselineId);

  const [{ data: baseline }, { data: facts }, profile] = await Promise.all([
    supabase
      .from("resume_baselines")
      .select("headline,skills")
      .eq("id", baselineId)
      .maybeSingle(),
    supabase.from("profile_facts").select("key,value"),
    loadProfileSections(),
  ]);

  const value = (k: string) => {
    const v = (facts ?? []).find((f) => f.key === k)?.value;
    return v && v.trim() !== "" ? v.trim() : null;
  };

  // 渲染要按任职分组，所以得知道每个块挂在哪一段履历下。
  const atomIds = rows.map((r) => r.atom_id).filter((x): x is string => !!x);
  const employmentOf = await employmentByAtom(atomIds);

  const md = renderMarkdown({
    name: value("name") ?? "",
    contact: ["email", "phone", "location"]
      .map(value)
      .filter((s): s is string => !!s),
    headline: baseline?.headline ?? "",
    blocks: rows.map((r) => {
      const e = r.atom_id ? employmentOf.get(r.atom_id) ?? null : null;
      return {
        section: r.section ?? "",
        title: r.title ?? "",
        meta: r.meta ?? "",
        summary: r.summary ?? "",
        bullets: parseStringList(r.bullets as never),
        employment: e?.employment ?? null,
        org: e?.employment?.org ?? e?.org ?? null,
      };
    }),
    skills: parseStringList((baseline?.skills ?? []) as never),
    // 手工改过一个块之后重渲，这两段也得跟着重来 —— 它们直接来自基本
    // 信息，中间不经过模型，漏掉的话导出的那份会缺教育背景。
    educations: profile.educations,
    credentials: profile.credentials,
  });

  await supabase
    .from("resume_baselines")
    .update({
      rendered_md: md,
      block_order: rows.map((r) => r.id) as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", baselineId);
}
