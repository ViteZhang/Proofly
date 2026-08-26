// =============================================================
// Proofly · 经历的向量化与召回
//
// 用途只有一个：Pass 3 判定意图前，先把「最像的几条已有经历」找出来。
// 没有它，模型会把同一个项目反复判成 CREATE，档案慢慢腐烂。
//
// 触发时机由 Server Action 显式调用，不用数据库触发器——
// 触发器里发不了 HTTP 请求。
// =============================================================

import { callLLM } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { embeddingSource } from "./embedding-source";

export { embeddingSource };

/** 生成并写回一条经历的向量。失败不抛，返回 false，调用方自己决定要不要在意。 */
export async function refreshAtomEmbedding(atomId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("atoms")
    .select("id, title, org, role, situation, actions")
    .eq("id", atomId)
    .maybeSingle();
  if (!data) return false;

  const text = embeddingSource(data);
  if (text.trim() === "") return false;

  const r = await callLLM({
    tier: "embedding",
    purpose: "atom_embedding",
    user: text,
  });
  if (!r.ok) return false;

  const { error } = await supabase
    .from("atoms")
    .update({ embedding: JSON.stringify(r.data) })
    .eq("id", atomId);
  return !error;
}

export type SimilarAtom = {
  id: string;
  title: string;
  org: string | null;
  role: string | null;
  level: string;
  status: string;
  period: string;
  situation: string;
  metricNames: string[];
  pendingNames: string[];
  similarity: number | null;
};

/**
 * 找出与一段文本最像的已有经历，供 Pass 3 比对。
 *
 * 向量档不可用时（没配 key、或接入点不供向量模型）不是致命的：
 * 退回按标题 / 组织的字面匹配。召回质量会差，但 Pass 3 仍然能跑，
 * 而且拿不准时它会输出 ASK——那正是我们要的保守行为。
 */
export async function findSimilarAtoms(
  text: string,
  limit = 5,
): Promise<{ atoms: SimilarAtom[]; degraded: boolean }> {
  const supabase = await createClient();

  const r = await callLLM({
    tier: "embedding",
    purpose: "recall_query",
    user: text.slice(0, 500),
  });

  if (r.ok) {
    const { data, error } = await supabase.rpc("match_atoms", {
      query_embedding: JSON.stringify(r.data),
      match_count: limit,
    });
    if (!error && data && data.length > 0) {
      return { atoms: await decorate(data), degraded: false };
    }
    if (!error) return { atoms: [], degraded: false };
  }

  // 降级：字面匹配。只在向量档不可用或还没回填时走到这里。
  const { data } = await supabase
    .from("atoms")
    .select("id, title, org, role, level, status, period_start, period_end, situation, pending_metrics")
    .order("updated_at", { ascending: false })
    .limit(limit * 4);

  const words = keywords(text);
  const scored = (data ?? [])
    .map((a) => ({
      row: a,
      hits: words.filter((w) => `${a.title}${a.org ?? ""}${a.situation ?? ""}`.includes(w)).length,
    }))
    .sort((x, y) => y.hits - x.hits)
    .slice(0, limit)
    .filter((s) => s.hits > 0)
    .map((s) => ({ ...s.row, similarity: null }));

  return { atoms: await decorate(scored), degraded: true };
}

type RawAtom = {
  id: string;
  title: string;
  org: string | null;
  role: string | null;
  level: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  situation: string | null;
  pending_metrics: Json;
  similarity?: number | null;
};

async function decorate(rows: RawAtom[]): Promise<SimilarAtom[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const { data: metrics } = await supabase
    .from("metrics")
    .select("atom_id, name")
    .in("atom_id", rows.map((r) => r.id));

  const byAtom = new Map<string, string[]>();
  for (const m of metrics ?? []) {
    byAtom.set(m.atom_id, [...(byAtom.get(m.atom_id) ?? []), m.name]);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    org: r.org,
    role: r.role,
    level: r.level,
    status: r.status,
    period: period(r.period_start, r.period_end),
    situation: (r.situation ?? "").slice(0, 200),
    metricNames: byAtom.get(r.id) ?? [],
    pendingNames: pendingNames(r.pending_metrics),
    similarity: r.similarity ?? null,
  }));
}

function pendingNames(v: Json): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object" && !Array.isArray(x) && typeof x.name === "string"
          ? x.name
          : null,
    )
    .filter((s): s is string => s !== null);
}

function period(a: string | null, b: string | null): string {
  if (!a && !b) return "";
  const m = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}`;
  return `${a ? m(a) : "?"} – ${b ? m(b) : "至今"}`;
}

// 降级路径用的粗糙分词：中文按 2 字滑窗，英文按单词。
function keywords(text: string): string[] {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) out.add(w);
  const cjk = text.replace(/[^一-龥]/g, "");
  for (let i = 0; i + 2 <= cjk.length; i++) out.add(cjk.slice(i, i + 2));
  return [...out];
}
