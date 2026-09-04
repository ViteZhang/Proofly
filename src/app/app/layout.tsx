import { Suspense } from "react";
import { getBalance, getEntitlements } from "@/lib/queries/billing";
import { Sidebar } from "@/components/layout/Sidebar";
import { countOpenTasks } from "@/lib/queries/tasks";
import { Topbar } from "@/components/layout/Topbar";
import { createClient } from "@/lib/supabase/server";
import { healthSummary } from "@/lib/queries/health";
import { listTargetOptions } from "@/lib/queries/targets";

// 应用外壳：Sidebar（210px）+ Topbar（56px）+ 内容区。
// 未登录已由 proxy 拦截，这里只需取用户信息用于侧栏底部。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 顶栏体检芯片：全部阻断级问题的条数（Step 4 时只数事实层，到这一步扩全）。
  // 只读不跑 —— 芯片挂在每个页面上，不能一进任何页面就触发一次全量扫描。
  const [health, targets, todoCount] = await Promise.all([
    healthSummary(),
    listTargetOptions(),
    countOpenTasks(),
  ]);

  const [balance, ent] = await Promise.all([getBalance(), getEntitlements()]);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* data-chrome：打印页要把外壳整个藏掉，靠这个标记，不靠猜类名 */}
      <div data-chrome>
        <Sidebar email={user?.email ?? ""} todoCount={todoCount} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar 读 useSearchParams，包一层 Suspense 免得拖累外层渲染 */}
        <div data-chrome>
          <Suspense fallback={<div style={{ height: 56, borderBottom: "1px solid var(--line)" }} />}>
            <Topbar
              blockingCount={health.blockingCount}
              scanned={health.scanned}
              targets={targets}
              balance={{
                available: balance.available,
                low: balance.low,
                zero: balance.zero,
                purchased: ent.purchased,
                granted: ent.granted,
                grantExpiresAt: ent.grantExpiresAt,
                freeChatLeft: balance.freeChatLeft,
                freeChatLimit: balance.freeChatLimit,
              }}
            />
          </Suspense>
        </div>
        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
