// =============================================================
// Proofly · 兑换码的格式（方案 5.3）
//
//   PF-7K3M-Q2XR
//
// 字母表 32 位，剔除 0 O 1 I L —— 手抄与念给人听最容易错的五个。
// 随机 8 位，空间 32⁸ ≈ 1.1×10¹²。配合 A5 的失败限流，枚举不成立。
//
// **码面不含批次、用途、面额。** 做成 BETA-200-XXXX 是很自然的念头，
// 但码是要发给外人的 —— 码面带前缀等于告诉对方你发了几批、每批多少
// 钱、面额多少。批次信息在库里查就行。
// =============================================================

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_PREFIX = "PF";

/** 随机 8 位码体（不含前缀与连字符） */
export function randomCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  // 32 个字符、256 个字节值：256 % 32 === 0，取模不引入偏置。
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** 码体 → 展示与存储的规范形式 PF-XXXX-XXXX */
export function formatCode(body: string): string {
  const b = body.toUpperCase();
  return `${CODE_PREFIX}-${b.slice(0, 4)}-${b.slice(4)}`;
}

/**
 * 用户输入 → 规范形式。
 *
 * 用户会小写打、会漏连字符、会从聊天记录里连着空格一起复制。这些都该
 * 兑得动 —— 让人重打一遍码，是把系统的宽容度当成用户的义务。
 */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith(CODE_PREFIX) ? raw.slice(CODE_PREFIX.length) : raw;
  if (body.length !== 8) return raw === "" ? "" : `${CODE_PREFIX}-${body}`;
  return formatCode(body);
}
