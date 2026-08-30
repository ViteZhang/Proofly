// =============================================================
// Proofly · 门禁结果落库
//
// Step 6 的检查结果写进 check_results，Step 8 的体检页直接读汇总，
// 不重复实现一套。这里只管写与读，判定逻辑全在 gate.ts。
//
// 写法是「整体替换」：同一份基线／版本每次重新检查，先删掉上一轮的
// 结果再写新的。累积会让体检页越看越多，而里面大半是已经修好的。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import type { GateResult } from "./gate";
import type { Json } from "@/types/database";

export type CheckOwner = { kind: "baseline" | "version"; id: string };

export function ownerKey(owner: CheckOwner): string {
  return `${owner.kind}:${owner.id}`;
}

export type CheckRow = {
  id: string;
  level: "blocking" | "warning" | "pass";
  code: string | null;
  title: string;
  detail: string | null;
  blockId: string | null;
};

export async function replaceResumeChecks(
  owner: CheckOwner,
  results: GateResult[],
): Promise<void> {
  const supabase = await createClient();
  const key = ownerKey(owner);

  await supabase
    .from("check_results")
    .delete()
    .eq("scope", "resume")
    .filter("ref_ids->>owner", "eq", key);

  if (results.length === 0) return;

  await supabase.from("check_results").insert(
    results.map((r) => ({
      scope: "resume" as const,
      level: r.level,
      code: r.code,
      title: r.message,
      detail: r.detail,
      ref_ids: { owner: key, blockId: r.blockId ?? null } as unknown as Json,
    })),
  );
}

export async function listResumeChecks(owner: CheckOwner): Promise<CheckRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_results")
    .select("id,level,code,title,detail,ref_ids")
    .eq("scope", "resume")
    .is("ignored_at", null)
    .is("resolved_at", null)
    .filter("ref_ids->>owner", "eq", ownerKey(owner))
    .order("level", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => {
    const ref = (r.ref_ids ?? {}) as { blockId?: string | null };
    return {
      id: r.id,
      level: r.level,
      code: r.code,
      title: r.title,
      detail: r.detail,
      blockId: typeof ref.blockId === "string" ? ref.blockId : null,
    };
  });
}
