// =============================================================
// Proofly · 题包的纯展示计算
//
// 单独一个文件是因为界面要用：queries/interview.ts 会把服务端
// Supabase 客户端一起带进 bundle，客户端组件不能碰。
// =============================================================

import type { PracticeStatus, RiskLevel } from "@/types/database";

export type KitOverview = {
  total: number;
  highRisk: number;
  practiced: number;
  struggling: number;
};

export function overviewOf(
  questions: { riskLevel: RiskLevel; practiceStatus: PracticeStatus }[],
): KitOverview {
  return {
    total: questions.length,
    highRisk: questions.filter((q) => q.riskLevel === "high").length,
    practiced: questions.filter((q) => q.practiceStatus === "practiced").length,
    struggling: questions.filter((q) => q.practiceStatus === "struggling").length,
  };
}
