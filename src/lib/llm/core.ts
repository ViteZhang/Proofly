// =============================================================
// Proofly · 模型调用适配层 · 传输核心
//
// 这一层不认识 Next 也不认识 Supabase，只管发请求、剥围栏、校验、重试。
// 成本记录通过 onCall 注入——应用里注入写 llm_calls 的实现（见 index.ts），
// 评估脚本不注入，于是可以脱离 Next 直接用 node 跑。
//
// 业务代码不要直接 import 这个文件，走 index.ts 的 callLLM()。
// =============================================================

import OpenAI from "openai";
import type { ZodType } from "zod";

import {
  EMBEDDING_DIM,
  MAX_OUTPUT_TOKENS,
  providersFor,
  type Provider,
  type Tier,
} from "./config";

export type { Tier };
export type { CallLog };

// ---- 返回类型 ----
// 与 Server Action 一样：不抛异常，失败以 { ok:false, error } 返回可读中文。
export type LLMUsage = {
  tier: Tier;
  /** 实际服务这次调用的那一家：itokens / bailian / deepseek */
  provider: string;
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

// 内部用：失败时多带一个「这种错值不值得换一家再试」。
// 对外仍然只暴露 LLMResult，多出来的字段调用方看不到也用不上。
type Fail = { ok: false; error: string; failover?: boolean };
type Attempt<T> = { ok: true; data: T; usage: LLMUsage } | Fail;

type BaseOptions = {
  /** 落进 llm_calls.purpose，用来回答「哪个环节贵」。如 pass1_segment。 */
  purpose: string;
  /** JSON 校验失败后的重试次数，默认 1。 */
  maxRetries?: number;
  /**
   * 这一次调用的总时限，默认 CALL_DEADLINE_MS（5 分钟）。
   *
   * 只有一种情况该调大：任务本身就要生成很长的结构化输出，5 分钟不是
   * 「卡住了」而是「还没写完」。面试题包是唯一这样的地方 —— 一次要 15–20
   * 道题、每道带 3–4 个应答要点，实测单次要 300–500s。把它按卡死处理，
   * 用户永远拿不到题。
   */
  deadlineMs?: number;
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
// 一次请求最多等这么久。实测：itokens 上最慢 1m31s，DeepSeek 兜底跑一段
// 5200 字的长片段要 2m09s（输出 8448 token）。按最慢那个的 1.8 倍留余量，
// 不然会把正在正常生成的兜底调用误杀掉。
const ATTEMPT_TIMEOUT_MS = 240_000;

// 连 SDK 重试一起算的总上限。SDK 对超时也会重试，不封顶的话一次卡死
// 能拖到 50 分钟——那条候选就一直挂在 pending，界面看着跟死了一样，
// 还不报错。宁可判失败让人重试，也不能无声地等下去。
const CALL_DEADLINE_MS = 300_000;

// ---- 熔断 ----
// 供应商整体宕机时，「每条候选都先花 5 分钟撞主用、再换兜底」是不能接受的：
// 13 条就是一小时的空等。所以一家在短时间内连着挂几次，就先跳过它，
// 过一阵再放行试探。只在进程内存里记，重启即忘——它只是为了让这一批跑完。
const TRIP_AFTER = 2;
const TRIP_FOR_MS = 60_000;
const strikes = new Map<string, { n: number; until: number }>();

function isTripped(name: string): boolean {
  const s = strikes.get(name);
  return s !== undefined && s.n >= TRIP_AFTER && Date.now() < s.until;
}

function strike(name: string): void {
  const now = Date.now();
  const s = strikes.get(name);
  const n = s !== undefined && now < s.until ? s.n + 1 : 1;
  strikes.set(name, { n, until: now + TRIP_FOR_MS });
}

function clearStrikes(name: string): void {
  strikes.delete(name);
}

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
  const providers = providersFor(opts.tier);
  if (providers.length === 0) {
    return { ok: false, error: "没有配置模型接入，先在 .env.local 里填 OPENAI_API_KEY" };
  }

  // 熔断中的排到后面去，但一个都不删——全被熔断时还是要有人去试，
  // 否则整批直接失败，比慢一点更糟。
  const ordered = [...providers].sort(
    (a, b) => Number(isTripped(a.name)) - Number(isTripped(b.name)),
  );

  let last: Fail = { ok: false, error: "模型调用失败" };

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    const client = new OpenAI({
      apiKey: p.apiKey,
      baseURL: p.baseURL,
      // 网络层重试，与下面的校验重试是两回事。
      // 中转站在并发下会回 503，SDK 的指数退避能扛过大部分，所以给到 4 次。
      maxRetries: 4,
      // 传了 deadlineMs 就跟着放宽：SDK 先超时的话会自己重试，
      // 于是一次本来只是慢的生成被重跑四遍，比不放宽还糟。
      timeout: opts.deadlineMs ?? ATTEMPT_TIMEOUT_MS,
    });

    const r: Attempt<unknown> =
      opts.tier === "embedding"
        ? await embed(client, p, opts)
        : await complete(client, p, opts);

    if (r.ok) {
      clearStrikes(p.name);
      return r;
    }
    last = r;
    if (r.failover) strike(p.name);

    // 只有「这家挂了」才换下一家。key 不对、型号不存在、请求本身有问题，
    // 换一家结果一样，还会把配置错误盖掉——那种就地返回。
    if (!r.failover || i === ordered.length - 1) return { ok: false, error: r.error };
  }

  return { ok: false, error: last.error };
}

/** 这种错换一家还有戏吗。只认「这家不可用」，不认「这个请求有问题」。 */
function shouldFailover(e: unknown): boolean {
  if (e instanceof OpenAI.APIUserAbortError) return true; // 撞上我们的总时限
  if (e instanceof OpenAI.APIConnectionError) return true; // 连不上，含 SDK 超时
  if (e instanceof OpenAI.RateLimitError) return true;
  if (e instanceof OpenAI.APIError) return (e.status ?? 0) >= 500;
  return false;
}

// =============================================================
// 文本档：light / strong / vision
// =============================================================

async function complete(
  client: OpenAI,
  provider: Provider,
  opts: TextOptions & { jsonSchema?: ZodType },
): Promise<Attempt<unknown>> {
  const model = provider.model;
  const maxRetries = opts.maxRetries ?? 1;

  // jsonSchema 传了就强制 JSON。约束追加在系统提示词末尾，
  // 不改动第五节那三段提示词的原文。
  const system = opts.jsonSchema ? opts.system + JSON_SUFFIX : opts.system;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: userContent(opts) },
  ];

  const deadline = opts.deadlineMs ?? CALL_DEADLINE_MS;

  let attempts = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const started = Date.now();

  // attempt 0 是首发，之后每一轮都是把校验错误回传给模型再试。
  for (let round = 0; round <= maxRetries; round++) {
    attempts++;
    const t0 = Date.now();
    let raw: string;
    const cap = opts.maxTokens ?? MAX_OUTPUT_TOKENS[opts.tier];
    try {
      // 已知问题：抽一条带三个能力点的经历时，输出能到几千 token，
      // 中转站偶尔会在生成完成前回 504 网关超时。流式本该能绕开
      // （连接一直有数据），但这个沙箱的出网代理会把 SSE 连接重置，
      // 没法在这里验证，所以不上没验证过的改动。
      // 当前的兜底是每条可以单独重试，见 ingest/pipeline.ts。
      const res = await client.chat.completions.create(
        {
          model,
          messages,
          max_completion_tokens: cap,
        },
        { signal: AbortSignal.timeout(deadline) },
      );
      const ms = Date.now() - t0;
      promptTokens += res.usage?.prompt_tokens ?? 0;
      completionTokens += res.usage?.completion_tokens ?? 0;
      await logCall({
        tier: opts.tier,
        provider: provider.name,
        purpose: opts.purpose,
        promptTokens: res.usage?.prompt_tokens ?? null,
        completionTokens: res.usage?.completion_tokens ?? null,
        durationMs: ms,
      });

      if (res.choices[0]?.finish_reason === "length") {
        return {
          ok: false,
          error: `模型输出被 ${cap} token 上限截断，这条没抽完`,
        };
      }
      raw = res.choices[0]?.message?.content ?? "";
    } catch (e) {
      await logCall({
        tier: opts.tier,
        provider: provider.name,
        purpose: opts.purpose,
        promptTokens: null,
        completionTokens: null,
        durationMs: Date.now() - t0,
      });
      return { ok: false, error: apiError(e), failover: shouldFailover(e) };
    }

    const usage: LLMUsage = {
      tier: opts.tier,
      provider: provider.name,
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
  provider: Provider,
  opts: EmbeddingOptions,
): Promise<Attempt<number[]>> {
  const model = provider.model;
  const t0 = Date.now();
  try {
    const res = await client.embeddings.create(
      {
        model,
        input: opts.user,
        dimensions: EMBEDDING_DIM,
      },
      { signal: AbortSignal.timeout(CALL_DEADLINE_MS) },
    );
    const ms = Date.now() - t0;
    await logCall({
      tier: "embedding",
      provider: provider.name,
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
        provider: provider.name,
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
      provider: provider.name,
      purpose: opts.purpose,
      promptTokens: null,
      completionTokens: null,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: apiError(e), failover: shouldFailover(e) };
  }
}

// =============================================================
// 成本记录
// =============================================================

type CallLog = {
  tier: Tier;
  /** 这笔调用实际是谁服务的：primary / deepseek。用来分清钱是谁收的。 */
  provider: string;
  purpose: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
};

export type CallLogger = (entry: CallLog) => Promise<void>;

let sink: CallLogger | null = null;

/** 注入成本记录的落库实现。只在应用启动路径上调用一次。 */
export function setCallLogger(fn: CallLogger): void {
  sink = fn;
}

// 每次实际发出的请求落一行，包括失败的和重试的——
// 失败也烧钱，漏记会让「哪个环节贵」这个问题答错。
// 记账本身永远不该让业务调用失败。
async function logCall(entry: CallLog): Promise<void> {
  if (!sink) return;
  try {
    await sink(entry);
  } catch {
    // 忽略
  }
}

function apiError(e: unknown): string {
  // 超时两种：SDK 自己的单次超时，和我们用 AbortSignal 卡的总时限。
  // 都要排在 APIConnectionError 前面——前者是它的子类。
  if (e instanceof OpenAI.APIUserAbortError)
    return `等了 ${Math.round(CALL_DEADLINE_MS / 60000)} 分钟模型还没回，先算这条失败`;
  if (e instanceof OpenAI.APIConnectionTimeoutError) return "模型接口超时没回";
  if (e instanceof OpenAI.AuthenticationError) return "模型接口拒绝了这个 key";
  if (e instanceof OpenAI.NotFoundError)
    return "这个型号在当前接入点上不存在，检查 config.ts 里的 MODEL";
  if (e instanceof OpenAI.RateLimitError) return "被限流了，过一会再试";
  if (e instanceof OpenAI.APIConnectionError) return "连不上模型接口，检查 OPENAI_BASE_URL";
  if (e instanceof OpenAI.APIError) return `模型接口报错 ${e.status}：${e.message}`;
  return e instanceof Error ? e.message : "模型调用失败";
}
