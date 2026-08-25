import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getProfileFacts } from "@/lib/queries/facts";

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

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar email={user?.email ?? ""} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar blockingCount={blockingCount} />
        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
