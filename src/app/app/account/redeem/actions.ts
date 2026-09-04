"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/billing/action";
import { normalizeCode } from "@/lib/redeem/code";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * 兑换码的错误话术（方案 5.2）。
 *
 * UNUSABLE 一句话盖住三种情况：码不存在、被停用、被作废。攻击者拿它
 * 分不出「猜错了」和「猜对了但被停了」。其余四种是持有者可以自证的
 * 状态，含糊其辞只会让正常用户卡住。
 */
const MESSAGE: Record<string, string> = {
  UNUSABLE: "这张码用不了",
  EXPIRED: "这张码过期了",
  USED_UP: "这张码的名额用完了",
  ALREADY_USED_BY_ME: "这张码你已经用过了，积分在余额里",
  EMAIL_MISMATCH: "这张码不是发给这个邮箱的",
  // 限流（方案 7.2）。说清是「多久之后」，不然人只会一直敲。
  RATE_LOCKED: "错的次数太多了，一小时后再试",
  RATE_DAILY: "今天兑换的次数够多了，明天再来",
};

/**
 * 兑换来源 IP 的哈希，只用于 A5 异常看板里的「兑换失败集中」判定。
 *
 * 不存明文。盐从 REDEEM_IP_SALT 取；没配的话退回常量盐 —— 那时它挡住
 * 的只是「翻库的人顺手看到用户 IP」，挡不住有心人的彩虹表（IPv4 空间
 * 只有 43 亿）。要真的挡住，配一个随机盐。
 */
async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for") ?? h.get("x-real-ip");
  const ip = fwd?.split(",")[0]?.trim();
  if (!ip) return null;
  const salt = process.env.REDEEM_IP_SALT ?? "proofly-redeem";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export type RedeemOk = {
  credits: number;
  balanceAfter: number;
  /** 这批分什么时候作废。null = 永久 */
  expiresAt: string | null;
};

export async function redeem(code: string): Promise<ActionResult<RedeemOk>> {
  const userId = await currentUserId();
  if (!userId) return fail("登录状态过期了，刷新一下页面");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_code", {
    p_user: userId,
    // 用户会小写打、会漏连字符、会连着空格一起复制。前端归一化。
    p_code: normalizeCode(code),
    p_ip_hash: await clientIpHash(),
  });
  if (error) return fail("兑换没成功，再试一次");

  const v = data as {
    ok: boolean;
    reason?: string;
    credits?: number;
    balance_after?: number;
    expires_at?: string | null;
  };
  if (!v.ok) return fail(MESSAGE[v.reason ?? ""] ?? "这张码用不了");

  revalidatePath("/app/account");
  revalidatePath("/", "layout");
  return ok({
    credits: v.credits ?? 0,
    balanceAfter: v.balance_after ?? 0,
    expiresAt: v.expires_at ?? null,
  });
}
