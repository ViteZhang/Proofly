// =============================================================
// Proofly · 异常（方案 8.4）
//
// 四项判定，全部只报不动作。
//
// 为零的那几项也照样列出来，不折叠、不隐藏 —— 异常看板最常见的失败
// 模式是「平时空白 → 你不知道它还在跑 → 真出事时你以为又是空的」。
// 把判定规则和当前值一起摆着，这块地方才可信。
//
// 没有「标记已处理」。四项全是当下算出来的条件，不是待办：失败集中
// 一小时后自己过期，其余三项修好就归零。给它加一个 ack 状态，唯一的
// 效果是把一个还成立的条件藏起来。
// =============================================================

import Link from "next/link";

import { Card, PageHead, date, when } from "@/components/admin/ui";
import { getAnomalies } from "@/lib/queries/admin";

export default async function AnomaliesPage() {
  const a = await getAnomalies();

  return (
    <>
      <PageHead
        title="异常"
        desc="四项判定，全部只报不动作。自动封禁在内测阶段的误伤成本远高于收益——内测用户可能同办公室、同 VPN 出口。"
      />

      <Card>
        <Item
          level={a.fail_burst.length > 0 ? "hi" : "ok"}
          title="兑换失败集中"
          count={a.fail_burst.length}
          rule="单账号或 IP 1 小时内失败 ≥5 次 · 待你判断是手误还是枚举"
          zero="最近一小时没有账号或 IP 连续兑换失败。"
        >
          {a.fail_burst.map((f, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              {f.scope === "user" ? "账号" : "IP"} <b>{f.who}</b> 在{" "}
              {when(f.since).main}–{when(f.last_at).main} 内失败 {f.n} 次
              {f.unusable > 0 && <>，其中 {f.unusable} 次是码根本不存在</>}。
              {f.unusable >= 5
                ? " 码全不存在，更像是在猜。"
                : " 多数是存在的码，更像是手误或重复点。"}{" "}
              已触发限流，一小时内不再受理。
            </p>
          ))}
        </Item>

        <Item
          level={a.orphan.length > 0 ? "hi" : "ok"}
          title="孤儿额度"
          count={a.orphan.length}
          rule="entitlements 增量找不到对应核销记录，或存在任何一行 source=adjust · 优先级高于其余三项之和"
          zero="没有找不到核销记录的额度增量，也没有一行手工调整。这一项保持为零，说明「额度只有兑换一个入口」这条约束在代码层面成立。"
        >
          {a.orphan.map((o) => (
            <p key={o.id} className="text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              {date(o.created_at)} · {o.who} · <b>{o.credits_total} 分</b> · source={o.source}
              {o.note && <> · {o.note}</>}
            </p>
          ))}
        </Item>

        <Item
          level={a.expiring.length > 0 ? "md" : "ok"}
          title="批次临期未领完"
          count={a.expiring.length}
          rule="剩余 >30% 且 7 天内到期 · 建议动作是催领或延期"
          zero="没有临期还剩大半的批次。"
        >
          {a.expiring.map((b) => (
            <p key={b.id} className="text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              <Link href={`/admin/batches/${b.id}`} className="font-semibold hover:underline">
                {b.name}
              </Link>{" "}
              剩余 {b.available}/{b.code_count} 张（
              {Math.round((b.available / b.code_count) * 100)}%），{date(b.code_expires_at)} 到期。
            </p>
          ))}
        </Item>

        <Item
          level={a.heavy.length > 0 ? "md" : "ok"}
          title="单账号异常兑换"
          count={a.heavy.length}
          rule="单账号累计兑换 >3 张 · 核对是否为内测账号"
          zero="没有累计兑换超过 3 张的账号。"
        >
          {a.heavy.map((h, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              <b>{h.who}</b> 累计兑换 {h.n} 张，共 {h.credits} 分。
            </p>
          ))}
        </Item>
      </Card>
    </>
  );
}

function Item({
  level,
  title,
  count,
  rule,
  zero,
  children,
}: {
  level: "hi" | "md" | "ok";
  title: string;
  count: number;
  rule: string;
  zero: string;
  children: React.ReactNode;
}) {
  const icon =
    level === "hi"
      ? { background: "var(--danger-soft)", color: "var(--danger)", ch: "!" }
      : level === "md"
        ? { background: "var(--warn-soft)", color: "var(--caution)", ch: "!" }
        : { background: "var(--line-soft)", color: "var(--mute)", ch: "·" };

  return (
    <div
      className="flex gap-3.5 py-4 first:pt-0 last:pb-0"
      style={{ borderBottom: "1px solid var(--line-soft)" }}
    >
      <div
        className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg font-display text-[13px] font-semibold"
        style={{ background: icon.background, color: icon.color }}
      >
        {icon.ch}
      </div>
      <div className="min-w-0 flex-1">
        <h5 className="mb-[3px] text-[13.5px] font-semibold">
          {title}
          <span className="ml-1.5 font-normal" style={{ color: "var(--mute)" }}>
            · {count} 条
          </span>
        </h5>
        {count === 0 ? (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
            {zero}
          </p>
        ) : (
          <div className="space-y-1">{children}</div>
        )}
        <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--mute)" }}>
          判定：{rule}
        </div>
      </div>
    </div>
  );
}
