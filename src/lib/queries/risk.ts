// =============================================================
// Proofly · 首页风险提示卡
//
// 「做过一堆事，但都拿不出数据」是这个产品最想让人看见的那种风险：
// 它不像「没做过」那样显眼，却同样会在面试里被问穿。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { aggregate } from "@/lib/scoring";
import { WEAK_EVIDENCE_RISK_THRESHOLD } from "@/lib/scoring/config";
import { parseResults } from "@/lib/scoring/parse";

export type RiskCard = {
  targetId: string;
  targetName: string;
  /** 触发这张卡的那份 JD 上，weak_evidence 丢了多少分 */
  weakLoss: number;
  jdLabel: string;
  /** 这些经历命中了要求，但都还没有实测数据 */
  atomTitles: string[];
};

/**
 * 按方向算风险。
 *
 * 门槛取「该方向下单份 JD 的 weak_evidence 失分」，不是几份 JD 加总。
 * 每次评估都归一化到 100 分，跨 JD 相加会变成「JD 贴得越多越像有风险」，
 * 那测的是数量不是证明度。一个方向只有一份 JD 时，两种口径完全一致。
 */
export async function getRiskCards(): Promise<RiskCard[]> {
  const supabase = await createClient();

  const { data: targets } = await supabase
    .from("targets")
    .select("id,name,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!targets || targets.length === 0) return [];

  const { data: rows } = await supabase
    .from("assessments")
    .select("id,target_id,jd_id,results,created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (!rows || rows.length === 0) return [];

  const { data: jds } = await supabase.from("jds").select("id,company,role_title");
  const jdLabel = new Map(
    (jds ?? []).map((j) => [j.id, `${j.company ?? "未填公司"} · ${j.role_title ?? "未填岗位"}`]),
  );

  // 每份 JD 只认最新一次评估
  const seen = new Set<string>();
  const worst = new Map<string, RiskCard>();

  for (const row of rows) {
    if (seen.has(row.jd_id)) continue;
    seen.add(row.jd_id);

    const results = parseResults(row.results);
    const weak = aggregate(results).find((b) => b.gapType === "weak_evidence");
    if (!weak || weak.loss <= WEAK_EVIDENCE_RISK_THRESHOLD) continue;

    const prev = worst.get(row.target_id);
    if (prev && prev.weakLoss >= weak.loss) continue;

    worst.set(row.target_id, {
      targetId: row.target_id,
      targetName: targets.find((t) => t.id === row.target_id)?.name ?? "",
      weakLoss: weak.loss,
      jdLabel: jdLabel.get(row.jd_id) ?? "某份 JD",
      atomTitles: [
        ...new Set(
          results.filter((r) => r.gapType === "weak_evidence").flatMap((r) => r.matchedTitles),
        ),
      ],
    });
  }

  // 方向之间不排名次，按方向自己的顺序出
  return targets.map((t) => worst.get(t.id)).filter((c): c is RiskCard => c !== undefined);
}
