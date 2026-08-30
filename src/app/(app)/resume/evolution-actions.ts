"use server";

// =============================================================
// Proofly · 重复 delta 的处理
//
// 「并进基线」不是把一句话塞进去就完了：基线变了，锁定就必须失效，
// 未投递的草稿要重算差异，而已投递的版本一个字都不能动 —— 那是他
// 面试前唯一能复习的东西。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseStringList, type ActionResult } from "@/lib/domain";
import { loadBaselineInput } from "@/lib/queries/resume";
import { checkBlock, hasBlocking, type GateBlock } from "@/lib/resume/gate";
import { refreshRenderedMd, rerunGate } from "@/lib/resume/persist";
import { applyDeltas, deltaRatio, parseDeltas, type DeltaBlock } from "@/lib/resume/delta";
import { signatureOf } from "@/lib/resume/evolution";
import type { EvidenceLevel, Json } from "@/types/database";

function refresh() {
  revalidatePath("/resume");
  revalidatePath("/");
}

export type SignalOutcome = {
  applied: boolean;
  /** 并进基线之后锁定失效，需要重新锁。 */
  unlocked: boolean;
  /** 重算了几份未投递的草稿。 */
  recalculated: number;
};

export async function resolveSignal(
  baselineId: string,
  signature: string,
  accept: boolean,
): Promise<ActionResult<SignalOutcome>> {
  const parsed = z
    .object({ baselineId: z.uuid(), signature: z.string().min(3).max(200) })
    .safeParse({ baselineId, signature });
  if (!parsed.success) return fail("参数不对，刷新一下再试");

  const supabase = await createClient();
  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("id,target_id,locked_at")
    .eq("id", baselineId)
    .maybeSingle();
  if (!baseline) return fail("这份基线已经不在了");

  if (!accept) {
    await logDecision(baselineId, signature, "rejected");
    refresh();
    return ok({ applied: false, unlocked: false, recalculated: 0 });
  }

  // 从最近的版本里取一条同签名的 delta 当样本。
  const { data: versions } = await supabase
    .from("resume_versions")
    .select("id,deltas,submitted_at")
    .eq("baseline_id", baselineId)
    .order("updated_at", { ascending: false });

  let sample = null as ReturnType<typeof parseDeltas>[number] | null;
  for (const v of versions ?? []) {
    for (const d of parseDeltas(v.deltas)) {
      if (d.accepted && signatureOf(d) === signature) {
        sample = d;
        break;
      }
    }
    if (sample) break;
  }
  if (!sample) return fail("这条建议对应的调整已经不在任何版本里了");

  const applied = await applyToBaseline(baseline.id, baseline.target_id, sample);
  if (!applied.ok) return applied;

  // 基线变了 → 锁定失效，必须重新锁。
  await supabase
    .from("resume_baselines")
    .update({ locked_at: null, updated_at: new Date().toISOString() })
    .eq("id", baselineId);

  await refreshRenderedMd(baselineId);
  await rerunGate(baselineId, baseline.target_id);

  // 未投递的草稿重算：这条已经在基线里了，同签名的 delta 不必再有。
  // 已投递的（locked / submitted_at）一个字都不碰。
  const recalculated = await recomputeDrafts(baselineId, signature);

  await logDecision(baselineId, signature, "accepted");
  refresh();
  return ok({ applied: true, unlocked: true, recalculated });
}

async function logDecision(
  baselineId: string,
  signature: string,
  decision: "accepted" | "rejected",
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("baseline_evolution_log")
    .upsert(
      { baseline_id: baselineId, signature, decision, decided_at: new Date().toISOString() },
      { onConflict: "baseline_id,signature" },
    );
}

async function applyToBaseline(
  baselineId: string,
  targetId: string,
  sample: ReturnType<typeof parseDeltas>[number],
): Promise<ActionResult<SignalOutcome>> {
  const supabase = await createClient();
  const input = await loadBaselineInput(targetId);

  const { data: rows } = await supabase
    .from("resume_blocks")
    .select("id,atom_id,section,title,meta,summary,bullets,template_used")
    .eq("baseline_id", baselineId);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));

  const gateOf = (
    r: NonNullable<typeof rows>[number],
    patch: { title?: string; summary?: string; bullets?: string[] },
  ): GateBlock => ({
    id: r.id,
    atomId: r.atom_id,
    section: r.section ?? "",
    title: patch.title ?? r.title ?? "",
    meta: r.meta ?? "",
    summary: patch.summary ?? r.summary ?? "",
    bullets: patch.bullets ?? parseStringList(r.bullets),
    templateUsed: (r.template_used ?? "absent") as EvidenceLevel,
  });

  if (sample.type === "bullet_add") {
    const r = byId.get(sample.targetBlockId);
    if (!r) return fail("这一条要加进去的块已经不在基线里了");
    const bullets = [...parseStringList(r.bullets), sample.after.trim()];
    const atom = input?.atoms.find((a) => a.id === r.atom_id) ?? null;
    if (hasBlocking(checkBlock(gateOf(r, { bullets }), atom))) {
      return fail("这一条并进基线之后过不了门禁，没有改动。");
    }
    await supabase
      .from("resume_blocks")
      .update({
        bullets: bullets as unknown as Json,
        rendered_text: [r.title, r.meta, r.summary, ...bullets].filter(Boolean).join("\n"),
        edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    return ok({ applied: true, unlocked: true, recalculated: 0 });
  }

  if (sample.type === "bullet_drop") {
    const r = byId.get(sample.targetBlockId);
    if (!r) return fail("这一块已经不在基线里了");
    // 连删三次说明这条经历在这个方向下就不该出现：改 render_weight，
    // 只删块的话下次重新生成它又回来了。
    if (r.atom_id) {
      await supabase
        .from("atom_target_strategy")
        .upsert(
          { atom_id: r.atom_id, target_id: targetId, render_weight: "omit" },
          { onConflict: "atom_id,target_id" },
        );
    }
    await supabase.from("resume_blocks").delete().eq("id", r.id);
    const { data: b } = await supabase
      .from("resume_baselines")
      .select("tradeoffs")
      .eq("id", baselineId)
      .maybeSingle();
    const list = Array.isArray(b?.tradeoffs) ? (b.tradeoffs as unknown[]) : [];
    await supabase
      .from("resume_baselines")
      .update({
        tradeoffs: [
          ...list,
          {
            kind: "omit",
            atomId: r.atom_id,
            title: r.title ?? "这条经历",
            detail: "连续多份投递版本都把它删掉，已从基线移除并把这个方向的展开权重设成「省略」。",
          },
        ] as unknown as Json,
      })
      .eq("id", baselineId);
    return ok({ applied: true, unlocked: true, recalculated: 0 });
  }

  // keyword_align：整份基线一起换词。只换命中的块。
  const from = sample.before.trim();
  const to = sample.after.trim();
  if (from === "" || to === "") return fail("这条对齐没有原词或新词，处理不了");

  let touched = 0;
  for (const r of rows ?? []) {
    const bullets = parseStringList(r.bullets);
    const swap = (s: string) => (s.includes(from) ? s.split(from).join(to) : s);
    const next = {
      title: swap(r.title ?? ""),
      summary: swap(r.summary ?? ""),
      bullets: bullets.map(swap),
    };
    const changed =
      next.title !== (r.title ?? "") ||
      next.summary !== (r.summary ?? "") ||
      next.bullets.join("\n") !== bullets.join("\n");
    if (!changed) continue;

    const atom = input?.atoms.find((a) => a.id === r.atom_id) ?? null;
    if (hasBlocking(checkBlock(gateOf(r, next), atom))) continue;

    await supabase
      .from("resume_blocks")
      .update({
        title: next.title,
        summary: next.summary,
        bullets: next.bullets as unknown as Json,
        rendered_text: [next.title, r.meta, next.summary, ...next.bullets]
          .filter(Boolean)
          .join("\n"),
        edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    touched++;
  }
  if (touched === 0) return fail("基线里没有一块用到这个词，不用改");
  return ok({ applied: true, unlocked: true, recalculated: 0 });
}

/**
 * 未投递的草稿重算。
 *
 * 不调模型：这条内容已经在基线里了，草稿里同签名的那条差异是多余的，
 * 去掉再重算一遍 ratio 就够了。所以也不需要「正在重算…」的异步等待，
 * 它在同一个请求里就完成了。
 */
async function recomputeDrafts(baselineId: string, signature: string): Promise<number> {
  const supabase = await createClient();

  const [{ data: baseline }, { data: rows }, { data: versions }] = await Promise.all([
    supabase.from("resume_baselines").select("headline").eq("id", baselineId).maybeSingle(),
    supabase
      .from("resume_blocks")
      .select("id,section,title,meta,summary,bullets,order_index")
      .eq("baseline_id", baselineId)
      .order("order_index", { ascending: true }),
    supabase
      .from("resume_versions")
      .select("id,deltas,submitted_at,locked")
      .eq("baseline_id", baselineId),
  ]);

  const blocks: DeltaBlock[] = (rows ?? []).map((r) => ({
    id: r.id,
    section: r.section ?? "",
    title: r.title ?? "",
    meta: r.meta ?? "",
    summary: r.summary ?? "",
    bullets: parseStringList(r.bullets),
  }));

  let n = 0;
  for (const v of versions ?? []) {
    if (v.submitted_at || v.locked) continue;
    const before = parseDeltas(v.deltas);
    const after = before.filter((d) => signatureOf(d) !== signature);
    const applied = applyDeltas(blocks, baseline?.headline ?? "", after);
    await supabase
      .from("resume_versions")
      .update({
        deltas: after as unknown as Json,
        delta_ratio: deltaRatio(applied.affected, blocks.length),
        updated_at: new Date().toISOString(),
      })
      .eq("id", v.id);
    n++;
  }
  return n;
}
