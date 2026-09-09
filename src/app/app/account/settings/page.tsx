import { createClient } from "@/lib/supabase/server";
import { getAccountProfile } from "@/lib/queries/profile";
import { getProfileFacts } from "@/lib/queries/facts";
import { AccountSettings } from "@/components/profile/AccountSettings";

export const metadata = { title: "账户设置 · Proofly" };

/**
 * 账户设置。
 *
 * 这一页只有账户层的东西：显示名、头像。会印在简历上的姓名、联系方式在
 * 「基本信息」，两处严格分开 —— 它们混用一个字段的那一天，就是有人投出
 * 一份印着网名的简历的那一天。
 */
export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const [{ data: auth }, account, { facts }] = await Promise.all([
    supabase.auth.getUser(),
    getAccountProfile(),
    getProfileFacts(),
  ]);

  const email = auth.user?.email ?? "";
  const resumeName = facts.find((f) => f.key === "name")?.value?.trim() || null;

  return (
    <div className="max-w-[560px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">账户设置</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        显示名和头像只影响这个界面，不影响任何简历。
      </p>

      <div className="mt-5">
        <AccountSettings
          displayName={account.displayName}
          avatarColor={account.avatarColor}
          resumeName={resumeName}
          fallbackInitial={(email[0] ?? "?").toUpperCase()}
        />
      </div>

      <div
        className="mt-3 rounded-card px-5 py-4 text-[13px]"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--slate)" }}
      >
        登录邮箱 · {email || "未知"}
      </div>
    </div>
  );
}
