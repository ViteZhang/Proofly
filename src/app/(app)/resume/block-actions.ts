"use server";

// =============================================================
// Proofly · 基线块的手工操作
//
// 拖拽排序、手工改措辞、右键改权重、锁定与解锁。
//
// 一条底线：手工编辑不是绕过门禁的后门。用户直接改块文本之后必须
// 重跑门禁，违规就不保存 —— 否则「模型不许写的话，我自己写一句」
// 就成了一条合法路径，而门禁拦的是会发出去的简历，不是模型。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { BASELINE_SYSTEM, baselineUser } from "@/lib/llm/resume-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { loadBaselineInput, type ResumeAtom } from "@/lib/queries/resume";
import { baselineSchema } from "@/lib/resume/schema";
import { checkBlock, hasBlocking, type GateBlock, type GateResult } from "@/lib/resume/gate";
import { refreshRenderedMd, rerunGate } from "@/lib/resume/persist";
import type { Json, RenderWeight } from "@/types/database";

function refresh() {
  revalidatePath("/resume");
}

type Owner = { baselineId: string; targetId: string; locked: boolean };

/** 块 → 基线 → 方向，顺带把锁定状态取出来。锁定之后一切写操作都不许。 */
async function ownerOfBlock(blockId: string): Promise<Owner | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resume_blocks")
    .select("baseline_id,resume_baselines(id,target_id,locked_at)")
    .eq("id", blockId)
    .maybeSingle();
  const b = data?.resume_baselines as
    | { id: string; target_id: string; locked_at: string | null }
    | null;
  if (!b) return null;
  return { baselineId: b.id, targetId: b.target_id, locked: !!b.locked_at };
}

// ---- 排序 ----

export async function reorderBlocks(
  baselineId: string,
  orderedIds: string[],
): Promise<ActionResult<null>> {
  const parsed = z
    .object({ baselineId: z.uuid(), orderedIds: z.array(z.uuid()).max(60) })
    .safeParse({ baselineId, orderedIds });
  if (!parsed.success) return fail("排序数据不对，刷新一下再试");

  const supabase = await createClient();
  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("id,locked_at")
    .eq("id", baselineId)
    .maybeSingle();
  if (!baseline) return fail("这份基线已经不在了");
  if (baseline.locked_at) return fail("基线已锁定，先解锁再调整顺序");

  // 并发发出去。串行的话七个块就是七个来回，用户会觉得拖一下要卡两秒。
  await Promise.all(
    parsed.data.orderedIds.map((id, i) =>
      supabase
        .from("resume_blocks")
        .update({ order_index: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("baseline_id", baselineId),
    ),
  );
  await refreshRenderedMd(baselineId);
  refresh();
  return ok(null);
}

// ---- 手工编辑 ----

const editSchema = z.object({
  title: z.string().max(200),
  meta: z.string().max(200),
  summary: z.string().max(600),
  bullets: z.array(z.string().max(400)).max(8),
});

export type EditResult =
  | { status: "saved" }
  | { status: "rejected"; results: GateResult[] };

export async function editBlock(
  blockId: string,
  patch: z.infer<typeof editSchema>,
): Promise<ActionResult<EditResult>> {
  if (!z.uuid().safeParse(blockId).success) return fail("这个块不存在");
  const parsed = editSchema.safeParse(patch);
  if (!parsed.success) return fail("内容太长了，精简一下再存");

  const owner = await ownerOfBlock(blockId);
  if (!owner) return fail("这个块已经不在了");
  if (owner.locked) return fail("基线已锁定，先解锁再改");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("resume_blocks")
    .select("id,atom_id,section,template_used")
    .eq("id", blockId)
    .maybeSingle();
  if (!row) return fail("这个块已经不在了");

  const input = await loadBaselineInput(owner.targetId);
  const atom = input?.atoms.find((a) => a.id === row.atom_id) ?? null;

  const bullets = parsed.data.bullets.map((b) => b.trim()).filter((b) => b !== "");
  const block: GateBlock = {
    id: blockId,
    atomId: row.atom_id,
    section: row.section ?? "",
    title: parsed.data.title.trim(),
    meta: parsed.data.meta.trim(),
    summary: parsed.data.summary.trim(),
    bullets,
    // 模板一律取来源经历的证明度。用户改文本不会改证明度 ——
    // 能改的话，「把这块标成实测」就是绕过门禁最省事的办法。
    templateUsed: atom?.evidenceLevel ?? ((row.template_used ?? "absent") as never),
  };

  const results = checkBlock(block, atom);
  if (hasBlocking(results)) {
    return ok({ status: "rejected", results });
  }

  await supabase
    .from("resume_blocks")
    .update({
      title: block.title,
      meta: block.meta,
      summary: block.summary,
      bullets: block.bullets as unknown as Json,
      template_used: block.templateUsed,
      rendered_text: [block.title, block.meta, block.summary, ...block.bullets]
        .filter(Boolean)
        .join("\n"),
      edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", blockId);

  await refreshRenderedMd(owner.baselineId);
  await rerunGate(owner.baselineId, owner.targetId);
  refresh();
  return ok({ status: "saved" });
}

// ---- 右键菜单：压缩为一行 / 省略 ----

/**
 * 改的是该方向的 render_weight，不是这一个块的显示方式。
 * 「压缩为一行」如果只改块，下次重新生成就会打回原形，
 * 而用户以为自己已经把这条经历定成一行了。
 */
export async function setBlockWeight(
  blockId: string,
  weight: RenderWeight,
): Promise<ActionResult<{ removed: boolean }>> {
  if (!z.uuid().safeParse(blockId).success) return fail("这个块不存在");
  if (!["expand", "brief", "one_line", "omit"].includes(weight)) return fail("展开权重不对");

  const owner = await ownerOfBlock(blockId);
  if (!owner) return fail("这个块已经不在了");
  if (owner.locked) return fail("基线已锁定，先解锁再改");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("resume_blocks")
    .select("id,atom_id")
    .eq("id", blockId)
    .maybeSingle();
  if (!row?.atom_id) return fail("这个块没有来源经历，改不了权重");

  const { error } = await supabase
    .from("atom_target_strategy")
    .upsert(
      { atom_id: row.atom_id, target_id: owner.targetId, render_weight: weight },
      { onConflict: "atom_id,target_id" },
    );
  if (error) return fail("权重没存上，再试一次");

  if (weight === "omit") {
    const input = await loadBaselineInput(owner.targetId);
    const atom = input?.atoms.find((a) => a.id === row.atom_id);
    await supabase.from("resume_blocks").delete().eq("id", blockId);
    await appendTradeoff(owner.baselineId, {
      kind: "omit",
      atomId: row.atom_id,
      title: atom?.title ?? "这条经历",
      detail: "在基线页上被设成了「省略」，本版没有出现。",
    });
    await refreshRenderedMd(owner.baselineId);
    await rerunGate(owner.baselineId, owner.targetId);
    refresh();
    return ok({ removed: true });
  }

  const r = await regenerateOne(owner, row.atom_id, weight);
  if (!r.ok) return fail(r.error);
  refresh();
  return ok({ removed: false });
}

async function appendTradeoff(
  baselineId: string,
  item: { kind: string; atomId: string | null; title: string; detail: string },
): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resume_baselines")
    .select("tradeoffs")
    .eq("id", baselineId)
    .maybeSingle();
  const list = Array.isArray(data?.tradeoffs) ? (data.tradeoffs as unknown[]) : [];
  await supabase
    .from("resume_baselines")
    .update({ tradeoffs: [...list, item] as unknown as Json })
    .eq("id", baselineId);
}

/**
 * 只重新生成一条经历的块。
 *
 * 走的还是 4.1 那段提示词，只是选中的经历只有一条 —— 换一段更短的
 * 提示词会让这一块的措辞标准跟其余块不一样，而用户看的是同一页纸。
 */
async function regenerateOne(
  owner: Owner,
  atomId: string,
  weight: RenderWeight,
): Promise<ActionResult<null>> {
  const input = await loadBaselineInput(owner.targetId);
  if (!input) return fail("这个方向已经不在了");
  const atom = input.atoms.find((a) => a.id === atomId);
  if (!atom) return fail("这条经历已经不在了");

  const res = await callLLM({
    tier: "strong",
    purpose: "resume_block",
    system: BASELINE_SYSTEM,
    user: baselineUser({
      targetName: input.target.name,
      targetNarrative: input.target.narrative || "（还没写主线故事）",
      profileFactsJson: JSON.stringify(input.facts),
      selectedAtomsJson: JSON.stringify([atomPayload(atom, weight)]),
      skillsJson: JSON.stringify([]),
      rawPhrasesJson: JSON.stringify(input.rawPhrases.slice(0, 60)),
    }),
    jsonSchema: baselineSchema,
  });
  if (!res.ok) return fail(res.error);

  const planned = res.data.blocks.find((b) => b.atom_id === atomId) ?? res.data.blocks[0];
  if (!planned) return fail("模型没给出这一块，再试一次");

  const cap = weight === "expand" ? 5 : weight === "brief" ? 2 : 0;
  const bullets = planned.bullets.map((b) => b.trim()).filter(Boolean).slice(0, cap);
  const summary =
    weight === "one_line"
      ? planned.summary.trim() || planned.bullets.join("；")
      : planned.summary.trim();

  const block: GateBlock = {
    id: "regen",
    atomId,
    section: planned.section,
    title: planned.title.trim() || atom.title,
    meta: planned.meta.trim(),
    summary,
    bullets: weight === "one_line" ? [] : bullets,
    templateUsed: atom.evidenceLevel,
  };
  const results = checkBlock(block, atom);
  if (hasBlocking(results)) {
    return fail(
      `重新生成的这一块没过门禁：${results
        .filter((r) => r.level === "blocking")
        .map((r) => r.message)
        .join("；")}。再试一次通常就好了。`,
    );
  }

  const supabase = await createClient();
  await supabase
    .from("resume_blocks")
    .update({
      title: block.title,
      meta: block.meta,
      summary: block.summary,
      bullets: block.bullets as unknown as Json,
      template_used: block.templateUsed,
      rendered_text: [block.title, block.meta, block.summary, ...block.bullets]
        .filter(Boolean)
        .join("\n"),
      edited: false,
      updated_at: new Date().toISOString(),
    })
    .eq("baseline_id", owner.baselineId)
    .eq("atom_id", atomId);

  await refreshRenderedMd(owner.baselineId);
  await rerunGate(owner.baselineId, owner.targetId);
  return ok(null);
}

function atomPayload(a: ResumeAtom, weight: RenderWeight) {
  return {
    id: a.id,
    title: a.title,
    org: a.org,
    role: a.role,
    period: [a.periodStart, a.periodEnd ?? "至今"].filter(Boolean).join(" – "),
    status: a.status,
    evidence_level: a.evidenceLevel,
    situation: a.situation ?? "",
    task: a.task ?? "",
    actions: a.actions,
    metrics: a.metrics.map((m) => ({
      name: m.name,
      kind: m.kind,
      from: m.fromValue,
      to: m.toValue,
      delta: m.delta,
      evidence_level: m.evidenceLevel,
    })),
    guards: { must_say: a.mustSay, never_say: a.neverSay, role_framing: a.roleFraming },
    render_weight: weight,
  };
}

// ---- 锁定 / 解锁 ----

export async function lockBaseline(baselineId: string): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(baselineId).success) return fail("这份基线不存在");
  const supabase = await createClient();

  const { data: baseline } = await supabase
    .from("resume_baselines")
    .select("id,target_id")
    .eq("id", baselineId)
    .maybeSingle();
  if (!baseline) return fail("这份基线已经不在了");

  // 锁定意味着「从此以后只生成差异」。带着 blocking 问题锁定，
  // 后面每一份投递版本都继承同一处问题。
  const results = await rerunGate(baselineId, baseline.target_id);
  if (hasBlocking(results)) {
    return fail(
      `还有 ${results.filter((r) => r.level === "blocking").length} 处必须先解决，解决完再锁。`,
    );
  }

  await supabase
    .from("resume_baselines")
    .update({ locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", baselineId);
  refresh();
  return ok(null);
}

export async function unlockBaseline(baselineId: string): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(baselineId).success) return fail("这份基线不存在");
  const supabase = await createClient();
  await supabase
    .from("resume_baselines")
    .update({ locked_at: null, updated_at: new Date().toISOString() })
    .eq("id", baselineId);
  refresh();
  return ok(null);
}
