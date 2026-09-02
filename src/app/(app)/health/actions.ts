"use server";

import { revalidatePath } from "next/cache";
import { ignoreIssue, restoreIssue, runQuickScan } from "@/lib/queries/health";

export async function rescan(): Promise<void> {
  await runQuickScan();
  revalidatePath("/health");
  revalidatePath("/", "layout");
}

export async function ignore(fingerprint: string, code: string, reason: string): Promise<void> {
  await ignoreIssue(fingerprint, code, reason);
  revalidatePath("/health");
  revalidatePath("/", "layout");
}

export async function restore(fingerprint: string): Promise<void> {
  await restoreIssue(fingerprint);
  revalidatePath("/health");
  revalidatePath("/", "layout");
}
