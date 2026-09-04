// =============================================================
// Proofly · 提示词版本
//
// 只用于计费的重生成判定：指纹带上它，但比对时**不看**它 ——
// 提示词是我们改的，改完让用户重新花钱说不过去（技术方案 0.3）。
//
// 改了哪段提示词就把对应的号往前推一位。推错了的后果很轻：
// 无非是多让一次重新生成落进免费窗口。
// =============================================================

export const PROMPT_VERSION: Record<string, string> = {
  target_assess: "v1",
  task_plan: "v1",
  resume_baseline: "v1",
  resume_delta: "v1",
  resume_block: "v1",
  interview_kit: "v1",
  health_deep_scan: "v1",
};
