"use client";

// =============================================================
// Proofly · 新建批次（方案 8.2、7.3）
//
// 右侧的成本上限随参数实时变，且**在你点「生成」之前**就出现，不是
// 之后。发码就是发钱，但积分这个单位没有痛感，¥ 有。
//
// 生成成功后的那一屏是唯一能一次看全全部明文码的地方 —— 之后已核销
// 的码打码显示。这不是安全需求（库里本来就是明文），是行为设计。
// =============================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createBatch, type NewBatchInput } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/billing/Modal";
import { CREDIT_COST_CNY } from "@/config/plan";

const PURPOSES: { value: NewBatchInput["purpose"]; label: string }[] = [
  { value: "internal_beta", label: "内测发放" },
  { value: "compensation", label: "补偿" },
  { value: "invite", label: "邀请" },
  { value: "self", label: "自用" },
  { value: "purchase", label: "付款后发码" },
];

/** 超过这个张数要打字确认（方案 8.2 二） */
const TYPE_TO_CONFIRM_OVER = 50;

export function NewBatchForm() {
  const router = useRouter();
  const [busy, start] = useTransition();

  const [name, setName] = useState("内测第二批");
  const [purpose, setPurpose] = useState<NewBatchInput["purpose"]>("internal_beta");
  const [boundEmail, setBoundEmail] = useState("");
  const [reason, setReason] = useState("");
  const [count, setCount] = useState(20);
  const [creditsEach, setCreditsEach] = useState(200);
  const [maxUses, setMaxUses] = useState<string>("1");
  const [expiresOn, setExpiresOn] = useState(defaultExpiry());
  const [validDays, setValidDays] = useState<string>("0");

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ batchId: string; codes: string[] } | null>(null);

  const uses = maxUses === "0" ? null : Number(maxUses);
  const total = count * creditsEach * (uses ?? 1);
  const cost = `≈ ¥${Math.round(total * CREDIT_COST_CNY).toLocaleString("en-US")}`;
  const needTyping = count > TYPE_TO_CONFIRM_OVER;
  const ready = name.trim() !== "" && reason.trim() !== "" && count >= 1 && creditsEach >= 1;

  const preview = useMemo(
    () => [
      ["张数", String(count)],
      ["每张", `${creditsEach} 分`],
      ["可兑次数", uses === null ? "不限次" : `${uses} 次`],
      ["码到期", expiresOn || "不限"],
      ["积分到期", validDays === "0" ? "永久" : `${validDays} 天`],
      ["定向", boundEmail.trim() || "不定向"],
    ],
    [count, creditsEach, uses, expiresOn, validDays, boundEmail],
  );

  function submit() {
    setError(null);
    start(async () => {
      const r = await createBatch({
        name,
        purpose,
        reason,
        creditsEach,
        count,
        maxUses: uses,
        codeExpiresOn: expiresOn || null,
        creditValidDays: validDays === "0" ? null : Number(validDays),
        boundEmail: boundEmail.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      setTyped("");
      setDone(r.data);
    });
  }

  return (
    <div className="grid gap-3.5 lg:grid-cols-[1fr_320px] lg:items-start">
      <div>
        <Card title="基本">
          <Field label="批次名" required>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="用途" required>
              <select
                className={INPUT}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as NewBatchInput["purpose"])}
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="定向邮箱" hint="填了之后只有这个邮箱能兑，转发无效">
              <input
                className={INPUT}
                type="email"
                placeholder="留空则任何人可兑"
                value={boundEmail}
                onChange={(e) => setBoundEmail(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="发放理由"
            required
            hint="不给默认值，也不允许空。这是溯源链最上游的一环"
          >
            <textarea
              className={INPUT}
              rows={2}
              placeholder="三个月后你要靠这段话回答「这批分为什么发」"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Card>

        <Card title="面额与数量" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="张数" required hint="单批上限 200 张">
              <input
                className={INPUT}
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(clamp(Number(e.target.value), 1, 200))}
              />
            </Field>
            <Field label="每张积分" required hint="200 分 = 一个完整求职包">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={creditsEach}
                onChange={(e) => setCreditsEach(clamp(Number(e.target.value), 1, 100000))}
              />
            </Field>
          </div>
          <Field
            label="每张可兑次数"
            hint="同一账号无论如何只能兑一次，这是数据库层面的唯一约束"
          >
            <select className={INPUT} value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
              <option value="1">1 次（一码一人）</option>
              <option value="5">5 次</option>
              <option value="0">不限次</option>
            </select>
          </Field>
        </Card>

        <Card title="两条有效期" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="码有效期" hint="这张码还能不能被兑，留空=不限">
              <input
                className={INPUT}
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </Field>
            <Field label="积分有效期" hint="兑到的分什么时候作废">
              <select
                className={INPUT}
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
              >
                <option value="0">永久</option>
                <option value="30">30 天</option>
                <option value="90">90 天</option>
              </select>
            </Field>
          </div>
          <p
            className="mt-1 rounded-btn px-4 py-3 text-[12.5px] leading-relaxed"
            style={{ background: "var(--ai-soft)", color: "#3C3080" }}
          >
            <b className="mb-1 block text-[11px] tracking-widest opacity-75">为什么是两个字段</b>
            码你希望两周内领完，否则名单就散了；分你希望永久有效，否则和对外承诺的
            「已购积分不会贬值」打架。合成一个字段，这两件事没法同时表达。
          </p>
        </Card>
      </div>

      <div className="lg:sticky lg:top-0">
        <div className="rounded-card p-5" style={{ background: "var(--ink)", color: "#fff" }}>
          <div className="mb-2 text-[10.5px] tracking-[.1em]" style={{ color: "rgba(255,255,255,.4)" }}>
            码格式
          </div>
          <div className="font-display text-[20px] font-semibold tracking-wider">
            PF-7K3M-Q2XR
            <small
              className="mt-1.5 block text-[11.5px] font-normal tracking-normal"
              style={{ color: "rgba(255,255,255,.42)", fontFamily: "var(--font-ui)" }}
            >
              31 位字母表，剔除 0 O 1 I L；码面不含批次与面额
            </small>
          </div>
          <hr className="my-4" style={{ borderColor: "rgba(255,255,255,.12)" }} />
          {preview.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-1 text-[12.5px]">
              <span style={{ color: "rgba(255,255,255,.5)" }}>{k}</span>
              <span className="font-display font-medium">{v}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-3.5 rounded-card px-[17px] py-4"
          style={{ background: "var(--warn-soft)", border: "1px solid #f0dcb4" }}
        >
          <div
            className="mb-2 text-[11.5px] font-semibold tracking-wide"
            style={{ color: "var(--caution)" }}
          >
            本批次成本上限
          </div>
          <div
            className="font-display text-[23px] font-semibold tracking-tight"
            style={{ color: "var(--caution)" }}
          >
            {total.toLocaleString("en-US")}
            <span className="ml-1 text-[13px] font-medium">积分{uses === null && "起"}</span>
          </div>
          <div
            className="font-display text-[19px] font-semibold"
            style={{ color: "var(--caution)" }}
          >
            {cost}
            {uses === null && " 起"}
          </div>
          <p
            className="mt-[7px] text-[11.5px] leading-relaxed"
            style={{ color: "var(--caution)", opacity: 0.8 }}
          >
            按篮子实测均值 1 分 ≈ ¥{CREDIT_COST_CNY} 折算，为估算值。全部兑完且全部用尽时的模型成本上限。
          </p>
        </div>

        {error && (
          <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <Button
          className="mt-3 h-[46px] w-full text-[15px]"
          disabled={!ready || busy}
          onClick={() => setConfirming(true)}
        >
          生成 {count} 张码
        </Button>
        <p className="mt-2 text-center text-[11.5px]" style={{ color: "var(--mute)" }}>
          超过 {TYPE_TO_CONFIRM_OVER} 张需要打字确认
        </p>
      </div>

      {confirming && (
        <Modal
          title="确认生成"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                取消
              </Button>
              <Button
                onClick={submit}
                disabled={busy || (needTyping && typed.trim() !== name.trim())}
              >
                {busy ? "生成中…" : "确认生成"}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
            生成后码即刻生效。<b>明文码只在下一屏完整展示这一次</b>，之后已核销的码将打码显示。
          </p>
          <div
            className="rounded-btn px-4 py-3.5"
            style={{ background: "var(--warn-soft)", border: "1px solid #f0dcb4" }}
          >
            <div
              className="mb-1.5 text-[11.5px] font-semibold"
              style={{ color: "var(--caution)" }}
            >
              你将发出
            </div>
            <div
              className="font-display text-[21px] font-semibold"
              style={{ color: "var(--caution)" }}
            >
              {total.toLocaleString("en-US")} <span className="text-[13px]">积分</span> · {count}{" "}
              <span className="text-[13px]">张</span>
            </div>
            <p
              className="mt-1.5 text-[11.5px] leading-relaxed"
              style={{ color: "var(--caution)", opacity: 0.85 }}
            >
              折算模型成本上限约 <b>{cost}</b>。这个数字挡住的是「手滑发了 500 张 500 分」。
            </p>
          </div>
          {needTyping && (
            <div className="mt-3.5">
              <label className="mb-1.5 block text-[11.5px]" style={{ color: "var(--slate)" }}>
                超过 {TYPE_TO_CONFIRM_OVER} 张。输入批次名以确认
              </label>
              <input
                className={INPUT}
                placeholder={name}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          )}
        </Modal>
      )}

      {done && (
        <Modal
          title={`已生成 ${done.codes.length} 张`}
          wide
          onClose={() => router.push(`/admin/batches/${done.batchId}`)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(done.codes.join("\n"))}
              >
                复制全部
              </Button>
              <Button variant="secondary" onClick={() => downloadCsv(name, done.codes, creditsEach)}>
                导出 CSV
              </Button>
              <Button onClick={() => router.push(`/admin/batches/${done.batchId}`)}>
                我已存好，关闭
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
            批次 <b>{name}</b> · 每张 {creditsEach} 分 · {expiresOn || "不限期"}。
            <b>这是唯一一次完整展示。</b>
          </p>
          <div
            className="grid max-h-[210px] gap-1.5 overflow-y-auto rounded-btn p-3.5"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--line)",
              gridTemplateColumns: "repeat(auto-fill,minmax(126px,1fr))",
            }}
          >
            {done.codes.map((c) => (
              <span
                key={c}
                className="rounded-md px-2 py-1.5 text-center font-display text-[12.5px] tracking-wide"
                style={{ background: "var(--card)", border: "1px solid var(--line)" }}
              >
                {c}
              </span>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-btn px-3.5 py-2.5 outline-none border border-[var(--line)] bg-[var(--card)] focus:border-[var(--ink)]";

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : lo;
}

function defaultExpiry(): string {
  // 内测批次默认 30 天（方案第 4 章的默认值建议）
  const d = new Date(Date.now() + 30 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(batch: string, codes: string[], credits: number) {
  const rows = [["code", "credits", "batch"], ...codes.map((c) => [c, String(credits), batch])];
  // ﻿：Excel 不认无 BOM 的 UTF-8，中文批次名会变乱码
  const csv = "﻿" + rows.map((r) => r.map((x) => `"${x.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${batch}-${codes.length}张.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card p-5 ${className}`}
      style={{ background: "var(--card)", boxShadow: "var(--shadow-1)" }}
    >
      <h3 className="mb-3.5 text-[15px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: "var(--slate)" }}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--mute)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
