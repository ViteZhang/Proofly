// =============================================================
// Proofly · 批次详情（方案 8.1）
//
// 已核销的码打码显示。这不是安全措施（库里本来就是明文），是行为设计
// —— 生成那一屏是唯一能一次看全所有明文码的地方，逼你当场把码存到该
// 存的地方，而不是养成「随时回来抄」的习惯。
// =============================================================

import { notFound } from "next/navigation";

import {
  Card,
  Code,
  Empty,
  PageHead,
  Tag,
  TableWrap,
  Td,
  Th,
  date,
  when,
} from "@/components/admin/ui";
import {
  DISPLAY_LABEL,
  getBatch,
  PURPOSE_LABEL,
  toCny,
  type CodeDisplay,
} from "@/lib/queries/admin";

const TONE: Record<CodeDisplay, "ok" | "used" | "exp" | "off" | "rev"> = {
  available: "ok",
  used_up: "used",
  expired: "exp",
  disabled: "off",
  revoked: "rev",
};

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getBatch(id);
  if (!detail) notFound();

  const { batch: b, codes } = detail;
  const stat = (d: CodeDisplay) => codes.filter((c) => c.display === d).length;

  return (
    <>
      <PageHead
        title={b.name}
        back={{ href: "/admin/batches", label: "批次" }}
        desc={`${PURPOSE_LABEL[b.purpose] ?? b.purpose} · ${b.codes} 张 × ${b.credits_each} 分 · ${date(b.created_at)} 创建 · ${b.creator}`}
      />

      {b.revoked_at && (
        <div
          className="mb-3 rounded-card px-4 py-3 text-[13px] leading-relaxed"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          <b>这一批已于 {date(b.revoked_at)} 作废。</b>
          {b.revoke_reason && <> 理由：{b.revoke_reason}</>}
          <br />
          已核销的积分不受影响，也不会被追回。
        </div>
      )}

      <div className="mb-3 grid gap-3 md:grid-cols-2">
        <Card>
          <Label>发放理由</Label>
          <p className="text-[13.5px] leading-relaxed">{b.reason}</p>
          <div className="mt-3.5">
            <Label>成本敞口</Label>
            <p className="text-[13px]" style={{ color: "var(--slate)" }}>
              全部兑完且用尽时最多{" "}
              <span className="font-display font-medium" style={{ color: "var(--ink)" }}>
                {(b.credits_each * b.codes * (b.max_uses_each ?? 1)).toLocaleString("en-US")} 分
              </span>
              ，折算模型成本约{" "}
              {toCny(b.credits_each * b.codes * (b.max_uses_each ?? 1))}（估算）。
            </p>
          </div>
        </Card>

        <Card>
          <Label>两条有效期</Label>
          <Row k="码有效期" v={date(b.code_expires_at)} />
          <Row k="积分有效期" v={b.credit_valid_days ? `${b.credit_valid_days} 天` : "永久"} />
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--mute)" }}>
            码要在到期前领完，领到的分按积分有效期算。这是两件事。
          </p>
          <div className="mt-3.5">
            <Label>其他</Label>
            <Row k="每张可兑次数" v={b.max_uses_each ? `${b.max_uses_each} 次` : "不限次"} />
            <Row k="定向邮箱" v={b.bound_email ?? "不定向"} />
          </div>
        </Card>
      </div>

      <Card
        title="码"
        sub={`${b.codes} 张 · 可用 ${stat("available")} · 已用完 ${stat("used_up")} · 停用 ${stat("disabled")}`}
      >
        {codes.length === 0 ? (
          <Empty>这一批还没有码。</Empty>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>码</Th>
                  <Th>状态</Th>
                  <Th>核销账号</Th>
                  <Th>核销时间</Th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const done = (c.redemptions?.length ?? 0) > 0;
                  return (
                    <tr key={c.id}>
                      <Td top>
                        {/* 已核销的打码：让「回来抄一遍」这件事不顺手 */}
                        <Code dim={done}>
                          {done ? `${c.code.slice(0, 8)}••••` : c.code}
                        </Code>
                      </Td>
                      <Td top>
                        <Tag tone={TONE[c.display]}>{DISPLAY_LABEL[c.display]}</Tag>
                        {c.status_reason && (
                          <div className="mt-1 text-[11.5px]" style={{ color: "var(--mute)" }}>
                            {c.status_reason}
                          </div>
                        )}
                        {c.max_uses !== null && c.max_uses > 1 && (
                          <div className="mt-1 text-[11.5px]" style={{ color: "var(--mute)" }}>
                            {c.used_count}/{c.max_uses} 次
                          </div>
                        )}
                      </Td>
                      <Td top>
                        {done
                          ? c.redemptions!.map((r, i) => <div key={i}>{r.email}</div>)
                          : "—"}
                      </Td>
                      <Td top>
                        {done
                          ? c.redemptions!.map((r, i) => <div key={i}>{when(r.at).main}</div>)
                          : "—"}
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 text-[11px] tracking-[.06em]"
      style={{ color: "var(--mute)" }}
    >
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-[3px] text-[12.5px]">
      <span style={{ color: "var(--slate)" }}>{k}</span>
      <span className="font-display font-medium">{v}</span>
    </div>
  );
}
