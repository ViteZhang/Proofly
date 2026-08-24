import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// 浏览器端 Supabase 客户端。只用 publishable / anon key，无任何服务端密钥。
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
