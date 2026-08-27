// =============================================================
// Proofly · Stage A · 会话意图分类
//
// 这一步的价值全在「不写库」的那三个分支上。
// 没有它，「我那个 AI 模块进展怎么样了」会被当成一条经历信息处理，
// 然后系统开始编。
// =============================================================

import { callLLM, type LLMResult } from "@/lib/llm";
import { STAGE_A_SYSTEM, stageAUser } from "@/lib/llm/chat-prompts";
import { stageASchema, type StageAResult } from "./schema";

export async function classifyMessage(v: {
  userMessage: string;
  recentTurns: string;
}): Promise<LLMResult<StageAResult>> {
  return callLLM({
    tier: "light",
    purpose: "chat_stage_a",
    system: STAGE_A_SYSTEM,
    user: stageAUser({ recentTurns: v.recentTurns, userMessage: v.userMessage }),
    jsonSchema: stageASchema,
  });
}
