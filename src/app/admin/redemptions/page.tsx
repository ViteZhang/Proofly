// =============================================================
// Proofly · 核销流水（方案 8.1）
//
// 每一分积分的来源。这张表如果和 entitlements 的增量对不上，说明代码
// 里有一条你不知道的写额度路径 —— A5 的孤儿额度检测查的就是这个。
// =============================================================

import Link from "next/link";

import {
  Card,
  Code,
  Empty,
  Filters,
  PageHead,
  TableWrap,
  Td,
  Th,
  date,
  when,
} from "@/components/admin/ui";
import { listRedemptions } from "@/lib/queries/admin";

export default async function RedemptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ purpose?: string; q?: string }>;
}) {
  const { purpose = null, q = null } = await searchParams;
  const rows = await listRedemptions({ purpose, q });

  return (
    <>
      <PageHead
        title="核销流水"
        desc="每一分积分的来源。这张表如果和 entitlements 的增量对不上，说明代码里有一条你不知道的写额度路径。"
      />

      <Filters base="/admin/redemptions" purpose={purpose} q={q} placeholder="搜账号或码" />

      <Card>
        {rows.length === 0 ? (
          <Empty>{q || purpose ? "没有符合条件的核销。" : "还没有人兑换过。"}</Empty>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>时间</Th>
                  <Th>账号</Th>
                  <Th>码</Th>
                  <Th>批次</Th>
                  <Th right>面额</Th>
                  <Th>积分到期</Th>
                  <Th right>当时余额</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>{when(r.redeemed_at).main}</Td>
                    <Td>{r.email}</Td>
                    <Td>
                      <Code>{r.code}</Code>
                    </Td>
                    <Td>
                      <Link href={`/admin/batches/${r.batch_id}`} className="hover:underline">
                        {r.batch_name}
                      </Link>
                    </Td>
                    <Td right>
                      <span className="font-display">+{r.credits}</span>
                    </Td>
                    <Td>{date(r.credit_expires_at, "永久")}</Td>
                    <Td right>
                      {/*
                        冗余的一列，但它让你能在不重放全部流水的情况下，
                        一眼看出某次发放前后对不对得上。只有兑换发生的那
                        一刻才知道这个数，所以是当场记的，不是算出来的。
                      */}
                      <span className="font-display">{r.balance_after ?? "—"}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
