import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic Link 落地：交换 code 换 session，成功后回首页；失败/过期回登录页给提示。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 无 code / 交换失败 / 链接过期 → 回登录页，落地提示「链接过期了，重新发一封吧」
  return NextResponse.redirect(`${origin}/login?error=expired`);
}
