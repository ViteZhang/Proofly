// =============================================================
// Proofly · 模型调用适配层
//
// 所有模型调用必须经过 callLLM()。业务代码里不许出现 OpenAI SDK。
// 换模型、换供应商、加日志、加重试，都只改这一层。
//
// 传输逻辑在 core.ts（不依赖 Next，评估脚本能直接跑）；
// 这里只负责把成本记录接到 Supabase 上。
// 服务端专用：createClient 内部用 next/headers。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { setCallLogger } from "./core";

setCallLogger(async (entry) => {
  const supabase = await createClient();
  await supabase.from("llm_calls").insert({
    tier: entry.tier,
    provider: entry.provider,
    purpose: entry.purpose,
    prompt_tokens: entry.promptTokens,
    completion_tokens: entry.completionTokens,
    duration_ms: entry.durationMs,
  });
});

export { callLLM, stripFence } from "./core";
export type {
  CallLog,
  EmbeddingOptions,
  LLMResult,
  LLMUsage,
  TextOptions,
  TextTier,
  Tier,
} from "./core";
