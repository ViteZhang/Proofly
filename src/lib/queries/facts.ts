// =============================================================
// Proofly · 事实层读取
// 全局唯一口径。一处事实有多个来源取值时，status 会是 PENDING / BLOCKING，
// 具体候选值存在 conflict_log 里，等用户定一个。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { parseFactConflicts, type FactConflict } from "@/lib/domain";
import type { ProfileFactStatus } from "@/types/database";

// 预置的事实项。顺序即事实层页面的展示顺序；缺失的记录在 1.7 首次进入时补建。
export const FACT_KEYS = [
  "name",
  "phone",
  "email",
  "location",
  "years_of_experience",
  "headline",
  "entity_disclosure",
] as const;

export type FactKey = (typeof FACT_KEYS)[number];

export const FACT_LABEL: Record<FactKey, string> = {
  name: "姓名",
  phone: "手机",
  email: "邮箱",
  location: "常驻地",
  years_of_experience: "工作年限",
  headline: "一句话定位",
  entity_disclosure: "主体披露口径",
};

export type ProfileFact = {
  id: string;
  key: string;
  label: string; // 预置项用中文名，自定义项回落到 key 本身
  value: string | null;
  status: ProfileFactStatus;
  conflicts: FactConflict[];
  disclosure_rule: string | null;
};

export type ProfileFacts = {
  facts: ProfileFact[];
  blockingCount: number; // 顶栏体检芯片用
  missingKeys: FactKey[]; // 预置项里还没有记录的，1.7 进入时补建
};

const ORDER = new Map<string, number>(FACT_KEYS.map((k, i) => [k, i]));

export async function getProfileFacts(): Promise<ProfileFacts> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_facts")
    .select("id,key,value,status,conflict_log,disclosure_rule");

  if (error) throw new Error(`读取事实层失败：${error.message}`);

  const facts: ProfileFact[] = (data ?? [])
    .map((row) => ({
      id: row.id,
      key: row.key,
      label: FACT_LABEL[row.key as FactKey] ?? row.key,
      value: row.value,
      status: row.status,
      conflicts: parseFactConflicts(row.conflict_log),
      disclosure_rule: row.disclosure_rule,
    }))
    // 预置项按 FACT_KEYS 的顺序排在前，自定义项按 key 排在后
    .sort((a, b) => {
      const ra = ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const rb = ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.key.localeCompare(b.key);
    });

  const present = new Set(facts.map((f) => f.key));

  return {
    facts,
    blockingCount: facts.filter((f) => f.status === "BLOCKING").length,
    missingKeys: FACT_KEYS.filter((k) => !present.has(k)),
  };
}
