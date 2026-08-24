import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 的 proxy 约定（旧称 middleware）。
// 职责：刷新 Supabase session + 未登录重定向到 /login。
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 跑在除以下之外的所有路由：Next 内部资源、静态文件、图片、favicon。
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
