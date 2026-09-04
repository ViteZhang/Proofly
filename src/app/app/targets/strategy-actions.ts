"use server";

// =============================================================
// Proofly · 经历 × 方向策略写操作
// 唯一的写入口。约束：只在用户真的改了东西时才 upsert，
// 绝不为了「把网格填满」而批量插入 —— 那会让新建方向变成 24 次写入，
// 也会让「有没有配过」这件事再也分不出来。
// =============================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { normalizeGroup } from "@/lib/targets/strategy";

const renderWeight = z.enum(["expand", "brief", "one_line", "omit"]);

const groupText = z
  .string()
  .trim()
  .max(40, "互斥组名最多 40 字")
  .nullable()
  .transform((v) => normalizeGroup(v));

const entry = z.object({
  atomId: z.uuid("这条经历不存在"),
  renderWeight,
  exclusiveGroup: groupText,
});

export type StrategyEntry = z.input<typeof entry>;

function refresh() {
  revalidatePath("/app/library");
  revalidatePath("/app/targets");
  revalidatePath("/app/targets/strategy");
}

/** 详情页改一行：一次 upsert，只碰这一条记录。 */
export async function saveStrategy(
  targetId: string,
  input: StrategyEntry,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");
  const parsed = entry.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误，检查一下");

  const supabase = await createClient();
  const { error } = await supabase.from("atom_target_strategy").upsert(
    {
      atom_id: parsed.data.atomId,
      target_id: targetId,
      render_weight: parsed.data.renderWeight,
      exclusive_group: parsed.data.exclusiveGroup,
    },
    { onConflict: "atom_id,target_id" },
  );

  if (error) return fail("没能保存这条策略，再试一次");
  refresh();
  return ok(null);
}

/**
 * 批量配置页保存：只收前端标记为改动过的行。
 * 没改过的行不进这个数组，也就不会在库里留下记录。
 */
export async function saveStrategies(
  targetId: string,
  entries: StrategyEntry[],
): Promise<ActionResult<{ saved: number }>> {
  if (!z.uuid().safeParse(targetId).success) return fail("这个方向不存在");
  const parsed = z.array(entry).max(200, "一次改太多了，分两批").safeParse(entries);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "填写有误，检查一下");
  if (parsed.data.length === 0) return ok({ saved: 0 });

  const supabase = await createClient();
  const { error } = await supabase.from("atom_target_strategy").upsert(
    parsed.data.map((e) => ({
      atom_id: e.atomId,
      target_id: targetId,
      render_weight: e.renderWeight,
      exclusive_group: e.exclusiveGroup,
    })),
    { onConflict: "atom_id,target_id" },
  );

  if (error) return fail("没能保存，再试一次");
  refresh();
  return ok({ saved: parsed.data.length });
}
