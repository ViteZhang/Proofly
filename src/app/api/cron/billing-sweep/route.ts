// =============================================================
// Proofly · 悬挂预扣清理（Vercel Cron，每 10 分钟）
//
// 进程崩溃、部署重启、函数被掐，都会留下「钱扣了、活没跑完、
// 也没人来退」的预扣记录。用户看到的是余额少了一块，且永远
// 不会回来 —— 计费系统最不能出的错。
//
// 清理逻辑全在 SQL 里（28_billing_sweep.sql），这里只负责鉴权
// 和触发：退款的正确写法只该有一份。
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

  const { data: released, error: holdErr } = await supabase.rpc("sweep_expired_holds", {
    p_limit: 500,
  });
  const { data: reconciled, error: entErr } = await supabase.rpc(
    "sweep_expired_entitlements",
    { p_limit: 500 },
  );

  const errors = [holdErr?.message, entErr?.message].filter(Boolean);
  if (errors.length) {
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    released: released ?? 0,
    reconciled: reconciled ?? 0,
  });
}
