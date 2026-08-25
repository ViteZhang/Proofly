// =============================================================
// Proofly · 模型型号与接入配置
//
// 全项目唯一写死模型型号的地方。换模型只改这个文件。
// 业务代码一律 import 这里的常量，禁止在别处出现模型字符串。
//
// 接入方式：OpenAI 兼容的 Chat Completions / Embeddings 协议。
// 走中转 API 时只需换 OPENAI_BASE_URL，代码不动。
// =============================================================

export type Tier = "light" | "strong" | "vision" | "embedding";

export const TIERS: Tier[] = ["light", "strong", "vision", "embedding"];

// ---- 型号 ----
// 型号取自 itokens 中转在 2026-08 实际提供的清单（GET /v1/models），
// 不是照抄训练数据。换中转站前先重新拉一次清单。
//
// GPT-5.6 一代分三档：Sol 旗舰 / Terra 均衡 / Luna 轻量。
// light   : Pass 1 切分定位。输入长、任务简单，用最便宜的 Luna。
// strong  : Pass 2 抽取、Pass 3 意图判定。判错代价高，用旗舰 Sol，不省这个钱。
// vision  : 扫描件与图片识别。认字不是硬推理，Terra 够用且比 Sol 便宜一半。
// embedding: 向量召回。必须输出 1536 维，与 atoms.embedding 的列宽一致。
//            ⚠ itokens 中转不提供任何向量模型，这一档需要另配接入点，见下方 embedding_* 变量。
export const MODEL: Record<Tier, string> = {
  light: "gpt-5.6-luna",
  strong: "gpt-5.6-sol",
  vision: "gpt-5.6-terra",
  embedding: "text-embedding-3-small",
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
