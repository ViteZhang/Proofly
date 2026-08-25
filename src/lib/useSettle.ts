"use client";

import { useState } from "react";

/**
 * 写操作成功到服务端把新数据发回来，中间隔着一次往返。
 * 这期间不能把表单收掉——会闪一下旧值，看着像没保存上。
 *
 * 判断依据是被观察的 props 换了新对象：服务端每次重渲染都会造新的，
 * 所以对象身份变了就说明新数据到了。
 */
export function useSettle<T>(value: T): { settling: boolean; hold: () => void } {
  const [seen, setSeen] = useState(value);
  const [settling, setSettling] = useState(false);

  if (seen !== value) {
    setSeen(value);
    if (settling) setSettling(false);
  }

  return {
    settling,
    hold: () => {
      setSettling(true);
      // 兜底：万一那次刷新没回来，也不能把人锁在表单里
      setTimeout(() => setSettling(false), 5000);
    },
  };
}
