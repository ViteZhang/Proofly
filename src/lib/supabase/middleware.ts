import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// 公开路由：无需登录即可访问。其余一律要求登录。
// - /               官网首页（营销站），登录与否都能看
// - /login          登录页（(auth) 组）
// - /auth/callback  Magic Link 落地，必须可达以交换 session
// - /api/cron/*     定时任务，没有 session 可言，自己用 CRON_SECRET 鉴权
//
// 产品在 /app 下，整段受保护 —— 官网和产品同域，靠这一条分界。
function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  // 定时任务由 Vercel Cron 发起，带的是 CRON_SECRET 不是登录态。
  // 放行的只是「不查 session」，不是「不鉴权」—— 路由自己会拒。
  if (pathname.startsWith("/api/cron/")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  // 官网首页完全不看 session，直接放行。
  // 不这么写的话，每一次营销页浏览都要往 Auth 服务打一次 getUser——
  // 落地页的首屏时间要为一个用不上的结果买单。
  if (request.nextUrl.pathname === "/") return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 刷新 session 并在服务端校验用户（getUser 会向 Auth 服务核验，比 getSession 安全）。
  // 不要在 createServerClient 与 getUser 之间插入其他逻辑。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  // 未登录访问受保护路由 → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  // 已登录访问 /login → 产品首页。
  // 官网 / 不在此列：登录了也该能回去看定价和常见问题。
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  // 必须返回带有刷新后 cookie 的 supabaseResponse。
  return supabaseResponse;
}

// 把 session 刷新写入的 cookie 复制到重定向响应，避免刷新丢失。
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
