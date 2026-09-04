"use client";

// =============================================================
// Proofly · 解析前的预估明细（交互方案 2.2）
//
// 「预计」二字必须有，因为实际段数要抽完才知道。
// 「超过预估的部分不收费」这句必须写在界面上 —— 代码里实现了还不够：
// 预估偏差是我们的问题，而用户只有看见这句话才敢点确认。
// =============================================================

import { Modal } from "@/components/billing/Modal";
import { Button } from "@/components/ui/Button";
import type { UploadSummary } from "@/app/app/import/actions";

export function ParseQuoteDialog({
  summary,
  onCancel,
  onConfirm,
  pending,
}: {
  summary: UploadSummary;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { quote, balance } = summary;
  const after = Math.max(balance - quote.total, 0);

  const facts = [
    summary.pages !== null ? `${summary.pages} 页` : null,
    summary.kind,
    `预计 ${quote.segments} 段经历`,
  ].filter(Boolean);

  return (
    <Modal
      title="准备解析"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "正在开始…" : "开始解析"}
          </Button>
        </>
      }
    >
      <p className="mb-0.5 text-[13px]" style={{ color: "var(--slate)" }}>
        {summary.filename}
      </p>
      <p className="text-[12.5px]" style={{ color: "var(--mute)" }}>
        {facts.join(" · ")}
      </p>

      <div className="my-3.5 rounded-btn px-[15px] py-[13px]" style={{ background: "var(--bg)" }}>
        {quote.lines.map((l) => (
          <div key={l.label} className="flex justify-between py-[3px] text-[13px]">
            <span>{l.label}</span>
            <span className="font-display">{l.credits}</span>
          </div>
        ))}
        <div
          className="mt-1.5 flex justify-between pt-2 text-[13px] font-semibold"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <span>预计消耗</span>
          <span className="font-display">{quote.total} 分</span>
        </div>
        <div className="mt-[3px] text-right text-[12px]" style={{ color: "var(--mute)" }}>
          余额 <b className="font-display">{balance}</b> → <b className="font-display">{after}</b>
        </div>
      </div>

      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--mute)" }}>
        实际段数要抽完才知道。
        <b className="font-semibold" style={{ color: "var(--proof)" }}>
          超过预估的部分不收费。
        </b>
      </p>
    </Modal>
  );
}
