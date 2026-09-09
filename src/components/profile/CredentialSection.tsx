import { CREDENTIAL_KIND_LABEL, month } from "@/lib/profile/labels";
import type { Credential } from "@/lib/queries/profile";
import { Empty, ItemRow, ProofTag, Section } from "./parts";

/**
 * 证书 / 语言 / 奖项 / 作品，一张表覆盖。
 *
 * 不可查的条目默认不导出到简历 —— 一个写在简历上却拿不出编号的证书，
 * 面试时是负分，不是加分。
 */
export function CredentialSection({
  items,
  action,
  rowActions,
}: {
  items: Credential[];
  action?: React.ReactNode;
  rowActions?: (c: Credential) => React.ReactNode;
}) {
  return (
    <Section
      id="credential"
      title="证书与作品"
      desc="证书、语言等级、作品链接。没有可以整块跳过，不影响完整度。标成「不可查」的默认不导出。"
      action={action}
    >
      {items.length === 0 ? (
        <Empty
          title="还没有证书或作品"
          hint="有证书、语言等级或者作品链接就填，没有也不扣分"
        />
      ) : (
        items.map((c) => (
          <ItemRow
            key={c.id}
            when={CREDENTIAL_KIND_LABEL[c.kind]}
            actions={rowActions?.(c)}
          >
            <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
              <span className="min-w-0 break-all">
                {[c.name, c.level].filter(Boolean).join(" · ")}
              </span>
              <ProofTag level={c.evidenceLevel} note={c.identifier ? "有编号" : c.url ? "可访问" : null} />
            </div>
            <div className="mt-0.5 break-all text-[12.5px]" style={{ color: "var(--slate)" }}>
              {[c.issuer, month(c.issuedAt), c.url].filter(Boolean).join(" · ") ||
                "没填颁发机构和时间"}
            </div>
          </ItemRow>
        ))
      )}
    </Section>
  );
}
