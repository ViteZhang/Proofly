// =============================================================
// Proofly · 硬门槛比对的取数与措辞
//
// 判定本身在 lib/jd/hard-gate（纯函数、可单测）。这一层只负责把档案
// 读出来，以及把判定结果翻译成一句能直接显示给人看的话。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { checkCredential, checkDegree, type GateEvidence } from "@/lib/jd/hard-gate";
import { DEGREE_LABEL } from "@/lib/profile/labels";
import type { HardGate } from "@/lib/scoring/types";
import type { MappedKind } from "@/types/database";

export async function buildGateEvidence(): Promise<GateEvidence> {
  const supabase = await createClient();
  const [eduRes, credRes] = await Promise.all([
    supabase.from("educations").select("school,degree,evidence_level"),
    supabase.from("credentials").select("name,level,evidence_level"),
  ]);

  return {
    degrees: (eduRes.data ?? []).map((e) => ({
      degree: e.degree,
      evidenceLevel: e.evidence_level,
      school: e.school,
    })),
    credentials: (credRes.data ?? []).map((c) => ({
      name: c.name,
      level: c.level,
      evidenceLevel: c.evidence_level,
    })),
  };
}

/**
 * 一条硬门槛要求的判定 + 给人看的那句话。
 *
 * 「判不了」的措辞要说清楚是我们缺信息，不是他不合格 —— 这两件事在
 * 用户那里的分量差得远。
 */
export function gateFor(text: string, mapped: MappedKind, evidence: GateEvidence): HardGate {
  if (mapped === "education") {
    const r = checkDegree(text, evidence);
    if (r.verdict === "met") {
      const school = evidence.degrees.find((d) => d.degree === r.have)?.school;
      return {
        verdict: "met",
        detail: `档案里的最高学历是${DEGREE_LABEL[r.have!]}${school ? `（${school}）`: ""}，满足这条。`,
      };
    }
    if (r.verdict === "unmet") {
      return {
        verdict: "unmet",
        detail: `这条要${DEGREE_LABEL[r.need!]}及以上，你的最高学历是${DEGREE_LABEL[r.have!]}。这一条不是能靠行动补上的，投之前自己权衡。`,
      };
    }
    return {
      verdict: "unknown",
      detail:
        evidence.degrees.length === 0
          ? "这条对的是学历，而你还没填。补上之后这条才判得准 —— 在那之前它既不算满足，也不算缺口。"
          : "这条没写清楚要什么学历，判不了。要是它其实是硬门槛，自己权衡。",
    };
  }

  const r = checkCredential(text, evidence);
  if (r.verdict === "met") {
    return { verdict: "met", detail: `档案里有「${r.matched}」，满足这条。` };
  }
  if (r.verdict === "unmet") {
    return {
      verdict: "unmet",
      detail: "这条要的证书档案里没有。考出来要时间，不是能靠改简历解决的，投之前自己权衡。",
    };
  }
  return {
    verdict: "unknown",
    detail: "这条对的是证书，档案里还没填证书。补上之后这条才判得准。",
  };
}
