// =============================================================
// Proofly · 重新生成时的练习状态继承
//
// 「这题答不好」是用户花时间试过才得到的信息，比任何生成结果都珍贵。
// 一次重新生成把它抹掉，用户下次就不知道自己卡在哪了 —— 而他不会记得
// 自己标过什么，只会觉得这套题「怎么好像没那么准了」。
//
// 所以：新题按题干相似度认领旧状态；认领不到的旧题，只要标着「答不好」，
// 就原样留在新题包里并标明它来自上一版。
// =============================================================

import type { BuiltQuestion } from "@/lib/interview/plan";
import type {
  InterviewKind,
  PracticeStatus,
  ProbeType,
  QuestionDifficulty,
  RiskLevel,
} from "@/types/database";

/** 上一版留下的一道题。字段够多是为了原样搬运，不重新生成。 */
export type PriorQuestion = {
  id: string;
  kind: InterviewKind;
  question: string;
  probeType: ProbeType | null;
  difficulty: QuestionDifficulty | null;
  fromAtomId: string | null;
  fromExistingProbe: boolean;
  riskLevel: RiskLevel;
  riskReason: string | null;
  answerOutline: { label: string; content: string }[];
  dontDo: string | null;
  dataGapHint: string | null;
  gapMetricId: string | null;
  relatedAtomIds: string[];
  whyThisQuestion: string | null;
  practiceStatus: PracticeStatus;
  practiceNote: string | null;
};

export type InheritedQuestion = BuiltQuestion & {
  practiceStatus: PracticeStatus;
  practiceNote: string | null;
  carriedOver: boolean;
};

/** 命中阈值。0.6 是「同一道题换了个说法」与「两道不同的题」之间的界。 */
export const MATCH_THRESHOLD = 0.6;

function normalize(s: string): string {
  return s.replace(/[\s，。？?、,.：:；;「」""''（）()！!—…-]/g, "");
}

function bigrams(s: string): string[] {
  const t = normalize(s);
  if (t.length <= 1) return t === "" ? [] : [t];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/**
 * 两条题干的相似度（Dice 系数，字符二元组）。
 *
 * 对称，不像包含度那样偏向短句 —— 这里比的是「是不是同一道题」，
 * 不是「谁包含谁」，一个短题干被长题干包住并不说明它们是同一道。
 */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return normalize(a) === normalize(b) ? 1 : 0;
  const pool = new Map<string, number>();
  for (const g of A) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

export type InheritResult = {
  questions: InheritedQuestion[];
  /** 认领到旧状态的题数。 */
  inherited: number;
  /** 没被认领、但因为标着「答不好」而保留下来的旧题数。 */
  carried: number;
};

/**
 * 新题认领旧状态，未被认领的 struggling 旧题一并保留。
 *
 * 一道旧题只能被认领一次：两道新题都像它的时候，给最像的那道，
 * 否则同一条备注会出现在两个地方，用户不知道该信哪一个。
 */
export function inheritPractice(
  fresh: BuiltQuestion[],
  prior: PriorQuestion[],
): InheritResult {
  const marked = prior.filter((p) => p.practiceStatus !== "untouched");
  const claimed = new Set<string>();

  const questions: InheritedQuestion[] = fresh.map((q) => {
    let best: PriorQuestion | null = null;
    let bestScore = MATCH_THRESHOLD;
    for (const p of marked) {
      if (claimed.has(p.id) || p.kind !== q.kind) continue;
      const score = similarity(q.question, p.question);
      if (score >= bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best) claimed.add(best.id);
    return {
      ...q,
      practiceStatus: best?.practiceStatus ?? "untouched",
      practiceNote: best?.practiceNote ?? null,
      carriedOver: false,
    };
  });

  // 没被认领的「答不好」原样搬过来。已练熟的不搬 —— 那条信息的价值是
  // 「这道题我会了」，题目本身既然没再出，就没有再练一遍的必要。
  const orphans = marked.filter((p) => !claimed.has(p.id) && p.practiceStatus === "struggling");
  let order = questions.length;
  for (const p of orphans) {
    questions.push({
      kind: p.kind,
      question: p.question,
      probeType: p.probeType,
      difficulty: p.difficulty,
      fromAtomId: p.fromAtomId,
      fromExistingProbe: p.fromExistingProbe,
      riskLevel: p.riskLevel,
      riskReason: p.riskReason,
      answerOutline: p.answerOutline,
      dontDo: p.dontDo,
      dataGapHint: p.dataGapHint,
      gapMetricId: p.gapMetricId,
      relatedAtomIds: p.relatedAtomIds,
      whyThisQuestion: p.whyThisQuestion,
      sortOrder: order++,
      practiceStatus: p.practiceStatus,
      practiceNote: p.practiceNote,
      carriedOver: true,
    });
  }

  return {
    questions,
    inherited: claimed.size,
    carried: orphans.length,
  };
}
