// =============================================================
// Proofly · 头像预设色
//
// Phase 1 只做「预设底色 + 姓名首字」，不做上传。头像不影响任何核心链路，
// 而上传要处理裁剪、压缩、存储、CDN 与内容审核 —— 成本与价值严重不匹配。
// 表里的 avatar_kind 留了 upload 这一档，本期不实现。
//
// 存的是 key 不是渐变串：色值哪天要调，改这里一处，所有存量头像跟着变；
// 存渐变串的话，每个用户身上都冻着一份改不动的旧配色。
// =============================================================

export const AVATAR_COLORS = [
  { key: "proof", css: "linear-gradient(135deg, #0FC08A, #0AA8A0)" },
  { key: "violet", css: "linear-gradient(135deg, #6B5BFF, #9B5BFF)" },
  { key: "amber", css: "linear-gradient(135deg, #FF9500, #FF6B00)" },
  { key: "rose", css: "linear-gradient(135deg, #FF4A4A, #FF7A7A)" },
  { key: "ink", css: "linear-gradient(135deg, #0C0E14, #3A3F52)" },
  { key: "sky", css: "linear-gradient(135deg, #2B8BFF, #00C2FF)" },
  { key: "pink", css: "linear-gradient(135deg, #E85D9E, #FF8FC7)" },
  { key: "slate", css: "linear-gradient(135deg, #5B6273, #8A91A3)" },
] as const;

export type AvatarColorKey = (typeof AVATAR_COLORS)[number]["key"];

export const DEFAULT_AVATAR = AVATAR_COLORS[0];

export function avatarCss(key: string | null | undefined): string {
  return AVATAR_COLORS.find((c) => c.key === key)?.css ?? DEFAULT_AVATAR.css;
}

export function isAvatarColor(k: string): k is AvatarColorKey {
  return AVATAR_COLORS.some((c) => c.key === k);
}
