// =============================================================
// Proofly · 简历质量的四个数
//
// 现有的门禁六道、体检十五码，全部在问「有没有编」。没有一条在问
// 「有没有说」—— 一份什么都没说的简历，在那套体系里是满分。
//
// 这四个数是补上的另一半。P0 只负责把它们算出来（诊断脚本用），
// 不拿它们拦任何东西：生成后再告警，用户只会点忽略。真正的强度门禁
// 要配合编排层的强制配料才有意义，那是 P1。
//
// 纯函数，不连库、不 import Next。
// =============================================================

import { layoutResume, type LayoutBlock } from "./layout";
import type { EvidenceLevel } from "@/types/database";

export type QualityBlock = LayoutBlock & {
  atomId: string | null;
  bullets: string[];
};

export type QualityAtom = {
  id: string;
  title: string;
  evidenceLevel: EvidenceLevel;
  /** metrics 里所有带数字的取值。名称不算 —— 名称出现不等于数据被用上。 */
  metricValues: string[];
};

/**
 * 一个数值的归一形式。去千分位、去单位与空格、去掉百分号。
 *
 * 「5,595 名」与「5595」要算同一个数；「32.2%」与「32.2」也是。
 * 归一之后比字符串，不比数值 —— 比数值会把「0.905」和「0.9050」以外的
 * 精度差异也抹平，那属于「看起来像」，不是「就是它」。
 */
export function normalizeNumber(raw: string): string {
  const t = raw.replace(/,/g, "").trim();
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return "";
  // 去掉小数点后多余的 0：5.0 与 5 是同一个数。
  const n = Number(m[0]);
  return Number.isFinite(n) ? String(n) : "";
}

/** 一段文字里出现的所有数值，归一后去重。 */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.replace(/,/g, "").matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = normalizeNumber(raw[0]);
    if (n !== "") out.add(n);
  }
  return out;
}

/** 一条经历的指标里所有能拿来核对的数值。 */
export function atomMetricNumbers(atom: QualityAtom): Set<string> {
  const out = new Set<string>();
  for (const v of atom.metricValues) {
    for (const n of numbersIn(v)) out.add(n);
  }
  return out;
}

export type EvidenceUsage = {
  /** 简历文本里出现的、能回溯到该经历 metrics 的数值条数。 */
  used: number;
  /** 被选中经历的可用 metrics 数值总数。 */
  available: number;
  rate: number;
  /** 逐条经历的明细，报告里列出来才知道漏在哪。 */
  perAtom: { atomId: string; title: string; used: number; available: number }[];
};

/**
 * 证据利用率。
 *
 * 保守判定：只有当一个数值确实出现在**该经历自己的块**里才算用上。
 * 宁可漏判不可错判 —— 漏判让这个数偏低，方向是安全的；错判会让人
 * 以为证据已经用上了。
 */
export function evidenceUsage(
  blocks: QualityBlock[],
  atoms: QualityAtom[],
): EvidenceUsage {
  const textByAtom = new Map<string, string>();
  for (const b of blocks) {
    if (!b.atomId) continue;
    const prev = textByAtom.get(b.atomId) ?? "";
    textByAtom.set(b.atomId, `${prev}\n${[b.title, b.summary, ...b.bullets].join("\n")}`);
  }

  const perAtom: EvidenceUsage["perAtom"] = [];
  let used = 0;
  let available = 0;
  for (const a of atoms) {
    const wanted = atomMetricNumbers(a);
    if (wanted.size === 0) continue;
    const got = numbersIn(textByAtom.get(a.id) ?? "");
    let hit = 0;
    for (const n of wanted) if (got.has(n)) hit++;
    used += hit;
    available += wanted.size;
    perAtom.push({ atomId: a.id, title: a.title, used: hit, available: wanted.size });
  }
  return { used, available, rate: available === 0 ? 0 : used / available, perAtom };
}

export type QuantCoverage = { withNumber: number; total: number; rate: number };

/**
 * 量化覆盖率：来源经历是 measured 的 bullet 里，有多少条真的带了数字。
 *
 * 分母只算 measured —— designed_only 的块本来就不许写效果数字，
 * 把它们算进来会让这个数天然偏低，读的人会以为是生成的问题。
 */
export function quantCoverage(blocks: QualityBlock[], atoms: QualityAtom[]): QuantCoverage {
  const measured = new Set(
    atoms.filter((a) => a.evidenceLevel === "measured").map((a) => a.id),
  );
  let total = 0;
  let withNumber = 0;
  for (const b of blocks) {
    if (!b.atomId || !measured.has(b.atomId)) continue;
    for (const line of [b.summary, ...b.bullets]) {
      if (line.trim() === "") continue;
      total++;
      if (/\d/.test(line)) withNumber++;
    }
  }
  return { withNumber, total, rate: total === 0 ? 0 : withNumber / total };
}

export type LengthUsage = { lines: number; budget: number; rate: number };

/** 长度利用率：实际正文行数 ÷ 预算。 */
export function lengthUsage(blocks: QualityBlock[], budget: number): LengthUsage {
  const lines = blocks.reduce(
    (n, b) => n + b.bullets.filter((x) => x.trim() !== "").length + (b.summary.trim() ? 1 : 0),
    0,
  );
  return { lines, budget, rate: budget === 0 ? 0 : lines / budget };
}

export type StructureCheck = {
  ok: boolean;
  /** 被渲染成多个顶级标题的任职。P0-2 之后应该是空的。 */
  splitEmployments: string[];
  /** 标题里仍然重复印着公司名的块。P0-1 之后应该是空的。 */
  duplicatedOrg: string[];
};

/**
 * 结构正确性。
 *
 * 两件事：同一段任职有没有被拆成几份工作、公司名有没有印两遍。
 * 判定跑在真正的渲染结果上（layoutResume），不是跑在原始块上 ——
 * 问的是「印出来对不对」，不是「数据长得对不对」。
 */
export function structureCheck(blocks: QualityBlock[]): StructureCheck {
  const groups = layoutResume(blocks);

  const seen = new Map<string, number>();
  for (const g of groups) {
    if (!g.employment) continue;
    seen.set(g.employment.id, (seen.get(g.employment.id) ?? 0) + 1);
  }
  const splitEmployments = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id);

  const duplicatedOrg: string[] = [];
  for (const g of groups) {
    const org = g.employment?.org.trim() ?? "";
    if (org === "") continue;
    for (const item of g.items) {
      if (item.title.includes(org)) duplicatedOrg.push(item.title);
    }
  }

  return {
    ok: splitEmployments.length === 0 && duplicatedOrg.length === 0,
    splitEmployments,
    duplicatedOrg,
  };
}

export type QualityReport = {
  evidence: EvidenceUsage;
  quant: QuantCoverage;
  length: LengthUsage;
  structure: StructureCheck;
};

export function qualityReport(
  blocks: QualityBlock[],
  atoms: QualityAtom[],
  budget: number,
): QualityReport {
  return {
    evidence: evidenceUsage(blocks, atoms),
    quant: quantCoverage(blocks, atoms),
    length: lengthUsage(blocks, budget),
    structure: structureCheck(blocks),
  };
}

export const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
