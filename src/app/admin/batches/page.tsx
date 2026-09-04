// =============================================================
// Proofly · 批次列表（方案 8.1）
//
// 一个批次是一次发放决策。码只是它的实例，所以「为什么发」记在批次
// 上，且必填。
// =============================================================

import Link from "next/link";

import {
  Card,
  Empty,
  Filters,
  PageHead,
  Tag,
  TableWrap,
  Td,
  Th,
  date,
  daysLeft,
} from "@/components/admin/ui";
import { listBatches, PURPOSE_LABEL } from "@/lib/queries/admin";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ purpose?: string; q?: string }>;
}) {
  const { purpose = null, q = null } = await searchParams;
  const rows = await listBatches({ purpose, q });

  return (
    <>
      <PageHead
        title="批次"
        desc="一个批次是一次发放决策。码只是它的实例，所以「为什么发」记在批次上，且必填。"
      />

      <Filters base="/admin/batches" purpose={purpose} q={q} placeholder="搜批次名或码" />

      <Card>
        {rows.length === 0 ? (
          <Empty>{q || purpose ? "没有符合条件的批次。" : "还没有发过码。"}</Empty>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>批次</Th>
                  <Th>用途</Th>
                  <Th right>面额</Th>
                  <Th right>张数</Th>
                  <Th right>已核销</Th>
                  <Th>码有效期</Th>
                  <Th>积分有效期</Th>
                  <Th>状态</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const left = daysLeft(b.code_expires_at);
                  return (
                    <tr key={b.id} className="group">
                      <Td top>
                        <Link href={`/admin/batches/${b.id}`} className="font-semibold hover:underline">
                          {b.name}
                        </Link>
                        <div className="text-[11.5px]" style={{ color: "var(--mute)" }}>
                          {date(b.created_at)} 创建
                        </div>
                      </Td>
                      <Td>{PURPOSE_LABEL[b.purpose] ?? b.purpose}</Td>
                      <Td right>
                        <span className="font-display">{b.credits_each}</span>
                      </Td>
                      <Td right>
                        <span className="font-display">{b.codes}</span>
                      </Td>
                      <Td right>
                        <span className="font-display">{b.redeemed}</span>
                      </Td>
                      <Td>
                        {date(b.code_expires_at)}
                        {left !== null && left >= 0 && (
                          <div className="text-[11.5px]" style={{ color: "var(--mute)" }}>
                            还剩 {left} 天
                          </div>
                        )}
                      </Td>
                      <Td>{b.credit_valid_days ? `${b.credit_valid_days} 天` : "永久"}</Td>
                      <Td>
                        {b.revoked_at ? (
                          <Tag tone="rev">已作废</Tag>
                        ) : b.bound_email ? (
                          <Tag tone="ai">定向</Tag>
                        ) : b.available > 0 ? (
                          <Tag tone="ok">可用 {b.available}/{b.codes}</Tag>
                        ) : (
                          <Tag tone="used">已发完</Tag>
                        )}
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
