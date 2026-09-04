// =============================================================
// Proofly · 数据导出
//
// 承诺 4：随时把全部数据带走，不消耗积分。
//
// 一次把每张表都拉出来，原样落进 JSON。不做裁剪、不做美化 ——
// 导出的价值在于「完整」，而不在于好看。RLS 保证只会拿到自己的行。
// =============================================================

import { NextResponse } from "next/server";

import { logFree } from "@/lib/billing/action";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 导出哪些表。顺序按「事实 → 策略 → 产物 → 账」排，人翻起来好找。 */
const TABLES = [
  "profile_facts",
  "atoms",
  "metrics",
  "guards",
  "skills",
  "atom_skills",
  "source_docs",
  "atom_sources",
  "targets",
  "atom_target_strategy",
  "jds",
  "requirements",
  "assessments",
  "gaps",
  "tasks",
  "task_targets",
  "resume_baselines",
  "resume_versions",
  "resume_blocks",
  "interview_kits",
  "interview_questions",
  "check_results",
  "entitlements",
  "usage_logs",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("请先登录", { status: 401 });

  const payload: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { email: user.email },
    // 说明这份文件是什么，几个月后自己打开也知道。
    _readme:
      "这是你在 Proofly 里的全部数据。每个键是一张表，值是这张表里属于你的全部行。" +
      "字段名与产品里的概念一一对应：atoms 是经历，metrics 是指标，guards 是护栏，" +
      "resume_baselines/resume_versions 是基线与投递版本，interview_kits 是面试题包，" +
      "usage_logs 是消费记录。",
  };

  for (const t of TABLES) {
    // 逐张表拉。一次并发全部会把连接打满，而导出不是一个要抢速度的动作。
    const { data, error } = await supabase.from(t).select("*");
    payload[t] = error ? { _error: error.message } : (data ?? []);
  }

  // 导出永远不消耗积分（承诺 4）。留痕是为了让它出现在消费记录里。
  await logFree("data_export");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="proofly-export-${date}.json"`,
    },
  });
}
