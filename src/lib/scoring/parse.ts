// =============================================================
// Proofly · 从 assessments.results 读回算分结果
// jsonb 是无类型的，读出来必须过一遍解析：坏数据降级为跳过，
// 不让一条脏记录把整页评估结果打空。
// =============================================================

import type { EvidenceLevel, GapType, Json, RequirementKind } from "@/types/database";
import type { Coverage, RequirementResult } from "./types";

const COVERAGES: Coverage[] = ["full", "partial", "weak", "none"];
const KINDS: RequirementKind[] = ["hard", "implicit", "nice_to_have"];
const LEVELS: EvidenceLevel[] = ["measured", "estimated", "designed_only", "absent"];
const GAPS: GapType[] = ["no_capability", "no_evidence", "weak_evidence", "structural"];

type Obj = Record<string, Json | undefined>;

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: Json | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function oneOf<T extends string>(v: Json | undefined, allowed: T[], fallback: T): T {
  return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

export function parseResults(raw: Json | null | undefined): RequirementResult[] {
  if (!Array.isArray(raw)) return [];
  const out: RequirementResult[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Obj;
    const text = str(o.text);
    if (text === "") continue;

    out.push({
      requirementId: str(o.requirementId),
      requirementIndex: num(o.requirementIndex),
      text,
      rawPhrase: typeof o.rawPhrase === "string" ? o.rawPhrase : null,
      kind: oneOf(o.kind, KINDS, "hard"),
      isStructural: o.isStructural === true,

      weight: num(o.weight),
      coverage: oneOf(o.coverage, COVERAGES, "none"),
      coverageValue: num(o.coverageValue),
      bestEvidence:
        typeof o.bestEvidence === "string" && (LEVELS as string[]).includes(o.bestEvidence)
          ? (o.bestEvidence as EvidenceLevel)
          : null,
      evidenceMultiplier: num(o.evidenceMultiplier),
      requirementScore: num(o.requirementScore),
      scoreLoss: num(o.scoreLoss),

      matchedAtomIds: strList(o.matchedAtomIds),
      matchedTitles: strList(o.matchedTitles),
      relatedSkillLabels: strList(o.relatedSkillLabels),
      emptySkillLabels: strList(o.emptySkillLabels),
      reason: str(o.reason),

      gapType:
        typeof o.gapType === "string" && (GAPS as string[]).includes(o.gapType)
          ? (o.gapType as GapType)
          : null,
    });
  }

  return out.sort((a, b) => a.requirementIndex - b.requirementIndex);
}
