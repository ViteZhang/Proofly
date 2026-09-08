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

import { reportCall } from "@/lib/telemetry/usage";
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
   * 这一次调用的**总**预算，默认 CALL_BUDGET_MS。换供应商也算在里面。
   *
   * 注意语义：这是整条兜底链一起花的时间，不是「每一家各给这么久」。
   * 调用方知道自己还剩多少时间（函数被平台回收前），就把剩余时间传进来，
   * 这一层负责把它摊给链上各家。传大了没有意义 —— 平台的墙不认。
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

// ---- 时间预算 ----
//
// 一通调用（含换供应商）最多花这么久。
//
// 这个数必须**明显小于平台给一次函数调用的时间**，否则兜底链是死的。
// 之前是「单家 300 秒」，而 Vercel 一次函数调用也是 300 秒：主用卡住时，
// 平台先把整个函数杀掉，第二家永远轮不到。线上实测——一份 1292 字的文档，
// Pass 2 直连模型跑了 400 秒还没回来，而百炼、DeepSeek 当时都是好的
// （40 / 89 token 每秒），却一次都没被试到。
//
// 快速报错时兜底一直是有用的（日志里能看到 itokens 秒挂、百炼接手）。
// 坏的是「卡住」这一种，而那恰恰是最常见的一种。
const CALL_BUDGET_MS = 200_000;

// 一家至少要给这么久，否则等于没试 —— 拿 8 秒去敲一个大模型，
// 结果只会是又一条超时，白白把预算耗在换家上。
const MIN_PROVIDER_MS = 40_000;

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

  const budget = opts.deadlineMs ?? CALL_BUDGET_MS;
  const startedAt = Date.now();

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];

    // 把剩下的时间摊给还没试的几家。前面一家很快挂掉，后面的就分得更多。
    const left = budget - (Date.now() - startedAt);
    const share = Math.floor(left / (ordered.length - i));
    if (i > 0 && share < MIN_PROVIDER_MS) {
      // 预算见底。再拿十几秒去敲下一家，只是把「超时」换个说法，
      // 还会多烧一次 token。就地认输，让调用方看见真正的原因。
      break;
    }
    const slice = Math.max(share, MIN_PROVIDER_MS);

    const client = new OpenAI({
      apiKey: p.apiKey,
      baseURL: p.baseURL,
      // 网络层重试，与下面的校验重试是两回事。中转站在并发下会回 503，
      // SDK 的指数退避能扛过大部分。但重试是**藏在一次调用里**的：
      // 日志上只留一行，看不出中间摔了几跤 —— 线上见过一次 540 token 的
      // Pass 1 花掉 159 秒，按当时实测的 40 token/秒该是 14 秒。
      // 所以次数要收，且下面的 AbortSignal 会把总时间卡死。
      maxRetries: 2,
      timeout: slice,
    });

    const r: Attempt<unknown> =
      opts.tier === "embedding"
        ? await embed(client, p, opts, slice)
        : await complete(client, p, opts, slice);

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
  sliceMs: number,
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

  // 这一家的截止时刻。校验重试要共用它，不能每一轮都重新发一份完整时间——
  // 那样两轮就把预算翻倍，后面的兜底家又轮不到了。
  const endsAt = Date.now() + sliceMs;

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
    const leftMs = endsAt - Date.now();
    if (leftMs <= 0) {
      return { ok: false, error: timedOut(sliceMs), failover: true };
    }
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
        { signal: AbortSignal.timeout(leftMs) },
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
        model,
        succeeded: true,
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
        model,
        succeeded: false,
      });
      return { ok: false, error: apiError(e, sliceMs), failover: shouldFailover(e) };
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
  sliceMs: number,
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
      { signal: AbortSignal.timeout(sliceMs) },
    );
    const ms = Date.now() - t0;
    await logCall({
      tier: "embedding",
      provider: provider.name,
      purpose: opts.purpose,
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: null,
      durationMs: ms,
      model,
      succeeded: true,
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
      model,
      succeeded: false,
    });
    return { ok: false, error: apiError(e, sliceMs), failover: shouldFailover(e) };
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
  /** 型号。落 llm_calls 时用不到，转给用量收集单用。 */
  model?: string;
  /** 这次请求本身成没成。失败的一样烧 token，一样要记。 */
  succeeded?: boolean;
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
  // 顺手记进当前的用量收集单（如果计费层铺了一张）。
  // 这里是 llm 与 billing 唯一的交汇点，而交汇发生在一个中立模块上：
  // 两边都 import telemetry，谁也不 import 谁。
  reportCall({
    purpose: entry.purpose,
    provider: entry.provider,
    model: entry.model ?? "",
    promptTokens: entry.promptTokens,
    completionTokens: entry.completionTokens,
    durationMs: entry.durationMs,
    succeeded: entry.succeeded ?? false,
  });
  if (!sink) return;
  try {
    await sink(entry);
  } catch {
    // 忽略
  }
}

/** 这一家没在分到的时间里回话。文案里带上秒数，日志和界面都好对账。 */
function timedOut(sliceMs: number): string {
  return `等了 ${Math.round(sliceMs / 1000)} 秒模型还没回，换一家`;
}

function apiError(e: unknown, sliceMs: number): string {
  // 超时两种：SDK 自己的单次超时，和我们用 AbortSignal 卡的总时限。
  // 都要排在 APIConnectionError 前面——前者是它的子类。
  if (e instanceof OpenAI.APIUserAbortError) return timedOut(sliceMs);
  if (e instanceof OpenAI.APIConnectionTimeoutError) return "模型接口超时没回";
  if (e instanceof OpenAI.AuthenticationError) return "模型接口拒绝了这个 key";
  if (e instanceof OpenAI.NotFoundError)
    return "这个型号在当前接入点上不存在，检查 config.ts 里的 MODEL";
  if (e instanceof OpenAI.RateLimitError) return "被限流了，过一会再试";
  if (e instanceof OpenAI.APIConnectionError) return "连不上模型接口，检查 OPENAI_BASE_URL";
  if (e instanceof OpenAI.APIError) return `模型接口报错 ${e.status}：${e.message}`;
  return e instanceof Error ? e.message : "模型调用失败";
}
