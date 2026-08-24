import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 Next 16 自动生成 AGENTS.md / CLAUDE.md（本项目不需要）。
  agentRules: false,
};

export default nextConfig;
