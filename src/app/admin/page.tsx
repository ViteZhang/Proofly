// =============================================================
// Proofly · 后台概览（方案 8.3）
//
// 四项数字，只留会让你产生动作的那些。「累计发码量」不在这里 ——
// 它只会涨，看了也不做什么。
//
// 「待处理异常」这一格在 A5 补。检测还没上线就先摆一个「0 条」出来，
// 是最坏的一种假象：你会以为它在跑。
// =============================================================

import Link from "next/link";

import {
  Card,
  Code,
  Empty,
  PageHead,
  Stat,
  TableWrap,
  Td,
  Th,
  when,
} from "@/components/admin/ui";
import { getAnomalies, getOverview, toCny } from "@/lib/queries/admin";

export default async function AdminOverviewPage() {
  const [o, a] = await Promise.all([getOverview(), getAnomalies()]);

  return (
    <>
      <PageHead
        title="概览"
        desc="四个数字，只留会让你产生动作的那些。「累计发码量」不在这里——它只会涨，看了也不做什么。"
      />

      <div className="mb-3.5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          value={o.codes_outstanding}
          label="在外流通的码"
          note="还没被兑换、也没过期停用"
        />
        <Stat
          value={o.redeemed_count}
          label="已核销"
          note={`来自 ${o.redeemed_users} 个账号`}
        />
        <Stat
          value={o.credits_issued.toLocaleString("en-US")}
          unit="分"
          label="已发放积分"
          // 发码就是发钱，但积分这个单位没有痛感，¥ 有。
          note={`折算模型成本约 ${toCny(o.credits_issued)}（估算）`}
        />
        {/* 唯一需要你动作的那个数字 */}
        <Link href="/admin/anomalies">
          <Stat
            amber={a.total > 0}
            value={a.total}
            label="待处理异常"
            note={a.total > 0 ? "需人工判断，四项判定只报不动作" : "四项判定都为零"}
          />
        </Link>
      </div>

      <Card
        title="最近核销"
        sub="近 7 天"
        right={
          <Link
            href="/admin/redemptions"
            className="rounded-btn px-2.5 py-1 text-[12.5px]"
            style={{ color: "var(--slate)" }}
          >
            看全部
          </Link>
        }
      >
        {o.recent.length === 0 ? (
          <Empty>近 7 天没有核销。</Empty>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["时间", "账号", "码", "批次"].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                  <Th right>面额</Th>
                </tr>
              </thead>
              <tbody>
                {o.recent.map((r) => {
                  const t = when(r.redeemed_at);
                  return (
                    <tr key={r.id}>
                      <Td>
                        {t.main}
                        {t.sub && <div className="text-[11.5px] text-[var(--mute)]">{t.sub}</div>}
                      </Td>
                      <Td>{r.email}</Td>
                      <Td>
                        <Code>{r.code}</Code>
                      </Td>
                      <Td>
                        <Link href={`/admin/batches/${r.batch_id}`} className="underline-offset-2 hover:underline">
                          {r.batch_name}
                        </Link>
                      </Td>
                      <Td right>
                        <span className="font-display">{r.credits}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
