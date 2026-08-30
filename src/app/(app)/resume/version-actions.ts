"use server";

// =============================================================
// Proofly · 投递版本生成
//
// 一条硬约束：基线没锁定就不生成。不接受任何「为了方便」的例外 ——
// 基线会飘的话，「只生成差异」这件事本身就没有意义了，每份版本都在
// 跟一个不一样的底稿做差异。
//
// 模型给出的 delta 一律先过代码校验：bullet_add 的来源要能在那条经历里
// 找得到、keyword_align 的新词要真的出现在某条 raw_phrase 里、应用之后
// 的块要过门禁。过不了的丢弃并记 warning —— 丢了不能不说，否则用户
// 以为模型只给了 4 处。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { DELTA_SYSTEM, deltaUser } from "@/lib/llm/resume-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseStringList, type ActionResult } from "@/lib/domain";
import { loadBaselineInput } from "@/lib/queries/resume";
import { deltaPlanSchema } from "@/lib/resume/schema";
import {
  applyDeltas,
  deltaRatio,
  farOff,
  overThreshold,
  DELTA_TYPES,
  type Delta,
  type DeltaBlock,
  parseDeltas,
  type DeltaType,
} from "@/lib/resume/delta";
import { refExists, unusedContent, containment, type SourceAtom } from "@/lib/resume/unused";
import { checkBlock, hasBlocking, type GateAtom, type GateBlock } from "@/lib/resume/gate";
import { parseResults } from "@/lib/scoring/parse";
import type { EvidenceLevel, Json } from "@/types/database";

function refresh() {
  revalidatePath("/resume");
  revalidatePath("/targets");
  revalidatePath("/");
}

export type VersionOutcome = {
  versionId: string;
  deltaCount: number;
  deltaRatio: number;
  affected: number;
  totalBlocks: number;
  over: boolean;
  /** 对不上的要求过半 —— 与 over 并列的第二个「差得比较远」信号。 */
  farOff: boolean;
  requirementCount: number;
  acked: boolean;
  warnings: string[];
  unmatched: { requirement_index: number; note: string }[];
};

function metricValue(m: { fromValue: string | null; toValue: string | null; delta: string | null }): string {
  const parts: string[] = [];
  if (m.fromValue && m.toValue) parts.push(`${m.fromValue} → ${m.toValue}`);
  else if (m.toValue) parts.push(m.toValue);
  else if (m.fromValue) parts.push(m.fromValue);
  if (m.delta) parts.push(`（${m.delta}）`);
  return parts.join("") || "（没填数值）";
}

export async function generateVersion(
  jdId: string,
  seedFromVersionId?: string,
): Promise<ActionResult<VersionOutcome>> {
  if (!z.uuid().safeParse(jdId).success) return fail("这份 JD 不存在");
  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("id,target_id,company,role_title")
    .eq("id", jdId)
    .maybeSingle();
  if (!jd) return fail("这份 JD 已经不在了");

  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("id,headline,locked_at")
    .eq("target_id", jd.target_id)
    .maybeSingle();
  if (!baseline) return fail("这个方向还没有基线。先生成一份基线并锁定，再生成投递版本。");
  if (!baseline.locked_at) {
    return fail("先锁定基线。基线会飘的话，「只生成差异」就没有意义了 —— 每份版本都在跟一个不一样的底稿做差异。");
  }

  const [{ data: blockRows }, { data: reqs }, { data: assessments }] = await Promise.all([
    supabase
      .from("resume_blocks")
      .select("id,atom_id,section,title,meta,summary,bullets,template_used,order_index")
      .eq("baseline_id", baseline.id)
      .order("order_index", { ascending: true }),
    supabase
      .from("requirements")
      .select("idx,text,raw_phrase,kind,weight")
      .eq("jd_id", jdId)
      .order("idx", { ascending: true }),
    supabase
      .from("assessments")
      .select("id,results,match_score,created_at")
      .eq("jd_id", jdId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);

  const blocks: DeltaBlock[] = (blockRows ?? []).map((r) => ({
    id: r.id,
    section: r.section ?? "",
    title: r.title ?? "",
    meta: r.meta ?? "",
    summary: r.summary ?? "",
    bullets: parseStringList(r.bullets),
  }));
  if (blocks.length === 0) return fail("基线里一个块都没有，先重新生成一次基线");

  const input = await loadBaselineInput(jd.target_id);
  if (!input) return fail("这个方向已经不在了");

  const sources: SourceAtom[] = input.atoms
    .filter((a) => a.renderWeight !== "omit")
    .map((a) => ({
      id: a.id,
      title: a.title,
      evidenceLevel: a.evidenceLevel,
      actions: a.actions,
      metrics: a.metrics.map((m) => ({
        name: m.name,
        kind: m.kind,
        value: metricValue(m),
        evidenceLevel: m.evidenceLevel,
      })),
    }));

  const blockTexts = blocks.map((b) => [b.title, b.summary, ...b.bullets].join("\n"));
  const unused = unusedContent(sources, blockTexts);

  const assessment = assessments?.[0];
  const results = assessment ? parseResults(assessment.results as Json) : [];
  const rawPhrases = (reqs ?? []).map((r) => (r.raw_phrase ?? r.text ?? "").trim()).filter(Boolean);

  // 以某份版本为起点：把它的 deltas 当初始值一起送进去。
  let seed: Delta[] = [];
  if (seedFromVersionId && z.uuid().safeParse(seedFromVersionId).success) {
    const { data: from } = await supabase
      .from("resume_versions")
      .select("deltas")
      .eq("id", seedFromVersionId)
      .maybeSingle();
    seed = parseDeltas(from?.deltas ?? null).filter((d) => d.accepted);
  }

  const res = await callLLM({
    tier: "strong",
    purpose: "resume_delta",
    system: DELTA_SYSTEM,
    user:
      deltaUser({
        company: jd.company ?? "这家公司",
        roleTitle: jd.role_title ?? "这个岗位",
        requirementsJson: JSON.stringify(
          (reqs ?? []).map((r) => ({
            index: r.idx,
            text: r.text,
            raw_phrase: r.raw_phrase,
            kind: r.kind,
            weight: r.weight,
          })),
        ),
        assessmentJson: JSON.stringify(
          results.map((r) => ({
            requirement_index: r.requirementIndex,
            coverage: r.coverage,
            matched_atom_ids: r.matchedAtomIds,
            matched_titles: r.matchedTitles,
            gap_type: r.gapType,
          })),
        ),
        baselineBlocksJson: JSON.stringify(
          (blockRows ?? []).map((r) => ({
            block_id: r.id,
            atom_id: r.atom_id,
            section: r.section,
            title: r.title,
            bullets: parseStringList(r.bullets),
            template_used: r.template_used,
          })),
        ),
        unusedContentJson: JSON.stringify(unused),
      }) + seedNote(seed),
    jsonSchema: deltaPlanSchema,
  });
  if (!res.ok) return fail(res.error);

  const warnings: string[] = [];
  const accepted: Delta[] = [];
  const knownBlocks = new Set(blocks.map((b) => b.id));
  const byAtom = new Map(sources.map((a) => [a.id, a]));

  for (const [i, raw] of res.data.deltas.entries()) {
    const type = raw.type.trim() as DeltaType;
    if (!DELTA_TYPES.includes(type)) {
      warnings.push(`丢弃了一条类型不认识的调整：${raw.type}`);
      continue;
    }
    if (type !== "headline_tweak" && !knownBlocks.has(raw.target_block_id)) {
      warnings.push(`丢弃了一条指向不存在的块的「${type}」：${raw.after.slice(0, 24)}`);
      continue;
    }

    if (type === "bullet_add") {
      const atom = byAtom.get(raw.source_atom_id);
      if (!atom) {
        warnings.push(`丢弃了一条没写来源经历的「增加一条」：${raw.after.slice(0, 24)}`);
        continue;
      }
      if (!refExists(raw.source_ref, atom)) {
        warnings.push(
          `丢弃了一条来源对不上的「增加一条」：${raw.after.slice(0, 24)}（在「${atom.title}」里找不到「${raw.source_ref.slice(0, 20)}」）`,
        );
        continue;
      }
    }

    if (type === "keyword_align") {
      const to = raw.after.trim();
      const inPhrase = rawPhrases.some((p) => p.includes(to) || containment(to, p) >= 0.9);
      if (!inPhrase) {
        warnings.push(`丢弃了一条对不上 JD 原词的「关键词对齐」：「${to.slice(0, 20)}」不在任何一条要求原文里`);
        continue;
      }
    }

    accepted.push({
      id: `d${i + 1}`,
      type,
      targetBlockId: raw.target_block_id,
      before: raw.before,
      after: raw.after,
      reason: raw.reason,
      sourceAtomId: raw.source_atom_id,
      sourceRef: raw.source_ref,
      accepted: true,
    });
  }

  // 应用之后逐块过门禁。过不了的把那一块相关的 delta 全撤掉 ——
  // 撤单条要反复试，而一块里几条 delta 本来就是一起写的。
  const gateAtoms: GateAtom[] = input.atoms;
  const atomOfBlock = new Map(
    (blockRows ?? []).map((r) => [r.id, r.atom_id as string | null]),
  );
  const templateOfBlock = new Map(
    (blockRows ?? []).map((r) => [r.id, (r.template_used ?? "absent") as EvidenceLevel]),
  );

  let kept = accepted;
  for (let pass = 0; pass < 3; pass++) {
    const applied = applyDeltas(blocks, baseline.headline ?? "", kept);
    const bad = new Set<string>();
    for (const id of applied.affected) {
      if (id === "headline") continue;
      const b = applied.blocks.find((x) => x.id === id);
      if (!b) continue;
      const atomId = atomOfBlock.get(id) ?? null;
      const gb: GateBlock = {
        id,
        atomId,
        section: b.section,
        title: b.title,
        meta: b.meta,
        summary: b.summary,
        bullets: b.bullets,
        templateUsed: templateOfBlock.get(id) ?? "absent",
      };
      const atom = atomId ? gateAtoms.find((a) => a.id === atomId) ?? null : null;
      if (hasBlocking(checkBlock(gb, atom))) bad.add(id);
    }
    if (bad.size === 0) break;
    for (const id of bad) {
      const n = kept.filter((d) => d.targetBlockId === id).length;
      warnings.push(`「${blocks.find((b) => b.id === id)?.title ?? "某一块"}」上的 ${n} 条调整没过门禁，已撤掉`);
    }
    kept = kept.filter((d) => !bad.has(d.targetBlockId));
  }

  const applied = applyDeltas(blocks, baseline.headline ?? "", kept);
  const ratio = deltaRatio(applied.affected, blocks.length);
  const affected = [...applied.affected].filter((x) => x !== "headline").length;

  const { data: existing } = await supabase
    .from("resume_versions")
    .select("id,over_threshold_ack,locked")
    .eq("baseline_id", baseline.id)
    .eq("jd_id", jdId)
    .maybeSingle();
  if (existing?.locked) {
    return fail("这份版本已经标记投递、内容冻结了。要投同类岗位，用「复制一份」。");
  }

  const row = {
    baseline_id: baseline.id,
    jd_id: jdId,
    deltas: kept as unknown as Json,
    delta_ratio: ratio,
    unmatched: res.data.unmatched_requirements as unknown as Json,
    warnings: warnings as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  let versionId: string;
  if (existing) {
    await supabase.from("resume_versions").update(row).eq("id", existing.id);
    versionId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("resume_versions")
      .insert(row)
      .select("id")
      .single();
    if (error || !created) return fail("版本没存上，再试一次");
    versionId = created.id;
  }

  refresh();
  return ok({
    versionId,
    deltaCount: kept.length,
    deltaRatio: ratio,
    affected,
    totalBlocks: blocks.length,
    over: overThreshold(ratio),
    farOff: farOff(res.data.unmatched_requirements.length, (reqs ?? []).length),
    requirementCount: (reqs ?? []).length,
    acked: !!existing?.over_threshold_ack,
    warnings,
    unmatched: res.data.unmatched_requirements,
  });
}

/** 「就这样用」：记下来，同一份版本不再弹。 */
export async function ackOverThreshold(versionId: string): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(versionId).success) return fail("这份版本不存在");
  const supabase = await createClient();
  await supabase
    .from("resume_versions")
    .update({ over_threshold_ack: true, updated_at: new Date().toISOString() })
    .eq("id", versionId);
  refresh();
  return ok(null);
}

function seedNote(seed: Delta[]): string {
  if (seed.length === 0) return "";
  const lines = seed.map((d) => `- [${d.type}] ${d.before} → ${d.after}｜${d.reason}`);
  return `\n\n## 上一份同类岗位版本用过的调整（作为起点，不合适的不要照搬）\n\n${lines.join("\n")}`;
}

/**
 * 逐条接受／拒绝一处调整。
 *
 * 拒绝只会让内容退回基线，不可能引入新的违规；重新接受则可能，
 * 所以两个方向都重跑一遍门禁，过不了就不改。
 */
export async function toggleDelta(
  versionId: string,
  deltaId: string,
  accepted: boolean,
): Promise<ActionResult<{ deltaRatio: number; affected: number; totalBlocks: number }>> {
  if (!z.uuid().safeParse(versionId).success) return fail("这份版本不存在");
  const supabase = await createClient();

  const { data: v } = await supabase
    .from("resume_versions")
    .select("id,baseline_id,deltas,locked")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return fail("这份版本已经不在了");
  if (v.locked) return fail("这份版本已经标记投递、内容冻结了。要改，用「复制一份」。");

  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("id,target_id,headline")
    .eq("id", v.baseline_id)
    .maybeSingle();
  if (!baseline) return fail("基线已经不在了");

  const { data: blockRows } = await supabase
    .from("resume_blocks")
    .select("id,atom_id,section,title,meta,summary,bullets,template_used,order_index")
    .eq("baseline_id", baseline.id)
    .order("order_index", { ascending: true });

  const blocks: DeltaBlock[] = (blockRows ?? []).map((r) => ({
    id: r.id,
    section: r.section ?? "",
    title: r.title ?? "",
    meta: r.meta ?? "",
    summary: r.summary ?? "",
    bullets: parseStringList(r.bullets),
  }));

  const deltas = parseDeltas(v.deltas).map((d) =>
    d.id === deltaId ? { ...d, accepted } : d,
  );

  const applied = applyDeltas(blocks, baseline.headline ?? "", deltas);

  if (accepted) {
    const input = await loadBaselineInput(baseline.target_id);
    const atomOf = new Map((blockRows ?? []).map((r) => [r.id, r.atom_id as string | null]));
    const templateOf = new Map(
      (blockRows ?? []).map((r) => [r.id, (r.template_used ?? "absent") as EvidenceLevel]),
    );
    const touched = deltas.find((d) => d.id === deltaId)?.targetBlockId ?? "";
    const b = applied.blocks.find((x) => x.id === touched);
    if (b) {
      const atomId = atomOf.get(b.id) ?? null;
      const gb: GateBlock = {
        id: b.id,
        atomId,
        section: b.section,
        title: b.title,
        meta: b.meta,
        summary: b.summary,
        bullets: b.bullets,
        templateUsed: templateOf.get(b.id) ?? "absent",
      };
      const atom = atomId ? input?.atoms.find((a) => a.id === atomId) ?? null : null;
      if (hasBlocking(checkBlock(gb, atom))) {
        return fail("这一条接受之后过不了门禁，没有改动。");
      }
    }
  }

  const ratio = deltaRatio(applied.affected, blocks.length);
  await supabase
    .from("resume_versions")
    .update({
      deltas: deltas as unknown as Json,
      delta_ratio: ratio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", versionId);

  refresh();
  revalidatePath(`/resume/${versionId}`);
  return ok({
    deltaRatio: ratio,
    affected: [...applied.affected].filter((x) => x !== "headline").length,
    totalBlocks: blocks.length,
  });
}

/** 「复制一份」：以某版本的差异为起点，为另一份 JD 再跑一次生成。 */
export async function duplicateVersion(
  fromVersionId: string,
  toJdId: string,
): Promise<ActionResult<VersionOutcome>> {
  if (!z.uuid().safeParse(fromVersionId).success) return fail("源版本不存在");
  return generateVersion(toJdId, fromVersionId);
}
