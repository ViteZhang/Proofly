// =============================================================
// Proofly · 分值标签与免费标记
//
// 所有付费动作按钮统一格式：`[ 动作名 ⬡N ]`，分值视觉上弱于动作文字
// （小一号、次级色）—— 用户先看清要做什么，再看要花多少。
//
// 免费的部分必须显性标注：用户不会自己发现「哦这个没扣分」，而免费
// 恰恰是信任层最能被感知的部分（交互方案 1.2）。
// =============================================================

import { CreditGlyph } from "./CreditGlyph";

/** 按钮里的分值。放在 Button 的 children 末尾。 */
export function CreditCost({ credits }: { credits: number }) {
  return (
    <span
      className="ml-1 inline-flex items-center gap-[3px] font-display text-[12px]"
      style={{ opacity: 0.72 }}
    >
      <CreditGlyph size={9} />
      {credits}
    </span>
  );
}

/** 绿色「免费」小标签。永久免费的动作用它。 */
export function FreeTag({ children = "免费" }: { children?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-[2px] text-[11px] font-semibold"
      style={{ background: "var(--proof-soft)", color: "#0A8A63" }}
    >
      {children}
    </span>
  );
}

/** 灰色额度标签。限次免费用它，写「还剩」不写「已用」。 */
export function QuotaTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-[3px] text-[11.5px] font-medium"
      style={{ background: "var(--line-soft)", color: "var(--slate)" }}
    >
      {children}
    </span>
  );
}
