// =============================================================
// Proofly · 账户与积分（交互方案 4.1）
//
// 这一页的职责是**透明**：用户能看清自己花了什么、还剩什么。
// C3 出错是信任问题 —— 看不懂余额去哪了，比功能坏掉更难挽回。
// =============================================================

import Link from "next/link";

import { CreditGlyph } from "@/components/billing/CreditGlyph";
import { LedgerTable } from "@/components/billing/LedgerTable";
import { getBalance, getEntitlements, listLedger } from "@/lib/queries/billing";

export const metadata = { title: "账户与积分 · Proofly" };

function monthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getMonth() + 1} 月 ${last.getDate()} 日`;
}

export default async function AccountPage() {
  const [balance, ent, ledger] = await Promise.all([
    getBalance(),
    getEntitlements(),
    listLedger({ limit: 30 }),
  ]);

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">账户与积分</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        余额构成 · 本月免费额度 · 消费记录
      </p>

      {/* ---- 区块一 · 余额 ---- */}
      <section className="mt-6 rounded-card p-5" style={{ background: "var(--card)" }}>
        <h2 className="mb-2.5 text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
          余额
        </h2>
        <div className="mb-4 flex items-center gap-2.5">
          <CreditGlyph size={15} />
          <span className="font-display text-[34px] font-semibold tracking-tight">
            {balance.available}
          </span>
          <span style={{ color: "var(--mute)" }}>分</span>
          {balance.held > 0 && (
            <span className="ml-2 text-[12.5px]" style={{ color: "var(--mute)" }}>
              另有 {balance.held} 分预扣中
            </span>
          )}
        </div>

        <Line label="购买的" value={ent.purchased} note="永不过期" />
        <Line
          label="赠送的"
          value={ent.granted}
          note={
            ent.grantExpiresAt
              ? `${new Date(ent.grantExpiresAt).toLocaleDateString("zh-CN")} 到期`
              : "—"
          }
          warn={Boolean(ent.grantExpiresAt)}
        />

        {/* 扣减顺序是 C1 已实现的行为，用户需要知道，否则会觉得乱扣 */}
        <p className="mt-2.5 text-[12px]" style={{ color: "var(--mute)" }}>
          用的时候会先扣快过期的。
        </p>

        <div className="mt-3.5 flex gap-2">
          <Link
            href="/app/account/credits"
            className="inline-flex h-9 items-center rounded-btn px-4 text-[13.5px] font-medium"
            style={{ background: "var(--ink)", color: "#fff" }}
          >
            充值
          </Link>
          <Link
            href="/app/account/redeem"
            className="inline-flex h-9 items-center rounded-btn px-4 text-[13.5px]"
            style={{ border: "1px solid var(--line)" }}
          >
            兑换码
          </Link>
        </div>
      </section>

      {/* ---- 区块二 · 本月免费额度 ---- */}
      <section className="mt-3 rounded-card p-5" style={{ background: "var(--card)" }}>
        <h2 className="mb-3 text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
          本月免费额度
        </h2>
        <Line
          label="对话式维护"
          valueText={`还剩 ${balance.freeChatLeft} / ${balance.freeChatLimit}`}
          note={`${monthEnd()}重置`}
        />
        <div
          className="mt-3.5 rounded-btn px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ background: "var(--proof-soft)", color: "#0A7355" }}
        >
          <b className="font-semibold">永久免费的功能</b>
          <br />
          一致性体检 · 简历评分 · 证据等级推导 · 行动排序 · 数据导出
          <br />
          这些都是代码算的，不烧模型，永远不收费。
        </div>
      </section>

      {/* ---- 区块三 · 消费记录 ---- */}
      <section className="mt-3 rounded-card p-5" style={{ background: "var(--card)" }}>
        <h2 className="mb-3 text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
          消费记录
        </h2>
        <LedgerTable initial={ledger} />
      </section>
    </div>
  );
}

function Line({
  label,
  value,
  valueText,
  note,
  warn,
}: {
  label: string;
  value?: number;
  valueText?: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <div
      className="flex justify-between py-1.5 text-[13px]"
      style={{ borderBottom: "1px solid var(--line-soft)" }}
    >
      <span>{label}</span>
      <span>
        <b className="font-display">{valueText ?? value}</b>
        {valueText ? " 次" : " 分"} ·{" "}
        <span
          style={{ color: warn ? "var(--caution, #8A5A00)" : "var(--mute)", fontSize: "12px" }}
        >
          {note}
        </span>
      </span>
    </div>
  );
}
