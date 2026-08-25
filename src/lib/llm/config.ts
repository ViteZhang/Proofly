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
// light   : Pass 1 切分定位。任务简单、输入长，要便宜要快。
// strong  : Pass 2 抽取、Pass 3 意图判定。判错代价高，不省这个钱。
// vision  : 扫描件与图片识别。
// embedding: 向量召回。必须输出 1536 维，与 atoms.embedding 的列宽一致。
export const MODEL: Record<Tier, string> = {
  light: "gpt-5.5-mini",
  strong: "gpt-5.5",
  vision: "gpt-5.5",
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
// 两个都是服务端变量，不带 NEXT_PUBLIC_ 前缀，不会进客户端 bundle。
export function llmEndpoint(): { baseURL: string; apiKey: string } | null {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (!apiKey) return null;
  return { baseURL, apiKey };
}
