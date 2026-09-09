"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { saveCredential, type CredentialInput } from "@/app/app/profile/actions";
import { CREDENTIAL_KIND_LABEL, CREDENTIAL_KIND_ORDER } from "@/lib/profile/labels";
import type { CredentialKind } from "@/types/database";
import type { Credential } from "@/lib/queries/profile";
import { Drawer, Field, Segmented, inputClass, inputStyle } from "./Drawer";

function toMonth(d: string | null): string {
  return d ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : "";
}

export function CredentialDrawer({
  item,
  onClose,
}: {
  item: Credential | null | undefined;
  onClose: () => void;
}) {
  const open = item !== undefined;
  const [kind, setKind] = useState<CredentialKind>(item?.kind ?? "certificate");
  const [name, setName] = useState(item?.name ?? "");
  const [issuer, setIssuer] = useState(item?.issuer ?? "");
  const [level, setLevel] = useState(item?.level ?? "");
  const [issued, setIssued] = useState(toMonth(item?.issuedAt ?? null));
  const [identifier, setIdentifier] = useState(item?.identifier ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [evidence, setEvidence] = useState<"measured" | "absent">(item?.evidenceLevel ?? "absent");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();

  function submit() {
    setError(null);
    const input: CredentialInput = {
      kind,
      name,
      issuer,
      level,
      issued_at: issued,
      identifier,
      url,
      evidence_level: evidence,
    };
    run(async () => {
      const res = await saveCredential(item?.id ?? null, input);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <Drawer
      open={open}
      title={item ? "编辑证书或作品" : "新增证书或作品"}
      onClose={onClose}
      footer={
        <>
          <Button disabled={pending} onClick={submit}>
            {pending ? "保存中…" : "保存"}
          </Button>
          <Button variant="text" disabled={pending} onClick={onClose}>
            取消
          </Button>
          <span className="ml-auto text-[11.5px]" style={{ color: "var(--mute)" }}>
            标成「不可查」的默认不导出
          </span>
        </>
      }
    >
      <Field label="类型">
        <select value={kind} onChange={(e) => setKind(e.target.value as CredentialKind)} className={inputClass} style={inputStyle}>
          {CREDENTIAL_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {CREDENTIAL_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="名称">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "language" ? "英语" : "PMP"} className={inputClass} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="等级 · 选填">
          <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="CET-6" className={inputClass} style={inputStyle} />
        </Field>
        <Field label="颁发时间 · 选填">
          <input value={issued} onChange={(e) => setIssued(e.target.value)} placeholder="2018.06" className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <Field label="颁发机构 · 选填">
        <input value={issuer} onChange={(e) => setIssuer(e.target.value)} className={inputClass} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="证书编号 · 选填">
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="链接 · 选填">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
        <Field
          label="能被验证吗"
          hint="有编号或可访问的链接才算可查。写在简历上却拿不出编号的证书，面试时是负分。"
        >
          <Segmented
            value={evidence}
            options={[
              { value: "measured", label: "可查" },
              { value: "absent", label: "不可查" },
            ]}
            onChange={setEvidence}
          />
        </Field>
      </div>

      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </Drawer>
  );
}
