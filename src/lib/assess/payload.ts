// =============================================================
// Proofly · 喂给匹配判定的候选经历
//
// 4.2 提示词的 User 段列明了每条经历要带哪些字段：
//   id、title、org、role、period、status、evidence_level、situation、
//   actions、指标名称与数值、关联技能。
// 这里按那份清单组装，多一个字段少一个字段都会让判定跟提示词说的不一致。
//
// 不去扩 findSimilarAtoms 的 SimilarAtom：那份结构同时喂着 Step 2 的
// Pass 3，那边的提示词把字段名一个个列了出来，动它会连带影响导入。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parseStringList } from "@/lib/domain";
import type { AtomFact, SkillFact } from "@/lib/scoring/types";
import type { EvidenceLevel } from "@/types/database";

export type CandidateAtom = {
  id: string;
  title: string;
  org: string | null;
  role: string | null;
  period: string;
  status: string;
  evidence_level: EvidenceLevel;
  situation: string;
  actions: string[];
  metrics: { name: string; value: string; kind: string; evidence_level: EvidenceLevel }[];
  skills: string[];
};

function metricValue(m: {
  from_value: string | null;
  to_value: string | null;
  delta: string | null;
}): string {
  const parts: string[] = [];
  if (m.from_value && m.to_value) parts.push(`${m.from_value} → ${m.to_value}`);
  else if (m.to_value) parts.push(m.to_value);
  else if (m.from_value) parts.push(m.from_value);
  if (m.delta) parts.push(`（${m.delta}）`);
  return parts.join("") || "（没填数值）";
}

function period(start: string | null, end: string | null): string {
  if (!start && !end) return "未填";
  return `${start ?? "?"} ~ ${end ?? "至今"}`;
}

/** 按给定顺序取经历详情。顺序就是召回的相关度排序，提示词里说了是排过的。 */
export async function buildCandidates(
  atomIds: string[],
): Promise<{ candidates: CandidateAtom[]; facts: AtomFact[] }> {
  if (atomIds.length === 0) return { candidates: [], facts: [] };
  const supabase = await createClient();

  const [atomRes, metricRes, linkRes] = await Promise.all([
    supabase
      .from("atoms")
      .select(
        "id,title,org,role,period_start,period_end,status,evidence_level,situation,actions",
      )
      .in("id", atomIds),
    supabase
      .from("metrics")
      .select("atom_id,name,from_value,to_value,delta,kind,evidence_level")
      .in("atom_id", atomIds),
    supabase.from("atom_skills").select("atom_id,skills(label)").in("atom_id", atomIds),
  ]);

  const metricsByAtom = new Map<string, CandidateAtom["metrics"]>();
  for (const m of metricRes.data ?? []) {
    const list = metricsByAtom.get(m.atom_id) ?? [];
    list.push({
      name: m.name,
      // 「从 X 到 Y（+Z）」拼成一句，模型不需要拆开的三个字段
      value: metricValue(m),
      kind: m.kind,
      evidence_level: m.evidence_level,
    });
    metricsByAtom.set(m.atom_id, list);
  }

  const skillsByAtom = new Map<string, string[]>();
  for (const l of linkRes.data ?? []) {
    const label = (l.skills as { label: string } | null)?.label;
    if (!label) continue;
    const list = skillsByAtom.get(l.atom_id) ?? [];
    list.push(label);
    skillsByAtom.set(l.atom_id, list);
  }

  const byId = new Map((atomRes.data ?? []).map((a) => [a.id, a]));
  const candidates: CandidateAtom[] = [];
  for (const id of atomIds) {
    const a = byId.get(id);
    if (!a) continue;
    candidates.push({
      id: a.id,
      title: a.title,
      org: a.org,
      role: a.role,
      period: period(a.period_start, a.period_end),
      status: a.status,
      evidence_level: a.evidence_level,
      situation: a.situation ?? "",
      actions: parseStringList(a.actions),
      metrics: metricsByAtom.get(a.id) ?? [],
      skills: skillsByAtom.get(a.id) ?? [],
    });
  }

  return {
    candidates,
    // 算分只需要证明度，跟喂给模型的那份分开 —— 模型不该也不需要重新评估证明度。
    facts: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      evidenceLevel: c.evidence_level,
    })),
  };
}

/** 全部技能标签及其证据强度。用来分辨「没这个能力」和「有能力但拿不出证明」。 */
export async function loadSkills(): Promise<SkillFact[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("skills")
    .select("label,evidence_strength")
    .order("label", { ascending: true });
  return (data ?? []).map((s) => ({ label: s.label, strength: s.evidence_strength }));
}
