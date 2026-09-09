"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { saveEmployment, type EmploymentInput } from "@/app/app/profile/actions";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/profile/labels";
import type { EmploymentType } from "@/types/database";
import type { Employment } from "@/lib/queries/profile";
import { Drawer, Field, inputClass, inputStyle } from "./Drawer";

const TYPES: EmploymentType[] = ["fulltime", "intern", "contract", "freelance"];

function toMonth(d: string | null): string {
  return d ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : "";
}

export function EmploymentDrawer({
  item,
  onClose,
}: {
  item: Employment | null | undefined;
  onClose: () => void;
}) {
  const open = item !== undefined;
  const [org, setOrg] = useState(item?.org ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [city, setCity] = useState(item?.city ?? "");
  const [type, setType] = useState<EmploymentType>(item?.employmentType ?? "fulltime");
  const [start, setStart] = useState(toMonth(item?.periodStart ?? null));
  const [end, setEnd] = useState(toMonth(item?.periodEnd ?? null));
  const [note, setNote] = useState(item?.entityNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();

  function submit() {
    setError(null);
    const input: EmploymentInput = {
      org,
      title,
      city,
      employment_type: type,
      period_start: start,
      period_end: end,
      entity_note: note,
    };
    run(async () => {
      const res = await saveEmployment(item?.id ?? null, input);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <Drawer
      open={open}
      title={item ? "编辑工作履历" : "新增工作履历"}
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
            简历的工作段落按这里的起止时间印
          </span>
        </>
      }
    >
      <Field label="公司">
        <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="润泽园教育科技" className={inputClass} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="职位">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="高级产品经理" className={inputClass} style={inputStyle} />
        </Field>
        <Field label="城市">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="北京" className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="入职">
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="2023.04" className={inputClass} style={inputStyle} />
        </Field>
        <Field label="离职" hint="留空表示至今">
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="2025.03" className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <Field label="用工形式">
        <select value={type} onChange={(e) => setType(e.target.value as EmploymentType)} className={inputClass} style={inputStyle}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="对外披露口径 · 选填"
        hint="公司主体与对外品牌不一致时，简历上写哪个、被追问时怎么说。它是规则，不会被原样印出去。"
      >
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} style={inputStyle} />
      </Field>

      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </Drawer>
  );
}
