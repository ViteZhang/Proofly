// =============================================================
// Proofly · QUERY 的回答 —— 全部由代码渲染
//
// 方案 3.2 的硬约束：这里一个字都不许经过模型。
// 查询回答一旦让模型发挥，它就会顺着用户的话把经历内容编出来，
// 而用户看不出哪句是查的、哪句是编的——这比答不上来糟得多。
//
// 所以本文件只做一件事：查库。
// 拼装与措辞在 answer-shape.ts，那边不依赖 Next，能单独跑一遍核对。
// =============================================================

import { EVIDENCE_LABEL, EVIDENCE_ORDER, parsePendingMetrics } from "@/lib/domain";
import { findSimilarAtoms } from "@/lib/ingest/embedding";
import { createClient } from "@/lib/supabase/server";
import { toAnswerAtoms, type QueryAnswer } from "./answer-shape";

export { renderQueryAnswer } from "./answer-shape";
export type { AnswerAtom, QueryAnswer } from "./answer-shape";

const TOP_N = 3;

// 「我一共记了多少条经历」问的是全库，不是某一条。
// 拿它去做向量召回只会捞回三条不相干的经历，然后一本正经地回答。
// 这一小段判定是代码写死的关键词，同样不经过模型。
const OVERVIEW_RE = /(一共|总共|多少条|几条|全部经历|所有经历|经历库.*(多少|几)|整体情况)/;

export async function answerQuery(v: {
  subject: string;
  userMessage: string;
}): Promise<QueryAnswer> {
  if (OVERVIEW_RE.test(v.subject) || OVERVIEW_RE.test(v.userMessage)) return overview();

  const probe = v.subject.trim() === "" ? v.userMessage : v.subject;
  const { atoms, degraded } = await findSimilarAtoms(probe, TOP_N);
  if (atoms.length === 0) return { kind: "empty" };

  const ids = atoms.map((a) => a.id);
  const supabase = await createClient();
  const [{ data: rows }, { data: metrics }] = await Promise.all([
    supabase
      .from("atoms")
      .select("id, title, status, evidence_level, pending_metrics, updated_at")
      .in("id", ids),
    supabase
      .from("metrics")
      .select("atom_id, name, kind, from_value, to_value, delta")
      .in("atom_id", ids),
  ]);

  return { kind: "atoms", atoms: toAnswerAtoms(ids, rows ?? [], metrics ?? []), degraded };
}

async function overview(): Promise<QueryAnswer> {
  const supabase = await createClient();
  const { data } = await supabase.from("atoms").select("evidence_level, pending_metrics");
  const rows = data ?? [];

  const counts = new Map<string, number>();
  let pendingAtoms = 0;
  let pendingItems = 0;
  for (const r of rows) {
    counts.set(r.evidence_level, (counts.get(r.evidence_level) ?? 0) + 1);
    const n = parsePendingMetrics(r.pending_metrics).length;
    if (n > 0) {
      pendingAtoms++;
      pendingItems += n;
    }
  }

  return {
    kind: "overview",
    total: rows.length,
    byEvidence: EVIDENCE_ORDER.map((lv) => ({ label: EVIDENCE_LABEL[lv], n: counts.get(lv) ?? 0 }))
      .filter((x) => x.n > 0),
    pendingAtoms,
    pendingItems,
  };
}
