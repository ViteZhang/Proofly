// =============================================================
// Proofly · 导出一个批次里还没被兑换的明文码
//
// 已核销的不在里面。后台里它们是打码显示的，导出如果把明文带出去，
// 那道行为设计就等于没有 —— 「回来抄一遍」会重新变得顺手。
//
// 鉴权：proxy 拦 /admin/*，admin_batch_codes 里还有一道 admin_assert()。
// =============================================================

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type Row = { code: string; credits: number; status: string; expires_at: string | null };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rows, error }, { data: detail }] = await Promise.all([
    supabase.rpc("admin_batch_codes", { p_id: id }),
    supabase.rpc("admin_batch", { p_id: id }),
  ]);
  if (error) return new NextResponse("not found", { status: 404 });

  const name =
    ((detail as unknown as { batch?: { name?: string } } | null)?.batch?.name ?? "batch");
  const list = (rows ?? []) as unknown as Row[];

  const csv =
    // Excel 不认无 BOM 的 UTF-8，中文批次名会变乱码
    "﻿" +
    [
      ["code", "credits", "status", "code_expires_at"],
      ...list.map((r) => [r.code, String(r.credits), r.status, r.expires_at ?? ""]),
    ]
      .map((r) => r.map((x) => `"${x.replaceAll('"', '""')}"`).join(","))
      .join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv;charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}-未核销.csv`)}`,
      // 明文码不该进任何缓存
      "cache-control": "no-store",
    },
  });
}
