import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// 公开路由：无需登录即可访问。其余一律要求登录。
// - /login          登录页（(auth) 组）
// - /auth/callback  Magic Link 落地，必须可达以交换 session
// - /design-check   临时令牌校验页（Step 1 结束删除）
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/design-check") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
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

  // 已登录访问 /login → 首页
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
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
