"use client";

// =============================================================
// Proofly · 付款弹窗（交互方案「付款流程」）
//
// 本期不接在线支付。加微信付款后人工发码 —— 早期阶段这不是权宜之计，
// 它让你和每个付费用户建立直接联系。
//
// 但人工履约对可靠性的要求反而更高，三条都在这张弹窗里：
//   给时间预期 —— 「通常几小时内，最晚不超过 24 小时」比「尽快」有用
//   备注语按包区分 —— 你在微信里一眼看出对方买的是哪档
//   微信号可复制 —— 二维码扫不出来时还有一条路
//
// 二维码用 next/image 必须设 unoptimized：压缩后可能糊到扫不出来。
// =============================================================

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

import { Modal } from "./Modal";

/** 三档共用同一张码与同一个号，只有标题与备注语不同。 */
const WECHAT_ID = "zhangzhaoplus";
const QR_SRC = "/wechat-qr.png";

export function PayDialog({
  pack,
  onClose,
}: {
  pack: { name: string; credits: number; price_cny: number };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrBroken, setQrBroken] = useState(false);

  return (
    <Modal
      title={`${pack.name} · ${pack.credits} 分 · ¥${pack.price_cny}`}
      onClose={onClose}
      footer={
        <>
          <Link
            href="/app/account/redeem"
            className="mr-auto px-2.5 text-[13px]"
            style={{ color: "var(--slate)" }}
          >
            我已经有激活码
          </Link>
          <Button variant="secondary" onClick={onClose}>
            知道了
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
        现在还没接在线支付，加我微信付款，我给你发激活码。
      </p>

      <div className="rounded-btn p-[18px] text-center" style={{ background: "var(--bg)" }}>
        {!qrBroken ? (
          <Image
            src={QR_SRC}
            alt="微信二维码"
            width={170}
            height={170}
            // 二维码不能被优化：压缩后可能糊到扫不出来。这条是实际会踩的坑。
            unoptimized
            className="mx-auto rounded"
            onError={() => setQrBroken(true)}
          />
        ) : (
          <p className="py-6 text-[12.5px]" style={{ color: "var(--mute)" }}>
            二维码还没放上（public/wechat-qr.png）。先用下面的微信号搜索添加。
          </p>
        )}
        <div className="mt-3 text-[12.5px]" style={{ color: "var(--slate)" }}>
          扫码加我，或搜微信号
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <span className="font-display text-[15px] font-semibold tracking-wide">{WECHAT_ID}</span>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11.5px]"
            style={{ border: "1px solid var(--line)", color: "var(--slate)" }}
            onClick={() => {
              void navigator.clipboard?.writeText(WECHAT_ID).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>

      <div
        className="mt-3.5 rounded-btn px-3.5 py-3 text-[12.5px] leading-relaxed"
        style={{ background: "var(--proof-soft)", color: "#0A7355" }}
      >
        加好友时备注 <b className="font-semibold">「Proofly {pack.name}」</b>
        <br />
        付款后我把激活码发你，通常几小时内，最晚不超过 24 小时。
      </div>
    </Modal>
  );
}
