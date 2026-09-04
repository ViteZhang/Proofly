// =============================================================
// Proofly · 兑换码的格式（方案 5.3）
//
//   PF-7K3M-Q2XR
//
// 字母表剔除 0 O 1 I L —— 手抄与念给人听最容易错的五个。剩 31 个，
// 不是方案里写的 32（36 个字母数字减 5 就是 31，那处算错了一位）。
// 随机 8 位，空间 31⁸ ≈ 8.5×10¹¹。配合 A5 的失败限流，枚举不成立。
//
// **码面不含批次、用途、面额。** 做成 BETA-200-XXXX 是很自然的念头，
// 但码是要发给外人的 —— 码面带前缀等于告诉对方你发了几批、每批多少
// 钱、面额多少。批次信息在库里查就行。
// =============================================================

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_PREFIX = "PF";

/**
 * 随机 8 位码体（不含前缀与连字符）。
 *
 * 拒绝采样，不是直接取模。31 不整除 256，`byte % 31` 会让前 6 个字符
 * 比后 25 个多出 ⅛ 的出现概率 —— 单看无害，但这是凭证的随机源，
 * 「差不多均匀」和「均匀」在这种地方不该混为一谈。丢掉 ≥248 的字节，
 * 248 = 31×8 正好整除。
 */
export function randomCode(len = 8): string {
  const n = CODE_ALPHABET.length;
  const limit = Math.floor(256 / n) * n;
  let out = "";
  while (out.length < len) {
    const bytes = new Uint8Array(len - out.length + 8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue;
      out += CODE_ALPHABET[b % n];
      if (out.length === len) break;
    }
  }
  return out;
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
  // 靠长度判断有没有前缀，不靠 startsWith("PF")：字母表里有 P 也有 F，
  // 码体本身就可能以 PF 开头。带前缀是 10 位，不带是 8 位。
  const body = raw.length === 10 && raw.startsWith(CODE_PREFIX)
    ? raw.slice(CODE_PREFIX.length)
    : raw;
  if (body.length !== 8) return raw === "" ? "" : `${CODE_PREFIX}-${body}`;
  return formatCode(body);
}
