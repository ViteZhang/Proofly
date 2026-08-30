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
import { checkAll, type GateAtom, type GateBlock, type GateResult } from "./gate";
import { replaceResumeChecks } from "./check-results";
import { loadBaselineInput } from "@/lib/queries/resume";
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

/** 整份重跑门禁并落进 check_results。返回结果供调用方判断要不要拦。 */
export async function rerunGate(
  baselineId: string,
  targetId: string,
): Promise<GateResult[]> {
  const input = await loadBaselineInput(targetId);
  if (!input) return [];
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
  );
  await replaceResumeChecks({ kind: "baseline", id: baselineId }, results);
  return results;
}

/** 按库里当前的块重算 rendered_md 与 block_order。 */
export async function refreshRenderedMd(baselineId: string): Promise<void> {
  const supabase = await createClient();
  const rows = await loadBlocks(baselineId);

  const [{ data: baseline }, { data: facts }] = await Promise.all([
    supabase
      .from("resume_baselines")
      .select("headline,skills")
      .eq("id", baselineId)
      .maybeSingle(),
    supabase.from("profile_facts").select("key,value"),
  ]);

  const value = (k: string) => {
    const v = (facts ?? []).find((f) => f.key === k)?.value;
    return v && v.trim() !== "" ? v.trim() : null;
  };

  const md = renderMarkdown({
    name: value("name") ?? "",
    contact: ["email", "phone", "location"]
      .map(value)
      .filter((s): s is string => !!s),
    headline: baseline?.headline ?? "",
    blocks: rows.map((r) => ({
      section: r.section ?? "",
      title: r.title ?? "",
      meta: r.meta ?? "",
      summary: r.summary ?? "",
      bullets: parseStringList(r.bullets as never),
    })),
    skills: parseStringList((baseline?.skills ?? []) as never),
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
