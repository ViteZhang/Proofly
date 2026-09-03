"use client";

import { useEffect } from "react";
import { ensureFacts } from "@/app/app/facts/actions";

// 首次进入时把缺的预置项补成空记录。补完页面会自己刷新，missing 变空就不再跑。
export function EnsureFacts({ missing }: { missing: string[] }) {
  useEffect(() => {
    if (missing.length > 0) void ensureFacts(missing);
  }, [missing]);
  return null;
}
