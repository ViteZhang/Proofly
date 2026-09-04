// =============================================================
// Proofly · 兑换码后台外壳
//
// 上游：《兑换码管理后台施工方案 v1.0》6.1、8.2
//
// 两道鉴权：这里是第一道（不是管理员直接 404），每个 admin_* 函数
// 自己是第二道。方案 6.2 要求二明说不能只靠一道 —— 路由配置改错过
// 一次就全开了，那种错误不该是致命的。
// =============================================================

import { AdminNav } from "@/components/admin/AdminNav";
import { createClient } from "@/lib/supabase/server";
import { getOverview, requireAdmin } from "@/lib/queries/admin";

export const metadata = {
  title: "兑换码管理 · Proofly",
  // 后台不该被任何爬虫收录
  robots: { index: false, follow: false },
};

// 后台看的是当下的库，不是构建时的快照
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const supabase = await createClient();
  const [{ data: auth }, overview] = await Promise.all([
    supabase.auth.getUser(),
    getOverview(),
  ]);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg)" }}>
      <AdminNav
        email={auth.user?.email ?? ""}
        groups={[
          { title: "总览", items: [{ href: "/admin", label: "概览" }] },
          {
            title: "发放",
            items: [
              { href: "/admin/batches", label: "批次" },
              { href: "/admin/new", label: "新建批次" },
            ],
          },
          {
            title: "追踪",
            items: [
              { href: "/admin/redemptions", label: "核销流水", badge: overview.redeemed_count },
            ],
          },
        ]}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/*
          琥珀色环境条常驻。你会在同一个浏览器里同时开着产品和后台，
          混淆一次的代价可能是给自己发了张码却以为在测产品（方案 8.2 一）。
        */}
        <div
          className="flex h-[34px] flex-none items-center gap-2.5 px-[22px] text-[12px] font-medium"
          style={{
            background: "var(--warn-soft)",
            borderBottom: "1px solid #f0dcb4",
            color: "var(--caution)",
          }}
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] flex-none rounded-full"
            style={{ background: "var(--caution)" }}
          />
          内部后台 · 你正在操作生产环境数据
        </div>

        <div className="flex-1 overflow-y-auto px-[22px] pt-[26px] pb-20">
          <div className="max-w-[1040px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
