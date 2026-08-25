import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 Next 16 自动生成 AGENTS.md / CLAUDE.md（本项目不需要）。
  agentRules: false,

  // 这两个带原生二进制或自带打包产物，交给 Node 直接 require，别让打包器碰。
  // @napi-rs/canvas 是 unpdf 渲染扫描件页面时用的画布实现。
  serverExternalPackages: ["@napi-rs/canvas", "unpdf", "mammoth"],
};

export default nextConfig;
