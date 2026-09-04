import { DeleteAccountForm } from "@/components/billing/DeleteAccountForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "删除账号 · Proofly" };

export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-[520px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">删除账号</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        这一步不可撤销。删之前先把数据导出来。
      </p>
      <DeleteAccountForm email={user?.email ?? ""} />
    </div>
  );
}
