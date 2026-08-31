// =============================================================
// Proofly · 面试题的组装与防编造检查
//
// 提示词里写了「应答要点里的所有事实必须来自给定的经历数据」。
// 提示词管得住大部分，管不住的那小部分正是用户会在面试现场说出口的话，
// 所以这里再查一遍：编造的数字、教人撒谎的句式、模糊化建议、踩到
// never_say 的词 —— 命中就丢掉那道题，并把丢掉的原因记下来。
//
// 丢题而不是留着改：一道教你编数字的题，留着比没有更糟。
// =============================================================

import { hasSource, knownNumbers } from "@/lib/resume/gate";
import {
  DONT_DO_FALLBACK,
  hasDataGap,
  judgeRisk,
  locateGapMetric,
  methodlessMetrics,
} from "@/lib/interview/risk";
import type { RiskAtom } from "@/lib/interview/risk";
import {
  normalizeCaseKind,
  normalizeDifficulty,
  normalizeProbeType,
  type AnswerPoint,
  type PlannedCase,
  type PlannedProbe,
} from "@/lib/interview/schema";
import type { Probe } from "@/lib/domain";
import type {
  InterviewKind,
  ProbeType,
  QuestionDifficulty,
  RiskLevel,
} from "@/types/database";

/** 出题要用到的一条经历。风险判定那部分直接复用 RiskAtom。 */
export type PlanAtom = RiskAtom & {
  mustSay: string[];
  neverSay: string[];
  probes: Probe[];
  /** 这条经历里所有「有出处」的文字。防编造检查的白名单。 */
  sourceText: string;
};

export type BuiltQuestion = {
  kind: InterviewKind;
  question: string;
  probeType: ProbeType | null;
  difficulty: QuestionDifficulty | null;
  fromAtomId: string | null;
  fromExistingProbe: boolean;
  riskLevel: RiskLevel;
  riskReason: string | null;
  answerOutline: AnswerPoint[];
  dontDo: string | null;
  dataGapHint: string | null;
  gapMetricId: string | null;
  relatedAtomIds: string[];
  whyThisQuestion: string | null;
  sortOrder: number;
};

export const MIN_QUESTIONS = 15;
export const MAX_QUESTIONS = 20;

// ---- 防编造：三条能自动查的 ----

/** 「你可以说你做了 XX」—— 教用户撒谎。验收 16。 */
export const COACHING_LIE = /(你可以说|可以说你|不妨说你|就说你|可以讲你|声称)/;

/** 「可以说效果不错」—— 模糊化建议，追问一轮就崩。验收 17。 */
export const VAGUE_HEDGE =
  /(效果不错|效果挺好|效果还行|反响不错|反响良好|广受好评|成效显著|效果显著|口碑不错|大家都说好|表现良好)/;

/** 应答骨架里会被念出口的全部文字。 */
export function outlineText(outline: AnswerPoint[]): string {
  return outline.map((p) => `${p.label} ${p.content}`).join("\n");
}

/**
 * 应答骨架里出处不明的数字。验收 15。
 *
 * 复用门禁那套：来源文本里出现过的数字（含小数分段）算有出处。
 * 百分号、倍数这些单位不参与匹配，只看数值本身 —— 「5%」在来源里
 * 记的是「5」，要求字面相等只会把所有真数字都判成假的。
 */
export function fabricatedNumbers(outline: AnswerPoint[], sourceText: string): string[] {
  const known = knownNumbers(sourceText);
  const out: string[] = [];
  for (const raw of outlineText(outline).replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)) {
    const token = raw[0];
    if (!hasSource(token, known)) out.push(token);
  }
  return [...new Set(out)];
}

/** never_say 命中。整词包含即算 —— 「连续创业经历」含「创业」。验收 18。 */
export function neverSayHits(text: string, neverSay: string[]): string[] {
  return neverSay.map((w) => w.trim()).filter((w) => w !== "" && text.includes(w));
}

/** must_say 里没在应答骨架中体现的要点。只记 warning，不丢题。验收 19。 */
export function missingMustSay(outline: AnswerPoint[], mustSay: string[]): string[] {
  const text = outlineText(outline);
  return mustSay.map((w) => w.trim()).filter((w) => w !== "" && !text.includes(w));
}

/** 「不要夸大」这类空话不算数：高风险题的 dont_do 必须具体。验收 20。 */
const EMPTY_DONT_DO = /^(不要夸大|不要吹牛|别夸大|实事求是|如实回答|保持诚实)[。.！!]?$/;

export function weakDontDo(s: string): boolean {
  const t = s.trim();
  return t === "" || t.length < 12 || EMPTY_DONT_DO.test(t);
}

/**
 * 一道题的硬问题。非空即丢题。
 * must_say 缺失与 dont_do 空泛不在这里 —— 那是不完整，不是有害。
 */
export function questionProblems(
  q: { question: string; answerOutline: AnswerPoint[] },
  atom: PlanAtom | null,
): string[] {
  const problems: string[] = [];
  const outline = outlineText(q.answerOutline);
  const whole = `${q.question}\n${outline}`;

  if (COACHING_LIE.test(outline)) problems.push("应答骨架里出现了教人编造的句式");
  if (VAGUE_HEDGE.test(outline)) problems.push("应答骨架里出现了模糊化建议，追问一轮就崩");

  if (atom) {
    const hits = neverSayHits(whole, atom.neverSay);
    if (hits.length > 0) problems.push(`踩到叙事护栏的 never_say：${hits.join("、")}`);
    const fake = fabricatedNumbers(q.answerOutline, atom.sourceText);
    if (fake.length > 0) problems.push(`应答骨架里的数字在经历数据里查不到：${fake.join("、")}`);
  }
  return problems;
}

// ---- ai_tech 的技术边界（验收 25） ----

/**
 * 不算「技术栈」的通用词。它们在任何 AI 产品岗的题目里都会出现，
 * 拿它们报越界只会让这条检查变成噪音。
 */
const GENERIC_TOKENS = new Set([
  "ai", "ab", "api", "app", "pm", "kpi", "roi", "ui", "ux", "b", "c", "to",
  "llm", "gpt", "mvp", "okr", "saas", "pmf", "dau", "mau", "gmv", "cvr",
]);

const LATIN_TOKEN = /[A-Za-z][A-Za-z0-9.+#-]{1,}/g;

/**
 * 用户自己的技术词表：技能标签 + 经历正文 + JD 原文。
 *
 * JD 也算进来，因为提示词说的是「从 JD 的技术要求出发，交叉简历上
 * 出现过的技术栈」—— JD 里点名的技术是合法出题依据，只有两边都没有
 * 的才是模型自己想出来的。
 */
export function techVocabulary(sources: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of sources.join("\n").matchAll(LATIN_TOKEN)) {
    out.add(raw[0].toLowerCase());
  }
  return out;
}

/** 题目里出现、但用户简历与 JD 里都找不到的技术名。 */
export function unknownTech(question: string, vocab: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of question.matchAll(LATIN_TOKEN)) {
    const t = raw[0].toLowerCase();
    if (GENERIC_TOKENS.has(t) || vocab.has(t)) continue;
    out.push(raw[0]);
  }
  return [...new Set(out)];
}

// ---- 配额 ----

/**
 * 一条经历该出几题。《Step 7》第三节「数量」那一段。
 * 顺序即优先级：没数据的最狠，其次是有数字没口径的。
 */
export function quotaFor(atom: PlanAtom): number {
  if (atom.evidenceLevel === "designed_only" || atom.evidenceLevel === "absent") return 3;
  if (methodlessMetrics(atom).some((m) => m.evidenceLevel === "measured")) return 2;
  if (atom.evidenceLevel === "estimated") return 2;
  return 1;
}

/**
 * 这条经历最该被问哪一类。超配额要砍的时候，先保住这一类。
 * 模型不一定给得出，但只要它给了，就不该被截断截掉。
 */
export function preferredType(atom: PlanAtom): ProbeType | null {
  if (methodlessMetrics(atom).some((m) => m.evidenceLevel === "measured")) return "attribution";
  if (atom.status === "in_dev") return "progress";
  if (atom.evidenceLevel === "designed_only" || atom.evidenceLevel === "absent") return "effect";
  return null;
}

function normalizeQuestion(s: string): string {
  return s.replace(/[\s，。？?、,.：:；;「」""''（）()]/g, "");
}

export type BuildResult = {
  questions: BuiltQuestion[];
  warnings: string[];
  /** 有硬问题被丢掉的题。重试时把这些原因喂回模型。 */
  rejected: { question: string; problems: string[] }[];
};

/**
 * 项目深挖题的组装。
 *
 * 顺序：认领经历 → 查硬问题 → 按配额截断 → 补到下限 → 代码判风险。
 * 风险最后判，且只看经历数据，不看模型说了什么。
 */
export function buildProbeQuestions(planned: PlannedProbe[], atoms: PlanAtom[]): BuildResult {
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const warnings: string[] = [];
  const rejected: { question: string; problems: string[] }[] = [];

  type Row = { q: PlannedProbe; atom: PlanAtom; type: ProbeType | null; index: number };
  const rows: Row[] = [];
  const seen = new Set<string>();

  planned.forEach((q, index) => {
    const text = q.question.trim();
    if (text === "") return;

    const key = normalizeQuestion(text);
    if (seen.has(key)) {
      warnings.push(`丢掉一道重复的题：「${text}」`);
      return;
    }

    // 只问简历上写了的。认不到经历的题一律丢弃 —— 面试官不会凭空
    // 问一个简历上没提的项目，模型凭空造一个只会浪费准备时间。
    const atom = byId.get(q.from_atom_id.trim());
    if (!atom) {
      warnings.push(`丢掉一道对不上经历的题：「${text}」`);
      return;
    }

    const problems = questionProblems(
      { question: text, answerOutline: q.answer_outline },
      atom,
    );
    if (problems.length > 0) {
      rejected.push({ question: text, problems });
      return;
    }

    seen.add(key);
    rows.push({ q, atom, type: normalizeProbeType(q.probe_type), index });
  });

  // 按经历分组，组内先放该经历最该被问的那一类，其余保持模型给的顺序。
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const list = grouped.get(r.atom.id) ?? [];
    list.push(r);
    grouped.set(r.atom.id, list);
  }

  const kept: Row[] = [];
  const spill: Row[] = [];
  for (const [atomId, list] of grouped) {
    const atom = byId.get(atomId)!;
    const want = preferredType(atom);
    const ordered = [...list].sort(
      (a, b) =>
        Number(b.type === want) - Number(a.type === want) || a.index - b.index,
    );
    const quota = quotaFor(atom);
    kept.push(...ordered.slice(0, quota));
    spill.push(...ordered.slice(quota));
  }

  kept.sort((a, b) => a.index - b.index);
  spill.sort((a, b) => a.index - b.index);

  // 配额是上限不是目标。差一点够不到 15 道，就按原顺序把超配额的补回来。
  //
  // 但只在补得回来的时候补：经历本来就少（比如只有三条，全都有口径）时，
  // 怎么补都到不了 15，那就守住配额 —— 给一条证据充分的经历硬凑五道题，
  // 是在浪费准备时间，不是在多准备。
  if (kept.length + spill.length >= MIN_QUESTIONS) {
    while (kept.length < MIN_QUESTIONS && spill.length > 0) kept.push(spill.shift()!);
  }
  kept.sort((a, b) => a.index - b.index);
  const final = kept.slice(0, MAX_QUESTIONS);

  if (final.length < MIN_QUESTIONS) {
    warnings.push(`只生成了 ${final.length} 道项目深挖题，少于 15 道`);
  }

  // 人工写好的追问预案没被用上。转成题目比重新造一个准，模型漏了要说。
  for (const atom of atoms) {
    if (atom.probes.length === 0) continue;
    const used = final.some((r) => r.atom.id === atom.id && r.q.from_existing_probe);
    if (!used) warnings.push(`「${atom.title}」里人工写的追问预案没有被转成题目`);
  }

  const questions: BuiltQuestion[] = final.map((r, i) => {
    const atom = r.atom;
    const verdict = judgeRisk(atom);
    const hint = r.q.data_gap_hint.trim();

    // 补上口径之后提示必须消失（验收 24）。模型给不给是它的判断，
    // 有没有缺口是事实 —— 以事实为准。
    const keepHint = hint !== "" && hasDataGap(atom);
    const gapMetric = keepHint ? locateGapMetric(atom, hint) : null;

    // 模型自称「来自人工预案」，但这条经历根本没写过预案。
    const claimsProbe = r.q.from_existing_probe && atom.probes.length > 0;

    // 高风险题必须有「别做的事」。模型漏了就用风险判据本身兜底 ——
    // 那句话是从「这条经历为什么危险」推出来的，不是编的。
    let dontDo = r.q.dont_do.trim();
    if (verdict.level === "high" && weakDontDo(dontDo)) {
      warnings.push(`高风险题「${r.q.question.trim()}」的「别做的事」模型没写好，已按风险原因补上`);
      dontDo = (verdict.reason && DONT_DO_FALLBACK[verdict.reason]) || dontDo;
    }
    const missing = missingMustSay(r.q.answer_outline, atom.mustSay);
    if (missing.length > 0) {
      warnings.push(`「${atom.title}」的必说要点没进应答骨架：${missing.join("、")}`);
    }

    return {
      kind: "project_probe" as const,
      question: r.q.question.trim(),
      probeType: r.type,
      difficulty: null,
      fromAtomId: atom.id,
      fromExistingProbe: claimsProbe,
      riskLevel: verdict.level,
      riskReason: verdict.reason,
      answerOutline: r.q.answer_outline,
      dontDo: dontDo === "" ? null : dontDo,
      dataGapHint: keepHint ? hint : null,
      gapMetricId: gapMetric?.id ?? verdict.gapMetric?.id ?? null,
      relatedAtomIds: [],
      whyThisQuestion: null,
      sortOrder: i,
    };
  });

  return { questions, warnings, rejected };
}

/**
 * 案例题的组装。
 *
 * 风险一律 low：它们考察的是能力不是证据，套证明度风险模型只会
 * 让高风险标签失去意义 —— 真正需要提前想清楚的那几道就被淹没了。
 */
export function buildCaseQuestions(
  planned: PlannedCase[],
  atoms: PlanAtom[],
  startOrder: number,
  /** 用户自己的技术词表。不给就跳过 ai_tech 的技术边界检查。 */
  vocab?: Set<string>,
): BuildResult {
  const known = new Set(atoms.map((a) => a.id));
  const warnings: string[] = [];
  const rejected: { question: string; problems: string[] }[] = [];
  const questions: BuiltQuestion[] = [];
  const seen = new Set<string>();

  planned.forEach((q) => {
    const text = q.question.trim();
    if (text === "") return;

    const key = normalizeQuestion(text);
    if (seen.has(key)) {
      warnings.push(`丢掉一道重复的题：「${text}」`);
      return;
    }

    const kind = normalizeCaseKind(q.kind);
    if (!kind) {
      warnings.push(`丢掉一道类别认不出来的题：「${text}」`);
      return;
    }

    // 案例题没有单一来源经历，防编造的白名单是全部经历的文本之和。
    const problems = questionProblems({ question: text, answerOutline: q.answer_outline }, null);
    const allNeverSay = atoms.flatMap((a) => a.neverSay);
    const hits = neverSayHits(`${text}\n${outlineText(q.answer_outline)}`, allNeverSay);
    if (hits.length > 0) problems.push(`踩到叙事护栏的 never_say：${hits.join("、")}`);
    if (problems.length > 0) {
      rejected.push({ question: text, problems });
      return;
    }

    // 引用的经历必须真实存在且在本次简历中出现过。剔除该引用，题目留下。
    const related = q.related_atom_ids.map((s) => s.trim()).filter((id) => known.has(id));
    if (related.length < q.related_atom_ids.filter((s) => s.trim() !== "").length) {
      warnings.push(`「${text}」引用了本次简历里没有的经历，已剔除该引用`);
    }

    // 「他写了什么，就会被问什么」。简历与 JD 里都没有的技术，
    // 出出来只会让人去准备一件不会被问的事 —— 报出来，但不丢题：
    // 词表是按拉丁字母切的，判错的代价不该是少一道题。
    if (kind === "ai_tech" && vocab) {
      const alien = unknownTech(text, vocab);
      if (alien.length > 0) {
        warnings.push(`「${text}」问到了简历与 JD 里都没出现的技术：${alien.join("、")}`);
      }
    }

    seen.add(key);
    questions.push({
      kind,
      question: text,
      probeType: null,
      difficulty: normalizeDifficulty(q.difficulty),
      fromAtomId: null,
      fromExistingProbe: false,
      riskLevel: "low",
      riskReason: null,
      answerOutline: q.answer_outline,
      dontDo: null,
      dataGapHint: null,
      gapMetricId: null,
      relatedAtomIds: related,
      whyThisQuestion: q.why_this_question.trim() || null,
      sortOrder: startOrder + questions.length,
    });
  });

  // 三档比例约 3:5:2。差得远不丢题，但要说 —— 全是常规题的一套题包，
  // 拉不开差距也压不住门槛。
  for (const d of ["basic", "standard", "deep"] as const) {
    if (questions.length >= 6 && !questions.some((q) => q.difficulty === d)) {
      warnings.push(`案例题里一道 ${d} 档都没有，三档比例失衡`);
    }
  }

  return { questions, warnings, rejected };
}
