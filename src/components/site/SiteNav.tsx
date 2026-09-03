"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoWordmark } from "@/components/layout/Logo";

export function SiteNav() {
  const [stuck, setStuck] = useState(false);

  // null = 还没问出来，"" = 没登录，其余 = 登录着的那个邮箱。
  //
  // 这一问放在浏览器里做，不放服务端：官网首页是静态预渲染的，
  // 为了给少数已登录的老用户换个按钮，让每一个陌生访客的首屏都等一次
  // 鉴权往返，这笔账算不过来。代价是登录着的人会先看到一瞬间的
  // 「登录」再变成「进入控制台」—— getSession 只读本地 cookie 不走网络，
  // 所以那一瞬只有 hydration 那么长。
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let alive = true;
    // getSession 不走网络（getUser 会）。这里只是决定显示哪个按钮，
    // 不是授权判断 —— /app 该拦还是由 proxy 拦。
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) setEmail(data.session?.user.email ?? "");
      })
      .catch(() => {
        if (alive) setEmail("");
      });
    return () => {
      alive = false;
    };
  }, []);

  const signedIn = !!email;

  return (
    <nav className={`site-nav${stuck ? " stuck" : ""}`}>
      <div className="nav-in">
        <a href="#top" className="mark" aria-label="Proofly 首页">
          <LogoWordmark height={22} priority />
        </a>
        <div className="nav-r">
          <a href="#features" className="navlink">
            功能
          </a>
          <a href="#trust" className="navlink">
            为什么不同
          </a>
          <a href="#pricing" className="navlink">
            定价
          </a>
          <a href="#faq" className="navlink">
            常见问题
          </a>

          {signedIn ? (
            <>
              {/* 说清楚是「谁」登录着 —— 只有一个按钮的话，
                  共用电脑的人分不清现在这份账号是不是自己的。 */}
              <span className="navlink who" title={email}>
                {email.split("@")[0]}
              </span>
              <a href="/app" className="btn small">
                进入控制台
              </a>
            </>
          ) : (
            <>
              {/* 已经拿到邀请的人从这里进。登录着的话 /login 会直接把人送到 /app。 */}
              <a href="/login">登录</a>
              <a href="#join" className="btn small">
                免费加入内测
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
