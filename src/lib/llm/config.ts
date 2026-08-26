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

// ---- 供应商链 ----
// 一档按顺序可以用哪些家。前面的挂了（连不上/超时/5xx/限流）就换后面一家重发。
// 型号全部取自 2026-08-26 各家 GET /models 的实际清单，不是照抄训练数据。
//
// 1) itokens  中转，GPT-5.6 三档：Sol 旗舰 / Terra 均衡 / Luna 轻量。
// 2) bailian  阿里云百炼。qwen3.8-max 是当前最新的旗舰文本档；
//    视觉走 qwen3-vl-plus；向量只有它有，所以向量档就住在这里。
//    light 档也用 qwen3.8-max——使用者只指定了这一个文本型号，
//    切分任务本来该用更便宜的档，这里是按指定配的，不是我挑的。
// 3) deepseek 最后兜底。flash 对 luna，pro 对 sol。
//    视觉只有 deepseek-v4-flash-vision-exp，名字带 exp 是实验型号，
//    放在链尾可以，不做前排。
type ProviderSpec = {
  name: string;
  /** 读哪个环境变量拿 key。没有就是这一家没配，跳过。 */
  keyEnv: string;
  baseEnv: string;
  defaultBase: string;
  models: Partial<Record<Tier, string>>;
};

const CHAIN: ProviderSpec[] = [
  {
    name: "itokens",
    keyEnv: "OPENAI_API_KEY",
    baseEnv: "OPENAI_BASE_URL",
    defaultBase: "https://api.openai.com/v1",
    models: { light: "gpt-5.6-luna", strong: "gpt-5.6-sol", vision: "gpt-5.6-terra" },
  },
  {
    name: "bailian",
    keyEnv: "BAILIAN_API_KEY",
    baseEnv: "BAILIAN_BASE_URL",
    defaultBase: "",
    models: {
      light: "qwen3.8-max",
      strong: "qwen3.8-max",
      vision: "qwen3-vl-plus",
      embedding: "qwen3.7-text-embedding",
    },
  },
  {
    name: "deepseek",
    keyEnv: "DEEPSEEK_API_KEY",
    baseEnv: "DEEPSEEK_BASE_URL",
    defaultBase: "https://api.deepseek.com",
    models: {
      light: "deepseek-v4-flash",
      strong: "deepseek-v4-pro",
      vision: "deepseek-v4-flash-vision-exp",
    },
  },
];

/** 这一档排第一位的型号。只用来在报告和日志里说「主用是谁」。 */
function headModel(tier: Tier): string {
  for (const p of CHAIN) {
    const m = p.models[tier];
    if (m) return m;
  }
  return "(这一档没有配型号)";
}

export const MODEL: Record<Tier, string> = {
  light: headModel("light"),
  strong: headModel("strong"),
  vision: headModel("vision"),
  embedding: headModel("embedding"),
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
export type Endpoint = { baseURL: string; apiKey: string };

/** 一个可用的供应商：打哪个地址、用哪个 key、跑哪个型号。 */
export type Provider = Endpoint & {
  /** 记进 llm_calls.provider，用来分清这笔钱是谁收的 */
  name: string;
  model: string;
};

/**
 * 这一档按顺序可以用哪些供应商。第一个是主用，后面的依次兜底。
 * 没配 key、或者这一档它没有型号，就不出现在链里。
 * 返回空数组表示这一档一家都没配上。
 */
export function providersFor(tier: Tier): Provider[] {
  const out: Provider[] = [];

  for (const spec of CHAIN) {
    const model = spec.models[tier];
    if (!model) continue;

    const apiKey = process.env[spec.keyEnv];
    if (!apiKey) continue;

    const baseURL = process.env[spec.baseEnv] ?? spec.defaultBase;
    if (baseURL === "") continue; // 百炼的地址是每个实例一条，没有能猜的默认值

    out.push({ name: spec.name, baseURL, apiKey, model });
  }

  // 向量档的历史配法：BAILIAN_* 之前叫 EMBEDDING_*。
  // 老的 .env.local 不改也能跑，但新配置优先。
  if (tier === "embedding" && out.length === 0) {
    const key = process.env.EMBEDDING_API_KEY;
    const base = process.env.EMBEDDING_BASE_URL;
    if (key && base) {
      out.push({ name: "bailian", baseURL: base, apiKey: key, model: MODEL.embedding });
    }
  }

  return out;
}
