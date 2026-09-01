"use server";

import { revalidatePath } from "next/cache";
import { runQuickScan } from "@/lib/queries/health";

export async function rescan(): Promise<void> {
  await runQuickScan();
  revalidatePath("/health");
  revalidatePath("/", "layout");
}
