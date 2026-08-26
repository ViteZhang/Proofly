// =============================================================
// Proofly · 拼进向量的那段文本
//
// 单独一个文件，因为它必须能脱离 Next 使用：
// scripts/backfill-embeddings.ts 用 node 直接跑，
// 而 embedding.ts 会经 @/lib/supabase/server 拉进 next/headers。
//
// 口径改了就得全量重算向量：pnpm embed:backfill --all
// =============================================================

import type { Json } from "@/types/database";  // 只作类型用，剥掉类型后不产生 import

function asStringList(v: Json | string[] | null | undefined): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x.trim() !== "") out.push(x);
  return out;
}

// 前 500 字足够表达一条经历是什么，再长就是 actions 的细节在稀释主题。
export function embeddingSource(a: {
  title: string;
  org?: string | null;
  role?: string | null;
  situation?: string | null;
  actions?: Json | string[] | null;
}): string {
  return [a.title, a.org ?? "", a.role ?? "", a.situation ?? "", asStringList(a.actions).join(" ")]
    .filter((s) => s.trim() !== "")
    .join(" ")
    .slice(0, 500);
}
