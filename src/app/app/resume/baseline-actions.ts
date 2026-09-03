"use server";

// =============================================================
// Proofly · 基线生成
//
// 顺序是固定的：选材（代码）→ 渲染（模型）→ 门禁（代码）→ 写入。
// 门禁不过就不写入 —— 一份带着违规措辞的简历落进库里，下一次它就是
// 「用户确认过的基线」，再也没人会去重看那一句。
//
// 基线行先建、块后写：生成失败时门禁错误要有地方挂（check_results 按
// baseline 归属），重试才能把上一次的违规原文附给模型。让客户端把错误
// 传回来也能做到，但那等于开了一条「前端能往提示词里塞任意文本」的路。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { BASELINE_SYSTEM, baselineUser } from "@/lib/llm/resume-prompts";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { loadBaselineInput, toSelectable, type ResumeAtom } from "@/lib/queries/resume";
import { resolveSelection, selectSkills, type Tradeoff } from "@/lib/resume/select";
import { baselineSchema, type PlannedBlock } from "@/lib/resume/schema";
import {
  checkAll,
  gateFeedback,
  hasBlocking,
  type GateBlock,
  type GateResult,
} from "@/lib/resume/gate";
import { listResumeChecks, replaceResumeChecks } from "@/lib/resume/check-results";
import { blockingBeforeGeneration, runQuickScan } from "@/lib/queries/health";
import { renderMarkdown, type RenderBlock } from "@/lib/resume/markdown";
import type { Json, RenderWeight } from "@/types/database";

const SECTIONS = ["个人项目", "工作经历", "教育背景"] as const;
type Section = (typeof SECTIONS)[number];

/** 3.1 的 bullet 上限。模型会超，超了就截 —— 权重是用户定的，不是建议。 */
const BULLET_CAP: Record<RenderWeight, number> = {
  expand: 5,
  brief: 2,
  one_line: 0,
  omit: 0,
};

export type GenerateOutcome =
  | { status: "ok"; baselineId: string; blocks: number; warnings: GateResult[] }
  | { status: "blocked"; baselineId: string | null; results: GateResult[] };

function refresh() {
  revalidatePath("/app/resume");
  revalidatePath("/app/targets");
  revalidatePath("/");
  revalidatePath("/app/health");
}

/**
 * 生成完成后再扫一次（§五-8.6 自动扫描时机）。刚写出来的简历会带进新的
 * 门禁结果，顶栏芯片和体检页得跟着走 —— 否则用户看到的是上一次的数。
 */
async function rescanAfterGeneration() {
  await runQuickScan();
  revalidatePath("/app/health");
  revalidatePath("/", "layout");
}

/** 一个方向一份基线。已存在就复用，不新建。 */
async function ensureBaseline(targetId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: found } = await supabase
    .from("resume_baselines")
    .select("id")
    .eq("target_id", targetId)
    .maybeSingle();
  if (found) return found.id;

  const { data } = await supabase
    .from("resume_baselines")
    .insert({ target_id: targetId })
    .select("id")
    .single();
  return data?.id ?? null;
}

function sectionOf(raw: string, atom: ResumeAtom): Section {
  const hit = SECTIONS.find((s) => raw.includes(s));
  if (hit) return hit;
  return atom.context === "employment" ? "工作经历" : "个人项目";
}

function periodLabel(atom: ResumeAtom): string {
  const fmt = (d: string | null) => (d ? d.slice(0, 7).replace("-", ".") : null);
  const start = fmt(atom.periodStart);
  const end = atom.periodEnd ? fmt(atom.periodEnd) : "至今";
  if (!start) return atom.periodEnd ? `– ${end}` : "";
  return `${start} – ${end}`;
}

export async function generateBaseline(
  targetId: string,
): Promise<ActionResult<GenerateOutcome>> {

  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");

  const supabase = await createClient();
  const input = await loadBaselineInput(targetId);
  if (!input) return fail("这个方向已经不在了");

  const { data: existing } = await supabase
    .from("resume_baselines")
    .select("id,locked_at")
    .eq("target_id", targetId)
    .maybeSingle();
  if (existing?.locked_at) {
    return fail("基线已锁定。要重新生成，先解锁 —— 锁定的意义就是措辞不会在你不知道的时候变。");
  }

  // 生成前先过一遍体检（Step 8 §五-8.6）。放在调用模型之前，省下的不只是
  // 钱：生成出来再拦，用户会以为是模型的问题。
  //
  // 拦的是事实层与技能层的阻断，不含简历产物自身的问题 —— 那些正是靠
  // 重新生成来修的，拿它们拦住重新生成会把人锁死。详见 blockingBeforeGeneration。
  const preBlocks = await blockingBeforeGeneration();
  if (preBlocks.length > 0) {
    const results: GateResult[] = preBlocks.map((b) => ({
      code: "G4" as const,
      level: "blocking" as const,
      message: b.title,
      detail: b.detail,
    }));
    const id = existing?.id ?? null;
    if (id) await replaceResumeChecks({ kind: "baseline", id }, results);
    return ok({ status: "blocked", baselineId: id, results });
  }

  const { selected, tradeoffs: atomTradeoffs } = resolveSelection(input.atoms.map(toSelectable));
  if (selected.length === 0) {
    return fail("这个方向下没有一条经历会出现在简历里。先去经历 × 方向策略把展开权重配一下。");
  }
  const { kept: skills, tradeoffs: skillTradeoffs } = selectSkills(input.skills, input.rawPhrases);
  const tradeoffs: Tradeoff[] = [...atomTradeoffs, ...skillTradeoffs];

  const baselineId = await ensureBaseline(targetId);
  if (!baselineId) return fail("基线建不起来，稍后再试一次");

  const byId = new Map(input.atoms.map((a) => [a.id, a]));
  const chosen = selected.map((s) => byId.get(s.id)!).filter(Boolean);
  const weightById = new Map(chosen.map((a) => [a.id, a.renderWeight]));

  // 上一次没过门禁的原文。重试时附给模型，让它知道具体哪里犯规。
  const prior = await listResumeChecks({ kind: "baseline", id: baselineId });
  const feedback = gateFeedback(
    prior
      .filter((c) => c.level === "blocking")
      .map((c) => ({
        code: (c.code ?? "G1") as GateResult["code"],
        level: "blocking" as const,
        blockId: c.blockId ?? undefined,
        message: c.title,
        detail: c.detail ?? "",
      })),
  );

  const res = await callLLM({
    tier: "strong",
    purpose: "resume_baseline",
    system: BASELINE_SYSTEM,
    user:
      baselineUser({
        targetName: input.target.name,
        targetNarrative: input.target.narrative || "（还没写主线故事）",
        profileFactsJson: JSON.stringify(
          input.facts.map((f) => ({ key: f.key, value: f.value, status: f.status })),
        ),
        selectedAtomsJson: JSON.stringify(
          chosen.map((a) => ({
            id: a.id,
            title: a.title,
            org: a.org,
            role: a.role,
            period: periodLabel(a),
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
            guards: {
              must_say: a.mustSay,
              never_say: a.neverSay,
              role_framing: a.roleFraming,
            },
            render_weight: a.renderWeight,
          })),
        ),
        skillsJson: JSON.stringify(skills.map((s) => s.label)),
        rawPhrasesJson: JSON.stringify(input.rawPhrases.slice(0, 60)),
      }) + feedback,
    jsonSchema: baselineSchema,
  });
  if (!res.ok) return fail(res.error);

  const { blocks, warnings } = normalizeBlocks(res.data.blocks, chosen, weightById);
  if (blocks.length === 0) {
    return fail("模型没有产出任何可用的块，再试一次");
  }

  const results = [
    ...warnings,
    ...checkAll(
      blocks,
      chosen,
      input.facts,
      skills.map((s) => ({ label: s.label, strength: s.strength })),
      chosen.map((a) => ({
        atomId: a.id,
        atomTitle: a.title,
        exclusiveGroup: a.exclusiveGroup,
      })),
    ),
  ];

  if (hasBlocking(results)) {
    await replaceResumeChecks({ kind: "baseline", id: baselineId }, results);
    return ok({ status: "blocked", baselineId, results });
  }

  // ---- 写入 ----
  await supabase.from("resume_blocks").delete().eq("baseline_id", baselineId);

  const { data: written } = await supabase
    .from("resume_blocks")
    .insert(
      blocks.map((b, i) => ({
        baseline_id: baselineId,
        atom_id: b.atomId,
        section: b.section,
        title: b.title,
        meta: b.meta,
        summary: b.summary,
        bullets: b.bullets as unknown as Json,
        must_say_covered: (mustSayOf(res.data.blocks, b.atomId) ?? []) as unknown as Json,
        template_used: b.templateUsed,
        rendered_text: [b.title, b.meta, b.summary, ...b.bullets].filter(Boolean).join("\n"),
        order_index: i,
      })),
    )
    .select("id,order_index");

  const order = (written ?? [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((r) => r.id);

  const md = renderMarkdown({
    name: factValue(input.facts, "name") ?? "",
    contact: ["email", "phone", "location"]
      .map((k) => factValue(input.facts, k))
      .filter((s): s is string => !!s),
    headline: res.data.headline,
    blocks: blocks.map(toRenderBlock),
    skills: skills.map((s) => s.label),
  });

  await supabase
    .from("resume_baselines")
    .update({
      headline: res.data.headline,
      tradeoffs: tradeoffs as unknown as Json,
      skills: skills.map((s) => s.label) as unknown as Json,
      block_order: order as unknown as Json,
      rendered_md: md,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", baselineId);

  await replaceResumeChecks({ kind: "baseline", id: baselineId }, results);
  await rescanAfterGeneration();
  refresh();
  return ok({ status: "ok", baselineId, blocks: blocks.length, warnings: results });
}

function factValue(facts: { key: string; value: string | null }[], key: string): string | null {
  const v = facts.find((f) => f.key === key)?.value;
  return v && v.trim() !== "" ? v.trim() : null;
}

function toRenderBlock(b: GateBlock): RenderBlock {
  return {
    section: b.section,
    title: b.title,
    meta: b.meta,
    summary: b.summary,
    bullets: b.bullets,
  };
}

function mustSayOf(planned: PlannedBlock[], atomId: string | null): string[] | null {
  if (!atomId) return null;
  const hit = planned.find((p) => p.atom_id === atomId);
  return hit ? hit.must_say_covered : null;
}

/**
 * 把模型输出归一成可入库的块。
 *
 * 三件事在这里定死，都不交给模型：
 *   1. template_used 一律取来源经历的 evidence_level。模型自报的那个
 *      只用来判断它有没有搞错，搞错了记 warning。
 *   2. bullet 条数按 render_weight 截断。one_line 权重不留 bullet。
 *   3. 同一条经历的多个块合并成一块 —— 一条经历一个 ProofDot，
 *      拆成两块之后右侧面板就说不清「这一块的来源是哪条」。
 */
function normalizeBlocks(
  planned: PlannedBlock[],
  atoms: ResumeAtom[],
  weightById: Map<string, RenderWeight>,
): { blocks: GateBlock[]; warnings: GateResult[] } {
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const warnings: GateResult[] = [];
  const merged = new Map<string, GateBlock>();
  const order: string[] = [];

  for (const p of planned) {
    const atom = byId.get(p.atom_id);
    if (!atom) {
      warnings.push({
        code: "G3",
        level: "warning",
        message: "模型产出了一个找不到来源经历的块，已丢弃",
        detail: `atom_id = ${p.atom_id || "(空)"}｜标题「${p.title}」`,
      });
      continue;
    }

    const existing = merged.get(atom.id);
    if (existing) {
      existing.bullets.push(...p.bullets);
      if (existing.summary === "") existing.summary = p.summary;
      continue;
    }

    merged.set(atom.id, {
      // 入库前用 atom id 当临时 blockId，门禁报错时指得回具体那一块。
      id: atom.id,
      atomId: atom.id,
      section: sectionOf(p.section, atom),
      title: p.title.trim() || atom.title,
      meta: p.meta.trim() || periodLabel(atom),
      summary: p.summary.trim(),
      bullets: [...p.bullets],
      templateUsed: atom.evidenceLevel,
    });
    order.push(atom.id);

    if (p.template_used && p.template_used !== atom.evidenceLevel) {
      warnings.push({
        code: "G1",
        level: "warning",
        blockId: atom.id,
        message: "模型自报的措辞模板与来源经历的证明度不一致",
        detail: `来源是 ${atom.evidenceLevel}，模型报的是 ${p.template_used}。已按来源的证明度重跑门禁。`,
      });
    }
  }

  for (const atom of atoms) {
    if (!merged.has(atom.id)) {
      warnings.push({
        code: "G3",
        level: "warning",
        message: `经历「${atom.title}」没被写进简历`,
        detail: "它在这个方向下不是「省略」，但模型没给它出块。重新生成一次通常就有了。",
      });
    }
  }

  const blocks: GateBlock[] = [];
  for (const id of order) {
    const b = merged.get(id)!;
    const weight = weightById.get(id) ?? "brief";
    const cap = BULLET_CAP[weight];
    const clean = b.bullets.map((x) => x.trim()).filter((x) => x !== "");

    if (weight === "one_line") {
      // 一行概述，无 bullet。模型给了 bullet 就并进概述，不能直接扔。
      if (b.summary === "") b.summary = clean.join("；");
      b.bullets = [];
    } else {
      if (clean.length > cap) {
        warnings.push({
          code: "G1",
          level: "warning",
          blockId: id,
          message: `「${b.title}」给了 ${clean.length} 条 bullet，按「${weight}」权重截到 ${cap} 条`,
          detail: "展开权重是这个方向下配好的，不是建议值。要更长就去改权重。",
        });
      }
      b.bullets = clean.slice(0, cap);
    }
    blocks.push(b);
  }

  // 同一 section 的块连在一起。section 的先后按它们第一次出现的顺序，
  // 不按我定的固定次序 —— 哪一段最该放前面，是模型看着 JD 判断的。
  const rank = new Map<string, number>();
  for (const b of blocks) if (!rank.has(b.section)) rank.set(b.section, rank.size);
  blocks.sort((a, b) => (rank.get(a.section) ?? 0) - (rank.get(b.section) ?? 0));

  return { blocks, warnings };
}

export type SelectionPreview = {
  targetName: string;
  atoms: { id: string; title: string; renderWeight: RenderWeight; evidenceLevel: string }[];
  skills: string[];
  tradeoffs: Tradeoff[];
  locked: boolean;
};

/**
 * 选材预览。不调模型，所以是瞬时的。
 *
 * 单独做成一个动作，是为了「正在生成」那段时间里能先说点确定的事：
 * 选了哪 8 条、谁落选了、为什么落选。整个过程只有一个转圈的话，
 * 用户在等的十几秒里得不到任何信息，而这些信息本来就是现成的。
 */
export async function prepareBaseline(
  targetId: string,
): Promise<ActionResult<SelectionPreview>> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");
  const input = await loadBaselineInput(targetId);
  if (!input) return fail("这个方向已经不在了");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("resume_baselines")
    .select("locked_at")
    .eq("target_id", targetId)
    .maybeSingle();

  const { selected, tradeoffs } = resolveSelection(input.atoms.map(toSelectable));
  const { kept, tradeoffs: skillTradeoffs } = selectSkills(input.skills, input.rawPhrases);

  return ok({
    targetName: input.target.name,
    atoms: selected.map((a) => ({
      id: a.id,
      title: a.title,
      renderWeight: a.renderWeight,
      evidenceLevel: a.evidenceLevel,
    })),
    skills: kept.map((s) => s.label),
    tradeoffs: [...tradeoffs, ...skillTradeoffs],
    locked: !!existing?.locked_at,
  });
}
