// =============================================================
// Proofly · 悬挂预扣清理 · 手动触发口
//
// 进程崩溃、部署重启、函数被掐，都会留下「钱扣了、活没跑完、
// 也没人来退」的预扣记录。用户看到的是余额少了一块，且永远
// 不会回来 —— 计费系统最不能出的错。
//
// **常规调度不走这里**：定时执行由 Supabase 的 pg_cron 每 10 分钟跑
// billing_sweep()（见 29_billing_cron.sql）。Vercel Hobby 的定时任务
// 每天只能跑一次，而这件事的价值全在「快」—— 同一个崩溃，分钟级调度下
// 用户等 15 分钟拿回积分，每天一次的调度下要等最多 24 小时。
//
// 这个接口留作手动触发：想立刻扫一遍时不必开 SQL 编辑器。
// 它和定时任务调的是同一个 billing_sweep()，「一次清理都做了什么」
// 只有一份定义。
//
// 上游：《商业化技术方案 v1.0》3.4 ·《商业化 C1》切片 C1.7
// =============================================================

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 没配 CRON_SECRET 就一律拒绝。缺配置时放行是最糟的默认值 ——
  // 这个接口对外可见，放行等于谁都能来触发。
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("billing_sweep", { p_limit: 500 });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as object) });
}
