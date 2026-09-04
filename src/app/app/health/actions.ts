"use server";

import { revalidatePath } from "next/cache";
import { logFree } from "@/lib/billing/action";
import { ignoreIssue, restoreIssue, runQuickScan } from "@/lib/queries/health";

export async function rescan(): Promise<void> {
  await runQuickScan();
  // 快扫零调用、纯代码算，永久免费。仍然留一条 credits=0 的记录 ——
  // 用户不会自己发现「哦这个没扣分」，消费记录里看得见才算数。
  await logFree("health_check_fast");
  revalidatePath("/app/health");
  revalidatePath("/", "layout");
}

export async function ignore(fingerprint: string, code: string, reason: string): Promise<void> {
  await ignoreIssue(fingerprint, code, reason);
  revalidatePath("/app/health");
  revalidatePath("/", "layout");
}

export async function restore(fingerprint: string): Promise<void> {
  await restoreIssue(fingerprint);
  revalidatePath("/app/health");
  revalidatePath("/", "layout");
}
