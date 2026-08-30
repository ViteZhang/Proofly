import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { countOpenTasks } from "@/lib/queries/tasks";
import { Topbar } from "@/components/layout/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getProfileFacts } from "@/lib/queries/facts";
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

  // 顶栏体检芯片接真实数据：事实层里还有几处对不上
  const { blockingCount } = await getProfileFacts();

  // 顶栏方向选择器接真实数据（Step 0 那三个写死的选项到此为止）
  // 侧栏「行动清单」徽标接真实待办数
  const [targets, todoCount] = await Promise.all([listTargetOptions(), countOpenTasks()]);

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
            <Topbar blockingCount={blockingCount} targets={targets} />
          </Suspense>
        </div>
        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
