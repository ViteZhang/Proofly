// =============================================================
// Proofly · 措辞门禁
//
// 《Step 6 施工提示词 v1.0》第二节 + 切片 6.1。
// 这一片是后面所有生成的地基：模型写出来的每一句话，落库之前都要过这里。
//
// 不 import Next、不连库 —— 门禁必须能脱离模型和服务器单独跑单测，
// 否则「产出 4 份设计文档放行、响应延迟缩短 300ms 拦截」这种区分
// 就只能靠肉眼看，看不了几遍就会松掉。
//
// 六道检查：
//   G1 措辞与证明度不符
//   G2 触发 never_say
//   G3 出现来源经历中不存在的数字
//   G4 profile_facts 存在 BLOCKING
//   G5 技能栏含 evidence_strength = none 的标签
//   G6 同一互斥组有多条经历同时出现
// =============================================================

import type { EvidenceLevel, EvidenceStrength } from "@/types/database";

// ---- 结果 ----

export type GateCode = "G1" | "G2" | "G3" | "G4" | "G5" | "G6";
export type GateLevel = "blocking" | "warning";

export type GateResult = {
  code: GateCode;
  level: GateLevel;
  /** 关联到哪个块。G4/G5 是整份简历的问题，没有 blockId。 */
  blockId?: string;
  message: string;
  detail: string;
};

// ---- 输入形状 ----

/** 一个待检查的块。模型输出与库里读出来的都归一成这个形状。 */
export type GateBlock = {
  id: string;
  atomId: string | null;
  section: string;
  title: string;
  meta: string;
  summary: string;
  bullets: string[];
  /** 用了哪一档措辞模板。正常情况下等于来源经历的 evidence_level。 */
  templateUsed: EvidenceLevel;
};

/** 块的来源经历。G1 看证明度、G2 看护栏、G3 在这里面找数字。 */
export type GateAtom = {
  id: string;
  title: string;
  evidenceLevel: EvidenceLevel;
  org: string | null;
  role: string | null;
  situation: string | null;
  task: string | null;
  actions: string[];
  metrics: {
    name: string;
    kind: "outcome" | "output";
    fromValue: string | null;
    toValue: string | null;
    delta: string | null;
    method: string | null;
    evidenceLevel: EvidenceLevel;
  }[];
  pendingMetricNames: string[];
  periodStart: string | null;
  periodEnd: string | null;
  mustSay: string[];
  neverSay: string[];
  roleFraming: string | null;
};

export type GateFact = {
  key: string;
  value: string | null;
  status: "RESOLVED" | "PENDING" | "BLOCKING";
};

export type GateSkill = { label: string; strength: EvidenceStrength };

/** G6 用：这个方向下每条经历的互斥组。没配过的传 null。 */
export type GateGroupRef = { atomId: string; atomTitle: string; exclusiveGroup: string | null };

// ---- 正则 ----

// 施工提示词 2.2 的原文，一字不动地留在这里作为基准。
export const FORBIDDEN =
  /(提升|提高|增长|降低|下降|减少|缩短|翻[了]?[一二三四五六七八九十\d]+倍)[^。；，]{0,6}?\d+(\.\d+)?\s*(%|％|倍|个百分点)/;
export const ALLOWED_COUNT = /\d+\s*(份|条|个|页|类|轮|版|人|次)/;

// 上面那条只认 % / 倍 / 个百分点三种量纲，而 6.1 的单测表要求
// 「响应延迟缩短 300ms」在 designed_only 下被拦 —— ms 不在里面，漏掉了。
// 所以实际判定用下面这组：效果动词后面跟任何数字都算效果数字。
//
// 为什么不保留「纯计数放行」的例外：例外只在没有效果动词时才成立。
// 「减少 3 个审批环节」里的「3 个」是计数单位，但它仍然是一句效果宣称，
// 放行就等于给幻觉开了个后门。没有动词的纯计数（「产出 4 份设计文档」）
// 本来就撞不上这条规则，不需要例外来救。
const EFFECT_VERB = "提升|提高|增长|增加|降低|下降|减少|缩短|压缩|节省|优化";
const EFFECT_WITH_NUMBER = new RegExp(`(${EFFECT_VERB})[^。；，,.！!]{0,6}?\\d`);
/** 百分比、倍数、百分点：不管前面有没有动词，出现即是效果数字。 */
const RATIO_NUMBER = /\d+(\.\d+)?\s*(%|％|倍|个百分点)/;
/** 「翻了三倍」这种把数字写成汉字的说法。 */
const TURNS = /翻[了]?[一二三四五六七八九十两半\d]+\s*倍/;
/** estimated 档禁止精确到小数的百分比。 */
const PRECISE_PERCENT = /\d+\.\d+\s*(%|％)/;
/** estimated 档该带的限定词。 */
const HEDGES = ["约", "大约", "internal", "内部测算", "粗估", "估算", "左右", "上下", "近"];

const NUMBER_TOKEN = /\d+(?:\.\d+)?/g;

// ---- 工具 ----

/** 块里所有会印到简历上的文字。meta 也算 —— 手工编辑能改到它。 */
export function blockText(b: GateBlock): string {
  return [b.title, b.meta, b.summary, ...b.bullets].filter(Boolean).join("\n");
}

/** 来源经历里所有「有出处」的文字。G3 的白名单就是它。 */
export function atomText(a: GateAtom): string {
  const m = a.metrics.flatMap((x) => [x.name, x.fromValue, x.toValue, x.delta, x.method]);
  return [
    a.title,
    a.org,
    a.role,
    a.situation,
    a.task,
    ...a.actions,
    ...a.pendingMetricNames,
    ...m,
    a.periodStart,
    a.periodEnd,
  ]
    .filter((s): s is string => typeof s === "string" && s !== "")
    .join("\n");
}

/** 归一化数字：去掉千分位与前导零，5.0 与 5 视为同一个。 */
function normalizeNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.replace(/,/g, "").matchAll(NUMBER_TOKEN)) {
    const n = Number(raw[0]);
    if (Number.isFinite(n)) out.add(String(n));
  }
  return out;
}

// ---- G1 措辞与证明度 ----

/**
 * 一段文字在给定证明度下算不算越界。
 *
 * measured 不限；estimated 只禁精确小数百分比；
 * designed_only 与 absent 禁止任何效果类数字。
 */
export function violatesTemplate(text: string, template: EvidenceLevel): string | null {
  if (template === "measured") return null;

  if (template === "estimated") {
    const hit = text.match(PRECISE_PERCENT);
    return hit ? `estimated 档不许写精确到小数的百分比：「${hit[0]}」` : null;
  }

  // designed_only / absent
  const effect = text.match(EFFECT_WITH_NUMBER) ?? text.match(TURNS) ?? text.match(RATIO_NUMBER);
  if (!effect) return null;
  return `${template} 档不许出现效果类数字：「${effect[0]}」`;
}

// ---- 单块检查 ----

export function checkBlock(block: GateBlock, sourceAtom: GateAtom | null): GateResult[] {
  const out: GateResult[] = [];
  const text = blockText(block);

  // G1
  const violation = violatesTemplate(text, block.templateUsed);
  if (violation) {
    out.push({
      code: "G1",
      level: "blocking",
      blockId: block.id,
      message: "措辞与证明度不符",
      detail: violation,
    });
  }
  if (block.templateUsed === "estimated" && RATIO_NUMBER.test(text)) {
    if (!HEDGES.some((h) => text.includes(h))) {
      out.push({
        code: "G1",
        level: "warning",
        blockId: block.id,
        message: "估算的数字没带限定词",
        detail: "estimated 档的数字要写成「约」「内部测算」这类说法，否则读起来像实测。",
      });
    }
  }

  if (!sourceAtom) {
    // 没有来源经历就查不了护栏和数字。这本身是个问题：块必须能溯源。
    out.push({
      code: "G3",
      level: "blocking",
      blockId: block.id,
      message: "这个块找不到来源经历",
      detail: "无法核对数字出处，也无法比对护栏禁词。",
    });
    return out;
  }

  // G2 —— 包含匹配，不是精确匹配。禁「创业」则「创业公司」也不行。
  for (const word of sourceAtom.neverSay) {
    const w = word.trim();
    if (w === "") continue;
    if (text.includes(w)) {
      out.push({
        code: "G2",
        level: "blocking",
        blockId: block.id,
        message: `触发护栏禁词「${w}」`,
        detail: `来源经历「${sourceAtom.title}」的 never_say 里有「${w}」，这段文字里出现了它。`,
      });
    }
  }

  // 模板与来源证明度不一致：模型自作主张升了一档，比越界写数字更隐蔽。
  if (block.templateUsed !== sourceAtom.evidenceLevel) {
    out.push({
      code: "G1",
      level: "warning",
      blockId: block.id,
      message: "用的模板不是来源经历的证明度",
      detail: `来源是 ${sourceAtom.evidenceLevel}，这个块按 ${block.templateUsed} 写的。`,
    });
  }

  // G3 —— 块里的每个数字都要在来源经历里找得到。
  const known = normalizeNumbers(atomText(sourceAtom));
  const unknown: string[] = [];
  for (const n of normalizeNumbers(text)) if (!known.has(n)) unknown.push(n);
  if (unknown.length > 0) {
    out.push({
      code: "G3",
      level: "blocking",
      blockId: block.id,
      message: `出现了来源经历里没有的数字：${unknown.join("、")}`,
      detail: `经历「${sourceAtom.title}」的 actions 与 metrics 里查不到这些数字。要么是编的，要么是原始记录漏了 —— 两种都得先解决。`,
    });
  }

  // must_say 只提示不阻断：它是「这次没写进去」，不是「写错了」。
  const missing = sourceAtom.mustSay.filter((s) => s.trim() !== "" && !text.includes(s.trim()));
  if (missing.length > 0) {
    out.push({
      code: "G2",
      level: "warning",
      blockId: block.id,
      message: `必说要点没体现：${missing.join("、")}`,
      detail: `来源经历「${sourceAtom.title}」的 must_say 里有这些要点，这个块里没找到。`,
    });
  }

  return out;
}

// ---- 整份简历 ----

export function checkResume(
  blocks: GateBlock[],
  facts: GateFact[],
  skills: GateSkill[],
  groups: GateGroupRef[] = [],
): GateResult[] {
  const out: GateResult[] = [];

  // G4 —— 数据 Step 1 就有，现在就能查。有 BLOCKING 就不该生成简历。
  for (const f of facts) {
    if (f.status !== "BLOCKING") continue;
    out.push({
      code: "G4",
      level: "blocking",
      message: `基本事实「${f.key}」还没定下来`,
      detail: "这一项被标成 BLOCKING，意味着几处材料的说法对不上。先去事实台账把它定死，再生成简历。",
    });
  }

  // G5 —— 空技能标签不该进技能栏。过滤逻辑在选材那一层，
  // 这里是最后一道：真漏进来了就是缺陷，按 blocking 处理。
  for (const s of skills) {
    if (s.strength !== "none") continue;
    out.push({
      code: "G5",
      level: "blocking",
      message: `技能栏里有拿不出证明的标签「${s.label}」`,
      detail: "没有任何经历能支撑的技能标签写进简历，面试第一个问题就会问到它。",
    });
  }

  // G6 —— 互斥组消解应该在选材阶段完成，这里同样是兜底。
  const used = new Set(blocks.map((b) => b.atomId).filter((x): x is string => !!x));
  const byGroup = new Map<string, GateGroupRef[]>();
  for (const g of groups) {
    if (!g.exclusiveGroup || !used.has(g.atomId)) continue;
    const list = byGroup.get(g.exclusiveGroup) ?? [];
    list.push(g);
    byGroup.set(g.exclusiveGroup, list);
  }
  for (const [group, list] of byGroup) {
    // 同一条经历可能被切成多个块，去重后才是「几条经历」。
    const distinct = new Map(list.map((g) => [g.atomId, g]));
    if (distinct.size < 2) continue;
    out.push({
      code: "G6",
      level: "blocking",
      message: `互斥组「${group}」有 ${distinct.size} 条经历同时出现`,
      detail: [...distinct.values()].map((g) => g.atomTitle).join(" / ") + " —— 同组只能留一条。",
    });
  }

  return out;
}

/** 一次跑完：逐块 + 整份。 */
export function checkAll(
  blocks: GateBlock[],
  atoms: GateAtom[],
  facts: GateFact[],
  skills: GateSkill[],
  groups: GateGroupRef[] = [],
): GateResult[] {
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const out: GateResult[] = [];
  for (const b of blocks) out.push(...checkBlock(b, b.atomId ? byId.get(b.atomId) ?? null : null));
  out.push(...checkResume(blocks, facts, skills, groups));
  return out;
}

export function hasBlocking(results: GateResult[]): boolean {
  return results.some((r) => r.level === "blocking");
}

export function blockingOnly(results: GateResult[]): GateResult[] {
  return results.filter((r) => r.level === "blocking");
}

/** 重试时附给模型的违规说明。让它知道具体哪里犯规，而不是笼统重来一次。 */
export function gateFeedback(results: GateResult[]): string {
  const bad = blockingOnly(results);
  if (bad.length === 0) return "";
  const lines = bad.map((r) => `- [${r.code}] ${r.message}｜${r.detail}`);
  return `\n\n## 上一次生成没通过门禁，请针对性修正\n\n${lines.join("\n")}\n\n只修正上面列出的问题，其余措辞保持不变。`;
}
