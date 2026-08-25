"use server";

import { z } from "zod";

import { callLLM, type TextTier } from "@/lib/llm";
import { MODEL, type Tier } from "@/lib/llm/config";
import { createClient } from "@/lib/supabase/server";

// 临时页面用的探针。切片 2.7 结束时连同页面一起删掉。

export type ProbeResult = {
  tier: Tier;
  model: string;
  ok: boolean;
  /** 成功时是返回内容摘要，失败时是错误原因 */
  detail: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  attempts: number | null;
};

// 64×64 纯红方块。图里只有一种颜色，答不对就是没看见图。
const RED_SQUARE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEtz/QMZxgi+" +
  "hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywK5G4EP" +
  "zFmrLgAAAABJRU5ErkJggg==";

const probeSchema = z.object({
  ok: z.boolean(),
  note: z.string(),
});

export async function runProbe(tier: Tier): Promise<ProbeResult> {
  const model = MODEL[tier];

  if (tier === "embedding") {
    const r = await callLLM({
      tier: "embedding",
      purpose: "llm_check_embedding",
      user: "证明度：一条经历有没有实测数据支撑。",
    });
    return r.ok
      ? {
          tier,
          model,
          ok: true,
          detail: `${r.data.length} 维，前三位 ${r.data
            .slice(0, 3)
            .map((n) => n.toFixed(4))
            .join(", ")}`,
          promptTokens: r.usage.promptTokens,
          completionTokens: r.usage.completionTokens,
          durationMs: r.usage.durationMs,
          attempts: r.usage.attempts,
        }
      : blank(tier, model, r.error);
  }

  // strong 档顺便验 JSON 强制与 zod 校验这条路，别等 Pass 2 才发现。
  if (tier === "strong") {
    const r = await callLLM({
      tier: "strong",
      purpose: "llm_check_strong",
      system: "你是一个连通性探针。",
      user: '返回 {"ok": true, "note": "通了"}。',
      jsonSchema: probeSchema,
    });
    return r.ok
      ? {
          tier,
          model,
          ok: true,
          detail: `JSON 校验通过：${JSON.stringify(r.data)}`,
          promptTokens: r.usage.promptTokens,
          completionTokens: r.usage.completionTokens,
          durationMs: r.usage.durationMs,
          attempts: r.usage.attempts,
        }
      : blank(tier, model, r.error);
  }

  const r = await callLLM(
    tier === "vision"
      ? {
          tier: "vision" as TextTier,
          purpose: "llm_check_vision",
          system: "你是一个连通性探针。只回答颜色名，不要别的字。",
          user: "这张图是什么颜色？",
          images: [RED_SQUARE_PNG],
        }
      : {
          tier: "light" as TextTier,
          purpose: "llm_check_light",
          system: "你是一个连通性探针。",
          user: "只回复两个字：通了",
        },
  );

  return r.ok
    ? {
        tier,
        model,
        ok: true,
        detail: r.data.trim().slice(0, 200),
        promptTokens: r.usage.promptTokens,
        completionTokens: r.usage.completionTokens,
        durationMs: r.usage.durationMs,
        attempts: r.usage.attempts,
      }
    : blank(tier, model, r.error);
}

function blank(tier: Tier, model: string, error: string): ProbeResult {
  return {
    tier,
    model,
    ok: false,
    detail: error,
    promptTokens: null,
    completionTokens: null,
    durationMs: null,
    attempts: null,
  };
}

export type CallRow = {
  id: string;
  tier: string;
  purpose: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  created_at: string | null;
};

export async function recentCalls(): Promise<CallRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("llm_calls")
    .select("id, tier, purpose, prompt_tokens, completion_tokens, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}
