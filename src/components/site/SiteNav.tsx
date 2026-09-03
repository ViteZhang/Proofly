"use client";

import { useEffect, useState } from "react";

// 顶栏。滚过一点点才画下边线 —— 页面在最顶上时那条线是多余的，
// 一滚起来又需要它把顶栏和内容分开。
export function SiteNav() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`site-nav${stuck ? " stuck" : ""}`}>
      <div className="nav-in">
        <a href="#top" className="mark">
          <i />
          Proofly
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
          {/* 已经拿到邀请的人从这里进。登录着的话 /login 会直接把人送到 /app。 */}
          <a href="/login">登录</a>
          <a href="#join" className="btn small">
            免费加入内测
          </a>
        </div>
      </div>
    </nav>
  );
}
