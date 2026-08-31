// =============================================================
// Proofly · 面试题风险判定
//
// 风险由代码算，不由模型给。模型输出里的风险标记一律忽略。
//
// 原因在《Step 7 施工提示词》第一节：最危险的不是「知道自己没数据」，
// 而是「有数字但说不清口径」。「学员次日留存提升约 5%」听起来很实，
// 面试官一问「怎么归因的、有没有对照组」，method 是空的就当场卡住 ——
// 而且因为它看起来有底气，你根本不会提前准备。
//
// 让模型判这一档，等于指望它替用户担心一件用户自己都没意识到的事。
// =============================================================

import type { AtomStatus, EvidenceLevel, RiskLevel } from "@/types/database";

/** 判定要用到的一条指标。 */
export type RiskMetric = {
  id: string;
  name: string;
  kind: "outcome" | "output";
  evidenceLevel: EvidenceLevel;
  /** 口径说明。空白（null / "" / 纯空格）都算没填。 */
  method: string | null;
};

/** 判定要用到的一条经历，以及它在本次简历里的样子。 */
export type RiskAtom = {
  id: string;
  title: string;
  evidenceLevel: EvidenceLevel;
  status: AtomStatus;
  metrics: RiskMetric[];
  /**
   * 该经历在本次投递版本中的块。null = 没被选进这份简历。
   * expanded 的判据是「有没有 bullet」：Step 6 按权重截 bullet
   * （expand 5 / brief 2 / one_line 0），所以有 bullet 就是展开了。
   * 用块的实际内容判，而不是回头去查 atom_target_strategy 的权重 ——
   * 面试官看到的是简历上那几行，不是你配置里写的权重。
   */
  block: { summary: string; bullets: string[] } | null;
};

/** §7.2 规定的固定文案。第五条是 in_dev 那一档，规定里没给，见下方注释。 */
export const RISK_REASON = {
  noData: "这条经历还没有实测数据，被问效果时容易卡住",
  noMethod: "有数字但没记口径，被问怎么算的时候答不上来",
  estimated: "数据是估算的，追问准确性时需要说清楚",
  // §7.2 只列了四种文案，但第一节的中风险有两个来源：estimated，和
  // 「in_dev 但简历中表述接近已完成」。后者套「数据是估算的」是假话，
  // 所以单加一条。这是本片唯一新增的文案。
  inDevOverstated: "项目还在开发中，但简历上的表述接近已完成，容易被追进度",
} as const;

/**
 * 高风险题没给「别做的事」时的兜底文案。
 *
 * 《Step 7》要求高风险题必须写「别做的事」，且具体到句式层面。模型会漏
 * ——实测 14 道高风险题里漏了 4 道。漏了就补：这两句是从风险判据本身
 * 推出来的，不是编的，说的正是「这条经历为什么危险」。
 */
export const DONT_DO_FALLBACK: Record<string, string> = {
  [RISK_REASON.noData]:
    "不要给这条经历安任何效果数字 ——「预计提升 XX%」这类填空，经历库里没有对应实测数据，追问一轮就露馅",
  [RISK_REASON.noMethod]:
    "不要现场编一个口径 —— 这条指标的算法、分母、时间窗口都没有记录，被追问就如实说没记，别顺着对方的问法圆一个出来",
};

export type RiskVerdict = {
  level: RiskLevel;
  /** 低风险为 null。界面上高风险必须显示它，不能只挂一个标签。 */
  reason: string | null;
  /** 缺口指向的那条指标，让「去补」能落到具体一行。 */
  gapMetric: RiskMetric | null;
};

function blank(s: string | null | undefined): boolean {
  return !s || s.trim() === "";
}

/** 展开 = 简历上给了 bullet。只有一行概述的经历，被追问的面积小得多。 */
export function isExpanded(atom: RiskAtom): boolean {
  return (atom.block?.bullets.length ?? 0) > 0;
}

/**
 * 没记口径的结果指标。
 * 只看 kind = 'outcome'：「交付 4 份方案」这种 output 指标不存在归因问题，
 * 把它算成风险只会让高风险标签贬值。
 * measured 与 estimated 都算 —— 估算值同样会被问「怎么估的」。
 */
export function methodlessMetrics(atom: RiskAtom): RiskMetric[] {
  return atom.metrics.filter(
    (m) =>
      m.kind === "outcome" &&
      (m.evidenceLevel === "measured" || m.evidenceLevel === "estimated") &&
      blank(m.method),
  );
}

/** 简历里把在建项目写得像已完成。命中即中风险。 */
const DONE_WORDS =
  /(已上线|已发布|已落地|已交付|已完成|正式上线|全量上线|上线后|落地后|投入使用|服务了|覆盖了)/;
/** 有对冲说明就不算夸大 —— 用户自己已经把话说清楚了。 */
const HEDGE_WORDS = /(灰度|内测|试运行|开发中|在建|待上线|尚未上线|规划中|设计阶段)/;

export function overstatesProgress(atom: RiskAtom): boolean {
  if (atom.status !== "in_dev" || !atom.block) return false;
  const text = [atom.block.summary, ...atom.block.bullets].join(" ");
  return DONE_WORDS.test(text) && !HEDGE_WORDS.test(text);
}

/**
 * 三档判定。顺序即优先级：先看两条高风险，再看中风险，剩下的低。
 *
 * 两条高风险性质不同，应答策略也不同：
 *   没数据 —— 主动承认边界，把价值锚点前移到设计深度；
 *   没口径 —— 先回去把口径补上，这是数据问题不是话术问题。
 * 所以 gapMetric 只在后者填，前者靠 dataGapHint 的另一条路给提示。
 */
export function judgeRisk(atom: RiskAtom | null): RiskVerdict {
  if (!atom) return { level: "low", reason: null, gapMetric: null };

  const methodless = methodlessMetrics(atom);
  const noMethodMeasured = methodless.filter((m) => m.evidenceLevel === "measured");

  // 高 · 有数字但没记口径。最隐蔽的翻车点，优先于「没数据」报出来 ——
  // 后者用户自己知道，前者不提示他就不会去准备。
  if (noMethodMeasured.length > 0) {
    return { level: "high", reason: RISK_REASON.noMethod, gapMetric: noMethodMeasured[0] };
  }

  const thin = atom.evidenceLevel === "designed_only" || atom.evidenceLevel === "absent";

  // 高 · 没有实测数据，且这条经历在简历上被展开了。
  if (thin && isExpanded(atom)) {
    return { level: "high", reason: RISK_REASON.noData, gapMetric: null };
  }

  // 中 · 同样没数据，但简历上只占一行。风险是真的，优先级低一档。
  if (thin) {
    return { level: "medium", reason: RISK_REASON.noData, gapMetric: null };
  }

  // 中 · 在建项目被写成已完成。
  if (overstatesProgress(atom)) {
    return { level: "medium", reason: RISK_REASON.inDevOverstated, gapMetric: null };
  }

  // 中 · 估算数据。没口径的估算值也从这里出去，gapMetric 一并带上。
  if (atom.evidenceLevel === "estimated") {
    return {
      level: "medium",
      reason: RISK_REASON.estimated,
      gapMetric: methodless[0] ?? null,
    };
  }

  return { level: "low", reason: null, gapMetric: null };
}

/**
 * 这条经历「答不上来是因为缺数据」还是「缺话术」。
 *
 * 模型会给 data_gap_hint，但它给不给取决于它那一次的判断。补上口径之后
 * 提示必须消失（验收 24），所以最终决定权在代码：没有缺口就丢掉模型的提示。
 */
export function hasDataGap(atom: RiskAtom | null): boolean {
  if (!atom) return false;
  if (atom.evidenceLevel === "designed_only" || atom.evidenceLevel === "absent") return true;
  return methodlessMetrics(atom).length > 0;
}

/**
 * 把模型的 data_gap_hint 落到具体一条指标上。
 * 优先匹配提示里点名的指标；点不到名就取第一条没口径的结果指标。
 */
export function locateGapMetric(atom: RiskAtom | null, hint: string): RiskMetric | null {
  if (!atom) return null;
  const candidates = methodlessMetrics(atom);
  if (candidates.length === 0) return null;
  const named = candidates.find((m) => m.name.trim() !== "" && hint.includes(m.name.trim()));
  return named ?? candidates[0];
}
