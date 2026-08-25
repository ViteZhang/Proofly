// =============================================================
// Proofly · 模型调用适配层
//
// 所有模型调用必须经过 callLLM()。业务代码里不许出现 OpenAI SDK。
// 换模型、换供应商、加日志、加重试，都只改这一层。
//
// 服务端专用：依赖 @/lib/supabase/server（内部用 next/headers）。
// =============================================================

import OpenAI from "openai";
import type { ZodType } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  EMBEDDING_DIM,
  MAX_OUTPUT_TOKENS,
  MODEL,
  llmEndpoint,
  type Tier,
} from "./config";

export type { Tier };

// ---- 返回类型 ----
// 与 Server Action 一样：不抛异常，失败以 { ok:false, error } 返回可读中文。
export type LLMUsage = {
  tier: Tier;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
  /** 实际发出的请求次数。> 1 说明触发了校验重试。 */
  attempts: number;
};

export type LLMResult<T> =
  | { ok: true; data: T; usage: LLMUsage }
  | { ok: false; error: string };

type BaseOptions = {
  /** 落进 llm_calls.purpose，用来回答「哪个环节贵」。如 pass1_segment。 */
  purpose: string;
  /** JSON 校验失败后的重试次数，默认 1。 */
  maxRetries?: number;
};

export type TextTier = Exclude<Tier, "embedding">;

export type TextOptions = BaseOptions & {
  tier: TextTier;
  system: string;
  user: string;
  /** base64 或完整 data URL，vision 档用。 */
  images?: string[];
  maxTokens?: number;
};

export type EmbeddingOptions = BaseOptions & {
  tier: "embedding";
  user: string;
};

// ---- 重载 ----
export async function callLLM(
  opts: EmbeddingOptions,
): Promise<LLMResult<number[]>>;
export async function callLLM<S extends ZodType>(
  opts: TextOptions & { jsonSchema: S },
): Promise<LLMResult<ReturnType<S["parse"]>>>;
export async function callLLM(opts: TextOptions): Promise<LLMResult<string>>;

export async function callLLM(
  opts: (TextOptions & { jsonSchema?: ZodType }) | EmbeddingOptions,
): Promise<LLMResult<unknown>> {
  const endpoint = llmEndpoint(opts.tier);
  if (!endpoint) {
    return { ok: false, error: "没有配置模型接入，先在 .env.local 里填 OPENAI_API_KEY" };
  }
  const client = new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseURL,
    maxRetries: 2, // 网络层重试，与下面的校验重试是两回事
  });

  return opts.tier === "embedding"
    ? embed(client, opts)
    : complete(client, opts);
}

// =============================================================
// 文本档：light / strong / vision
// =============================================================

async function complete(
  client: OpenAI,
  opts: TextOptions & { jsonSchema?: ZodType },
): Promise<LLMResult<unknown>> {
  const model = MODEL[opts.tier];
  const maxRetries = opts.maxRetries ?? 1;

  // jsonSchema 传了就强制 JSON。约束追加在系统提示词末尾，
  // 不改动第五节那三段提示词的原文。
  const system = opts.jsonSchema ? opts.system + JSON_SUFFIX : opts.system;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: userContent(opts) },
  ];

  let attempts = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const started = Date.now();

  // attempt 0 是首发，之后每一轮都是把校验错误回传给模型再试。
  for (let round = 0; round <= maxRetries; round++) {
    attempts++;
    const t0 = Date.now();
    let raw: string;
    try {
      const res = await client.chat.completions.create({
        model,
        messages,
        max_completion_tokens: opts.maxTokens ?? MAX_OUTPUT_TOKENS[opts.tier],
      });
      const ms = Date.now() - t0;
      promptTokens += res.usage?.prompt_tokens ?? 0;
      completionTokens += res.usage?.completion_tokens ?? 0;
      await logCall({
        tier: opts.tier,
        purpose: opts.purpose,
        promptTokens: res.usage?.prompt_tokens ?? null,
        completionTokens: res.usage?.completion_tokens ?? null,
        durationMs: ms,
      });

      if (res.choices[0]?.finish_reason === "length") {
        return {
          ok: false,
          error: `模型输出被 ${opts.maxTokens ?? MAX_OUTPUT_TOKENS[opts.tier]} token 上限截断，这条没抽完`,
        };
      }
      raw = res.choices[0]?.message?.content ?? "";
    } catch (e) {
      await logCall({
        tier: opts.tier,
        purpose: opts.purpose,
        promptTokens: null,
        completionTokens: null,
        durationMs: Date.now() - t0,
      });
      return { ok: false, error: apiError(e) };
    }

    const usage: LLMUsage = {
      tier: opts.tier,
      model,
      promptTokens,
      completionTokens,
      durationMs: Date.now() - started,
      attempts,
    };

    if (!opts.jsonSchema) {
      if (raw.trim() === "") return { ok: false, error: "模型返回了空内容" };
      return { ok: true, data: raw, usage };
    }

    const parsed = parseJson(raw, opts.jsonSchema);
    if (parsed.ok) return { ok: true, data: parsed.data, usage };

    // 还有重试额度就把错误回传，让模型自己修。
    if (round < maxRetries) {
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: RETRY_PREFIX + parsed.error });
      continue;
    }

    // 重试用尽：明确失败，不静默丢弃。
    return { ok: false, error: `模型输出不符合结构要求：${parsed.error}` };
  }

  return { ok: false, error: "模型没有产出可用结果" };
}

const JSON_SUFFIX =
  "\n\n只输出 JSON 本身。不要解释文字，不要 markdown 代码围栏，不要在 JSON 前后加任何字符。";

const RETRY_PREFIX =
  "上一次的输出无法通过结构校验。只输出修正后的 JSON，不要解释。错误是：";

function userContent(
  opts: TextOptions,
): OpenAI.Chat.ChatCompletionUserMessageParam["content"] {
  if (!opts.images || opts.images.length === 0) return opts.user;
  return [
    { type: "text", text: opts.user },
    ...opts.images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: dataUrl(img) },
    })),
  ];
}

// 传进来的可能已经是 data URL，也可能是裸 base64。
function dataUrl(img: string): string {
  return img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
}

// =============================================================
// JSON 解析：剥围栏 → JSON.parse → zod
// =============================================================

type ParseOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export function stripFence(raw: string): string {
  const s = raw.trim();
  if (!s.startsWith("```")) return s;
  // ```json\n...\n``` 或 ```\n...\n```
  const body = s.replace(/^```[a-zA-Z]*\s*\n?/, "");
  const end = body.lastIndexOf("```");
  return (end === -1 ? body : body.slice(0, end)).trim();
}

function parseJson(raw: string, schema: ZodType): ParseOutcome {
  const text = stripFence(raw);
  if (text === "") return { ok: false, error: "返回内容为空" };

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: `不是合法 JSON，开头是「${text.slice(0, 60)}」` };
  }

  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "根"} — ${i.message}`)
    .join("；");
  return { ok: false, error: issues };
}

// =============================================================
// 向量档
// =============================================================

async function embed(
  client: OpenAI,
  opts: EmbeddingOptions,
): Promise<LLMResult<number[]>> {
  const model = MODEL.embedding;
  const t0 = Date.now();
  try {
    const res = await client.embeddings.create({
      model,
      input: opts.user,
      dimensions: EMBEDDING_DIM,
    });
    const ms = Date.now() - t0;
    await logCall({
      tier: "embedding",
      purpose: opts.purpose,
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: null,
      durationMs: ms,
    });

    const vector = res.data[0]?.embedding;
    if (!vector) return { ok: false, error: "向量接口没有返回数据" };
    if (vector.length !== EMBEDDING_DIM) {
      return {
        ok: false,
        error: `向量维度是 ${vector.length}，但 atoms.embedding 是 ${EMBEDDING_DIM} 维，写不进去`,
      };
    }
    return {
      ok: true,
      data: vector,
      usage: {
        tier: "embedding",
        model,
        promptTokens: res.usage?.prompt_tokens ?? null,
        completionTokens: null,
        durationMs: ms,
        attempts: 1,
      },
    };
  } catch (e) {
    await logCall({
      tier: "embedding",
      purpose: opts.purpose,
      promptTokens: null,
      completionTokens: null,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: apiError(e) };
  }
}

// =============================================================
// 成本记录
// =============================================================

type CallLog = {
  tier: Tier;
  purpose: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
};

// 每次实际发出的请求落一行，包括失败的和重试的——
// 失败也烧钱，漏记会让「哪个环节贵」这个问题答错。
// 写日志本身永远不该让业务调用失败。
async function logCall(entry: CallLog): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("llm_calls").insert({
      tier: entry.tier,
      purpose: entry.purpose,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      duration_ms: entry.durationMs,
    });
  } catch {
    // 忽略
  }
}

function apiError(e: unknown): string {
  if (e instanceof OpenAI.AuthenticationError) return "模型接口拒绝了这个 key";
  if (e instanceof OpenAI.NotFoundError)
    return "这个型号在当前接入点上不存在，检查 config.ts 里的 MODEL";
  if (e instanceof OpenAI.RateLimitError) return "被限流了，过一会再试";
  if (e instanceof OpenAI.APIConnectionError) return "连不上模型接口，检查 OPENAI_BASE_URL";
  if (e instanceof OpenAI.APIError) return `模型接口报错 ${e.status}：${e.message}`;
  return e instanceof Error ? e.message : "模型调用失败";
}
