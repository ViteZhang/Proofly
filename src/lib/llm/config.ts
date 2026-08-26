// =============================================================
// Proofly · 模型型号与接入配置
//
// 全项目唯一写死模型型号的地方。换模型只改这个文件。
// 业务代码一律 import 这里的常量，禁止在别处出现模型字符串。
//
// 接入方式：OpenAI 兼容的 Chat Completions / Embeddings 协议。
// 走中转 API 时只需换 OPENAI_BASE_URL，代码不动。
//
// 每一档可以配主用 + 兜底两个供应商。主用挂了（连不上、超时、5xx、限流）
// 就整条请求换到兜底重发一次。中转站宕机时抽取还能跑完，这是它存在的唯一理由。
// =============================================================

export type Tier = "light" | "strong" | "vision" | "embedding";

export const TIERS: Tier[] = ["light", "strong", "vision", "embedding"];

// ---- 型号 ----
// 型号取自两个接入点在 2026-08 实际提供的清单（GET /v1/models），
// 不是照抄训练数据。换接入点前先重新拉一次清单。
//
// 对话三档走 itokens 中转。GPT-5.6 一代分三档：Sol 旗舰 / Terra 均衡 / Luna 轻量。
// light   : Pass 1 切分定位。输入长、任务简单，用最便宜的 Luna。
// strong  : Pass 2 抽取、Pass 3 意图判定。判错代价高，用旗舰 Sol，不省这个钱。
// vision  : 扫描件与图片识别。认字不是硬推理，Terra 够用且比 Sol 便宜一半。
//
// 向量档走阿里云百炼（itokens 不提供任何向量模型）。
// qwen3.7-text-embedding 的默认输出是 1024 维，但支持 dimensions 参数，
// 传 1536 就正好对上 atoms.embedding 的列宽——不用改 Step 0 的表结构。
export const MODEL: Record<Tier, string> = {
  light: "gpt-5.6-luna",
  strong: "gpt-5.6-sol",
  vision: "gpt-5.6-terra",
  embedding: "qwen3.7-text-embedding",
};

// 兜底档走 DeepSeek 官方接口（型号取自 2026-08-26 的 GET /models 实际清单）。
// flash 对 luna，pro 对 sol——档位对得上，兜底时质量不会掉一个量级。
// vision 只有 deepseek-v4-flash-vision-exp，名字里带 exp，是实验型号，
// 拿来兜底可以，不做主用。
// 向量档没有兜底：DeepSeek 不提供向量模型，清单里一个都没有。
export const FALLBACK_MODEL: Partial<Record<Tier, string>> = {
  light: "deepseek-v4-flash",
  strong: "deepseek-v4-pro",
  vision: "deepseek-v4-flash-vision-exp",
};

// atoms.embedding 是 vector(1536)。维度对不上会在写库时报错，
// 所以在适配层就挡住，不要等到 2.4 才发现。
export const EMBEDDING_DIM = 1536;

// 单次回复的输出上限。抽取的 JSON 可能很长，别卡在半句话。
export const MAX_OUTPUT_TOKENS: Record<Exclude<Tier, "embedding">, number> = {
  light: 8000,
  strong: 16000,
  vision: 8000,
};

// ---- 接入 ----
// 全部是服务端变量，不带 NEXT_PUBLIC_ 前缀，不会进客户端 bundle。
//
// 对话三档与向量档分开配：中转站通常只转发对话模型，向量得回原厂。
// 没单独配时向量档回落到主接入点。
export type Endpoint = { baseURL: string; apiKey: string };

/** 一个可用的供应商：打哪个地址、用哪个 key、跑哪个型号。 */
export type Provider = Endpoint & {
  /** 记进 llm_calls.provider，用来分清这笔钱是谁收的 */
  name: string;
  model: string;
};

export function llmEndpoint(tier: Tier): Endpoint | null {
  if (tier === "embedding") {
    const key = process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!key) return null;
    return {
      baseURL:
        process.env.EMBEDDING_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        "https://api.openai.com/v1",
      apiKey: key,
    };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey,
  };
}

/**
 * 这一档按顺序可以用哪些供应商。第一个是主用，后面的是兜底。
 * 返回空数组表示这一档没配任何接入点。
 */
export function providersFor(tier: Tier): Provider[] {
  const out: Provider[] = [];

  const primary = llmEndpoint(tier);
  if (primary) out.push({ ...primary, name: "primary", model: MODEL[tier] });

  const fbModel = FALLBACK_MODEL[tier];
  const fbKey = process.env.DEEPSEEK_API_KEY;
  if (fbModel && fbKey) {
    out.push({
      name: "deepseek",
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      apiKey: fbKey,
      model: fbModel,
    });
  }
  return out;
}
