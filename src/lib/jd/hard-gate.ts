// =============================================================
// Proofly · 硬门槛比对
//
// 拿结构化档案（学历、证书）去对一条 hard 要求，三个结果：
//   met     满足。记入 strengths，不产生缺口，也不进任务池。
//   unmet   不满足。产生一条 hard_disqualifier，单独标注，不扣分不排任务。
//   unknown 档案里压根没这项，判不了。这一档最要紧 —— 原来的行为就是
//           把「不知道」当成「没有」，于是造出一条假缺口。
//
// 纯函数，不连库。
// =============================================================

import { DEGREE_ORDER } from "@/lib/profile/labels";
import type { BinaryEvidence, Degree } from "@/types/database";

export type GateVerdict = "met" | "unmet" | "unknown";

export type GateEvidence = {
  degrees: { degree: Degree | null; evidenceLevel: BinaryEvidence; school: string }[];
  credentials: { name: string; level: string | null; evidenceLevel: BinaryEvidence }[];
};

// 由高到低，与 DEGREE_ORDER 一致。学历比较必须按这个顺序，不能比字符串。
const RANK = new Map<Degree, number>(DEGREE_ORDER.map((d, i) => [d, DEGREE_ORDER.length - i]));

const DEGREE_WORDS: { degree: Degree; re: RegExp }[] = [
  { degree: "doctor", re: /博士/ },
  { degree: "master", re: /(硕士|研究生)/ },
  { degree: "bachelor", re: /(本科|学士)/ },
  { degree: "associate", re: /(大专|专科)/ },
];

/** 这条要求要求的最低学历。认不出来返回 null —— 认不出就不判。 */
export function requiredDegree(text: string): Degree | null {
  for (const d of DEGREE_WORDS) {
    if (d.re.test(text)) return d.degree;
  }
  return null;
}

function highest(degrees: (Degree | null)[]): Degree | null {
  let best: Degree | null = null;
  for (const d of degrees) {
    if (!d) continue;
    if (best === null || (RANK.get(d) ?? 0) > (RANK.get(best) ?? 0)) best = d;
  }
  return best;
}

/**
 * 学历门槛。
 *
 * 「不可查」的学历照样算满足 —— 学历真伪不是这个产品该替用户判的事，
 * 我们只负责别把「有」说成「没有」。可查与否的提醒留在基本信息页。
 */
export function checkDegree(
  text: string,
  evidence: GateEvidence,
): { verdict: GateVerdict; need: Degree | null; have: Degree | null } {
  const need = requiredDegree(text);
  const have = highest(evidence.degrees.map((d) => d.degree));

  // 一条学历都没填：判不了。这一步就是这次改动的全部意义 ——
  // 原来这里会走到「没有证据 → 缺口 → 任务」。
  if (evidence.degrees.length === 0) return { verdict: "unknown", need, have };
  // 要求里认不出具体档位（比如只写了「相关专业」），也不判。
  if (need === null) return { verdict: "unknown", need, have };
  if (have === null) return { verdict: "unknown", need, have };

  return {
    verdict: (RANK.get(have) ?? 0) >= (RANK.get(need) ?? 0) ? "met" : "unmet",
    need,
    have,
  };
}

/**
 * 证书门槛。
 *
 * 只做名字/等级的包含匹配，不做同义词推理 —— 「有相关证书者优先」这种
 * 认不出具体是哪张证的，一律 unknown，不猜。
 */
export function checkCredential(
  text: string,
  evidence: GateEvidence,
): { verdict: GateVerdict; matched: string | null } {
  if (evidence.credentials.length === 0) return { verdict: "unknown", matched: null };

  const hay = text.toLowerCase();
  for (const c of evidence.credentials) {
    const name = c.name.trim().toLowerCase();
    const level = c.level?.trim().toLowerCase();
    if (name && hay.includes(name)) return { verdict: "met", matched: c.name };
    if (level && hay.includes(level)) return { verdict: "met", matched: `${c.name} · ${c.level}` };
  }

  // 认得出是在要一张具体的证（文本里出现了证书类词），但手上没有 → 不满足。
  // 认不出的话不判：「有相关证书者优先」判成不满足是在冤枉人。
  const named = /(证书|资格证|执业|持证|职称|CET|四六级|雅思|托福|PMP|CPA|CFA|ACCA|法考|注册会计|教师资格)/i.test(
    text,
  );
  return { verdict: named ? "unmet" : "unknown", matched: null };
}
