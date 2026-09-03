"use server";

// =============================================================
// Proofly · 练习状态
//
// 「这题答不好」是用户花时间试过才得到的信息，比任何生成结果都珍贵。
// 所以它是一行能单独更新的记录，重新生成时必须继承（见 7.5）。
// =============================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";
import type { PracticeStatus } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 再点一次同一个状态就退回未练。标记是开关，不是单程票。 */
export async function setPracticeStatus(
  questionId: string,
  status: PracticeStatus,
): Promise<ActionResult<PracticeStatus>> {
  if (!UUID_RE.test(questionId)) return fail("题目不存在");
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("interview_questions")
    .select("practice_status")
    .eq("id", questionId)
    .maybeSingle();
  if (!row) return fail("题目不存在");

  const next: PracticeStatus = row.practice_status === status ? "untouched" : status;
  const patch: { practice_status: PracticeStatus; practice_note?: null } = {
    practice_status: next,
  };
  // 退回未练时把备注一起清掉：「卡在哪」是针对「答不好」写的，
  // 状态没了还留着，下次看到会以为自己还卡着。
  if (next === "untouched") patch.practice_note = null;

  const { error } = await supabase
    .from("interview_questions")
    .update(patch)
    .eq("id", questionId);
  if (error) return fail("状态没保存上，再试一次");

  revalidatePath("/app/interview");
  return ok(next);
}

export async function setPracticeNote(
  questionId: string,
  note: string,
): Promise<ActionResult<string>> {
  if (!UUID_RE.test(questionId)) return fail("题目不存在");
  const text = note.trim().slice(0, 500);
  const supabase = await createClient();

  const { error } = await supabase
    .from("interview_questions")
    .update({ practice_note: text === "" ? null : text })
    .eq("id", questionId);
  if (error) return fail("备注没保存上，再试一次");

  revalidatePath("/app/interview");
  return ok(text);
}
