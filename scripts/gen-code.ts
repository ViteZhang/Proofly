// =============================================================
// Proofly · 生成兑换码
//
//   pnpm gen-code --package job --note "微信 xxx 2026-09-05 付款 68"
//   → PROOFLY-JOB-A7K3M2
//
// note 记录发给了谁、什么时候、付了多少。**这是履约追溯的唯一依据**
// （C3 第二节要求三）：三个月后有人说「我付了钱没收到码」，你要能查。
// 所以 --note 是必填的，不许省。
//
// 本期不做管理界面，就这一个脚本 + SQL 直查。
// =============================================================

import { createClient } from "@supabase/supabase-js";

import { PACKAGES } from "../src/config/plan";

// 去掉容易看错的字符：0/O、1/I/L。码是要念给人听、手打进去的。
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomTail(n = 6): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const packId = arg("package");
  const note = arg("note");
  const count = Number(arg("count") ?? "1");

  const pack = PACKAGES.find((p) => p.id === packId);
  if (!pack) {
    console.error(
      `--package 要是这几个之一：${PACKAGES.map((p) => p.id).join(" / ")}`,
    );
    process.exit(1);
  }
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

  for (let i = 0; i < Math.max(count, 1); i++) {
    const code = `PROOFLY-${pack.id.toUpperCase()}-${randomTail()}`;
    const { error } = await db.from("redeem_codes").insert({
      code,
      credits: pack.credits,
      max_uses: 1,
      note: `${pack.name} ¥${pack.price_cny} · ${note}`,
    });
    if (error) {
      console.error(`生成失败：${error.message}`);
      process.exit(1);
    }
    console.log(code);
  }
}

void main();
