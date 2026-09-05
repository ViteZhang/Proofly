// =============================================================
// Proofly · 生成兑换码（命令行）
//
//   pnpm gen-code --package job --note "微信 xxx 2026-09-05 付款 68"
//   → PF-7K3M-Q2XR
//
// A0 之后码必须挂在批次上，所以这个脚本一次开一个批次 + N 张码。
// 「额度只有兑换一个入口」这条约束不给任何工具开例外，包括这个脚本。
//
// 后台上线后（A3）日常发码走 /admin，这个脚本留作两个用途：
//   一是后台自己出问题时的兜底通道；
//   二是 CI / 脚本化发码。
// =============================================================

import { createClient } from "@supabase/supabase-js";

import { PACKAGES } from "../src/config/plan";
import { formatCode, randomCode } from "../src/lib/redeem/code";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const packId = arg("package");
  const note = arg("note");
  const count = Math.max(Number(arg("count") ?? "1"), 1);
  const adminEmail = arg("as");

  const pack = PACKAGES.find((p) => p.id === packId);
  if (!pack) {
    console.error(`--package 要是这几个之一：${PACKAGES.map((p) => p.id).join(" / ")}`);
    process.exit(1);
  }
  // note 是履约追溯的唯一依据（C3 第二节要求三）：三个月后有人说
  // 「我付了钱没收到码」，你要能查。所以必填，不许省。
  if (!note || note.trim() === "") {
    console.error("--note 必填：写清发给了谁、什么时候、付了多少。这是唯一的追溯依据。");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "需要 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY。\n" +
        "service role key **不要**写进 .env.local（那是给 Next 用的），\n" +
        "临时传进来就行：SUPABASE_SERVICE_ROLE_KEY=xxx pnpm gen-code ...",
    );
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  // created_by 必填：批次要能回答「谁发的」。默认取白名单里的第一个管理员。
  const { data: admins } = await db
    .from("admin_users")
    .select("user_id,email")
    .order("created_at");
  const admin = adminEmail
    ? admins?.find((a) => a.email === adminEmail)
    : admins?.[0];
  if (!admin) {
    console.error(
      adminEmail
        ? `admin_users 里没有 ${adminEmail}`
        : "admin_users 是空的。先手工插一个管理员（见 supabase/38_admin_redeem.sql 顶部）。",
    );
    process.exit(1);
  }

  const { data: batch, error: batchErr } = await db
    .from("redeem_batches")
    .insert({
      name: `${pack.name} · 命令行发码`,
      purpose: "purchase",
      reason: `${pack.name} ¥${pack.price_cny} · ${note}`,
      credits_each: pack.credits,
      max_uses_each: 1,
      // 购买的码：不设有效期。付了钱的凭证不该因为没及时兑而作废。
      code_expires_at: null,
      credit_valid_days: null,
      code_count: count,
      created_by: admin.user_id,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    console.error(`建批次失败：${batchErr?.message}`);
    process.exit(1);
  }

  const codes = Array.from({ length: count }, () => formatCode(randomCode()));
  const { error } = await db.from("redeem_codes").insert(
    codes.map((code) => ({
      batch_id: batch.id,
      code,
      credits: pack.credits,
      max_uses: 1,
    })),
  );
  if (error) {
    console.error(`生成失败：${error.message}`);
    process.exit(1);
  }
  for (const c of codes) console.log(c);
}

void main();
