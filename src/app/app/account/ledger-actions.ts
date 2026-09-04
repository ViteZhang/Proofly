"use server";

import { listLedger, type LedgerRow } from "@/lib/queries/billing";

/** 向下加载更多流水。默认 30 条一页。 */
export async function loadLedger(
  before: string | null,
  includeFree: boolean,
): Promise<LedgerRow[]> {
  return listLedger({ before, includeFree, limit: 30 });
}
