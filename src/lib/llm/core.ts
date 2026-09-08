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
// 一通调用（含换供应商）最多花这么久。这是**总**预算，不按家平摊：
// 谁先上谁就用剩下的全部，死了由断流看门狗在 45 秒内揪出来换下一家。
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

// 流式下真正的「卡住」信号：这么久没吐出下一个字就判这家死了。
//
// 比总时长准得多。总时长会把正在正常生成的长回复误杀 —— 一条经历要几千
// token，两分钟是正常的，不是卡住。而只要还在一个字一个字往外吐，
// 它就是活的；连着 45 秒一个字都没有，那才是真的没气了。
const STALL_MS = 45_000;

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

    // 剩下多少就给多少，不按家数平摊。
    //
    // 平摊是流式之前的思路：那时候分不清「卡死」和「正在慢慢写」，只能靠
    // 缩短单家时限来保证后面几家轮得到。现在有断流看门狗了 —— 一家真死了
    // 45 秒内就会暴露，用不着预先扣住它的时间。反过来，平摊会把正在正常
    // 生成的长回复误杀：实测 itokens 流式抽一条要 134 秒，按三家平摊只给
    // 66 秒，等于亲手掐死唯一那个干得成活的。
    const left = budget - (Date.now() - startedAt);
    if (i > 0 && left < MIN_PROVIDER_MS) {
      // 预算见底。再拿十几秒去敲下一家，只是把「超时」换个说法，
      // 还会多烧一次 token。就地认输，让调用方看见真正的原因。
      break;
    }
    const slice = Math.max(left, MIN_PROVIDER_MS);

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
  if (e instanceof OpenAI.APIError) {
    // 没有状态码 = 这个错不是服务端给的一个完整 HTTP 响应，而是传输层出的事：
    // 流被上游掐断、连接中途没了。改成流式之后才浮出来的一类 ——
    // 非流式时代错误总是完整响应，永远带状态码，所以 `?? 0` 从来没暴露过。
    //
    // 实测踩到的原话：「Upstream response stream was interrupted」，
    // status 是 undefined，于是 `(undefined ?? 0) >= 500` 为假，判成「换家也
    // 没用」就地失败。可这恰恰最该换家：不是请求有问题，是这家的连接断了。
    if (e.status === undefined) return true;
    return e.status >= 500;
  }
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
    let raw = "";
    const cap = opts.maxTokens ?? MAX_OUTPUT_TOKENS[opts.tier];
    const leftMs = endsAt - Date.now();
    if (leftMs <= 0) {
      return { ok: false, error: timedOut(sliceMs), failover: true };
    }
    const gate = watchdog(leftMs);
    let lastUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    try {
      // 必须流式。这不是为了看字一个个蹦出来，是为了让连接上一直有数据 ——
      // 抽一条经历要生成几千 token，非流式时中间那一两分钟连接上是空的，
      // 于是：
      //   · itokens 的网关 61 秒回 504（实测，同一个请求流式跑通只要 134 秒）
      //   · 百炼在整段生成完成前不发响应头，超过 Node undici 默认的
      //     300 秒 headersTimeout 就被底层掐掉，报「等不到响应头」
      // 两家都是「等太久」而不是「答不出来」。流式一开，两家的病一起好。
      //
      // 顺带拿到 stall 这个真正的卡死信号：不是「总共花了多久」，
      // 而是「多久没吐出下一个字」。前者会误杀正在正常生成的长回复。
      const res = await client.chat.completions.create(
        {
          model,
          messages,
          max_completion_tokens: cap,
          stream: true,
          // 不要这个的话流式响应里没有 usage，成本报表会缺一块。
          // itokens / 百炼 / DeepSeek 三家都认（实测）。
          stream_options: { include_usage: true },
          // 这一家自己的参数（如百炼的 enable_thinking:false）。
          // 放在最后，但它只该带「不这么传就干不了活」的东西，见 config.ts。
          ...provider.extraBody,
        },
        { signal: gate.signal },
      );

      let finish: string | null = null;
      let chunks = 0;
      raw = "";
      for await (const part of res) {
        chunks++;
        gate.beat();
        raw += part.choices[0]?.delta?.content ?? "";
        const fr = part.choices[0]?.finish_reason;
        if (fr) finish = fr;
        if (part.usage) {
          promptTokens += part.usage.prompt_tokens ?? 0;
          completionTokens += part.usage.completion_tokens ?? 0;
          lastUsage = part.usage;
        }
      }

      const ms = Date.now() - t0;
      await logCall({
        tier: opts.tier,
        provider: provider.name,
        purpose: opts.purpose,
        promptTokens: lastUsage?.prompt_tokens ?? null,
        completionTokens: lastUsage?.completion_tokens ?? null,
        durationMs: ms,
        model,
        succeeded: true,
      });

      if (finish === "length") {
        // 百炼实测见过一种：16000 token 全花在思考上，正文一个字没有。
        // 这跟「写到一半被截断」是两回事，说出来才好换一家。
        return {
          ok: false,
          error:
            raw.trim() === ""
              ? `模型想了 ${cap} token 也没开始作答，这条它做不了`
              : `模型输出被 ${cap} token 上限截断，这条没抽完`,
          failover: true,
        };
      }
      if (chunks === 0) return { ok: false, error: "模型没有返回任何内容", failover: true };
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
      // 断流和「总时间到了」在 SDK 眼里都是 abort，得自己分清楚，
      // 不然界面上永远只有一句「超时」，查不出到底是哪一种。
      if (gate.stalled()) {
        return { ok: false, error: `模型吐到一半断了（${STALL_MS / 1000} 秒没动静）`, failover: true };
      }
      return { ok: false, error: apiError(e, sliceMs), failover: shouldFailover(e) };
    } finally {
      gate.done();
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

/**
 * 一次流式请求的看门狗：总时限 + 断流检测，合成一个 AbortSignal。
 *
 * 两条命都要看。只看总时限，卡死的连接会一直挂到时间用完，把后面几家的
 * 预算一起赔进去；只看断流，一个慢慢吐字但永远吐不完的回复能拖到天荒地老。
 */
function watchdog(totalMs: number): {
  signal: AbortSignal;
  beat: () => void;
  stalled: () => boolean;
  done: () => void;
} {
  const ctl = new AbortController();
  let stalled = false;
  let gap: ReturnType<typeof setTimeout>;

  const arm = () => {
    clearTimeout(gap);
    gap = setTimeout(() => {
      stalled = true;
      ctl.abort();
    }, STALL_MS);
  };
  const total = setTimeout(() => ctl.abort(), totalMs);
  arm();

  return {
    signal: ctl.signal,
    beat: arm,
    stalled: () => stalled,
    done: () => {
      clearTimeout(gap);
      clearTimeout(total);
    },
  };
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
