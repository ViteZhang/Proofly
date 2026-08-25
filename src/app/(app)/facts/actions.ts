"use server";

// =============================================================
// Proofly · 事实层写操作
// 口径漂移就是从这里治的：一处事实只有一个值，多来源不一致时先摆出来让人定。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { FACT_KEYS } from "@/lib/queries/facts";

function refresh() {
  revalidatePath("/facts");
  revalidatePath("/", "layout"); // 顶栏体检芯片跟着 BLOCKING 条数走
}

const PRESET = new Set<string>(FACT_KEYS);

/** 首次进入事实层时把缺的预置项补成空记录，用户看到的是一张完整清单。 */
export async function ensureFacts(keys: string[]): Promise<ActionResult> {
  const wanted = keys.filter((k) => PRESET.has(k));
  if (wanted.length === 0) return ok(null);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_facts")
    .upsert(
      wanted.map((key) => ({ key, value: null })),
      { onConflict: "user_id,key", ignoreDuplicates: true },
    );

  if (error) return fail("没能初始化事实层，刷新再试");
  refresh();
  return ok(null);
}

const Value = z.string().trim().max(500, "最多 500 字");

export async function updateFact(id: string, value: string): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid("这条事实不存在"), value: Value }).safeParse({ id, value });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_facts")
    .update({ value: parsed.data.value || null })
    .eq("id", parsed.data.id);

  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok(null);
}

/**
 * 定下一个值，冲突就算解决。
 * conflict_log 原样保留——曾经不一致这件事本身是体检模块要追溯的证据。
 */
export async function resolveFact(id: string, value: string): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.uuid("这条事实不存在"), value: Value.min(1, "选一个，或者自己填一个") })
    .safeParse({ id, value });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_facts")
    .update({ value: parsed.data.value, status: "RESOLVED" })
    .eq("id", parsed.data.id);

  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok(null);
}
