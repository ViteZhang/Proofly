// =============================================================
// Proofly · 给还没有向量的经历补上向量
//
//   pnpm embed:backfill              只补缺的
//   pnpm embed:backfill --all        全部重算（改过 embeddingSource 的口径时用）
//
// 平时不需要跑：新增和编辑经历时 Server Action 会自己补。
// 这个脚本是给两种情况准备的：
//   1. Step 1 手工录入的经历，那时候还没有向量档
//   2. 换了向量模型，旧向量的语义空间对不上了
//
// 直接连 Supabase，用的是 anon key + 一次密码登录，走的还是 RLS，
// 不需要 service role key。
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { callLLM, setCallLogger } from "../src/lib/llm/core";
import { EMBEDDING_DIM, MODEL } from "../src/lib/llm/config";
import { embeddingSource } from "../src/lib/ingest/embedding-source";

const CONCURRENCY = 3;

async function main() {
  const all = process.argv.includes("--all");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.PROOFLY_EMAIL;
  const password = process.env.PROOFLY_PASSWORD;

  if (!url || !anon) {
    console.error("缺 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }
  if (!email || !password) {
    console.error(
      "需要登录才能读到你自己的经历（RLS）。跑之前设两个环境变量：\n" +
        "  PROOFLY_EMAIL=你的邮箱 PROOFLY_PASSWORD=你的密码 pnpm embed:backfill",
    );
    process.exit(1);
  }

  const supabase = createClient(url, anon);
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error(`登录失败：${authError.message}`);
    process.exit(1);
  }

  // core.ts 的记账是注入式的，应用里由 llm/index.ts 接上 Supabase。
  // 这个脚本不经过 Next，得自己接一次，否则回填的花销不进账。
  // 记完报一句：记账悄悄失败过一次，直到翻表才发现，这次让它自己说。
  let logged = 0;
  let logWarn = "";
  setCallLogger(async (e) => {
    const { error: logErr } = await supabase.from("llm_calls").insert({
      tier: e.tier,
      provider: e.provider,
      purpose: e.purpose,
      prompt_tokens: e.promptTokens,
      completion_tokens: e.completionTokens,
      duration_ms: e.durationMs,
    });
    if (logErr) {
      logWarn ||= logErr.message;
      return;
    }
    logged++;
  });

  let q = supabase.from("atoms").select("id, title, org, role, situation, actions");
  if (!all) q = q.is("embedding", null);
  const { data: rows, error } = await q;
  if (error) {
    console.error(`读不到经历：${error.message}`);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log(all ? "库里一条经历都没有。" : "每条经历都有向量了，不用补。");
    return;
  }

  console.log(`要补 ${rows.length} 条 · 用 ${MODEL.embedding} · ${EMBEDDING_DIM} 维\n`);

  let done = 0;
  const failed: { title: string; why: string }[] = [];

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= rows.length) return;
        const a = rows[i];
        const text = embeddingSource(a);
        if (text.trim() === "") {
          failed.push({ title: a.title, why: "标题和正文都是空的，没东西可向量化" });
          continue;
        }
        const r = await callLLM({ tier: "embedding", purpose: "backfill_embedding", user: text });
        if (!r.ok) {
          failed.push({ title: a.title, why: r.error });
          continue;
        }
        const { error: upErr } = await supabase
          .from("atoms")
          .update({ embedding: JSON.stringify(r.data) })
          .eq("id", a.id);
        if (upErr) {
          failed.push({ title: a.title, why: upErr.message });
          continue;
        }
        done++;
        console.log(`  ✓ ${a.title}`);
      }
    }),
  );

  console.log(`\n补上 ${done} 条${failed.length ? `，失败 ${failed.length} 条` : ""}`);
  for (const f of failed) console.log(`  ✗ ${f.title} —— ${f.why}`);
  if (logWarn) console.log(`  ! 花销没记进 llm_calls：${logWarn}`);
  else if (logged > 0) console.log(`  花销已记账 ${logged} 笔`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
