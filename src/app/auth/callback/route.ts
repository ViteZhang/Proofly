import { NextResponse } from "next/server";
import { ensureOnboarded } from "@/lib/billing/onboard";
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
      // 登录落地就开户：建计数器、发注册赠送。幂等，老用户走这里是空操作。
      // 放在这里而不是数据库触发器里，因为护栏触顶要走降级分支。
      await ensureOnboarded();
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 无 code / 交换失败 / 链接过期 → 回登录页，落地提示「链接过期了，重新发一封吧」
  return NextResponse.redirect(`${origin}/login?error=expired`);
}
