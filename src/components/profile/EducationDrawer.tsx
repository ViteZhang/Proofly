"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { saveEducation, type EducationInput } from "@/app/app/profile/actions";
import { DEGREE_LABEL, DEGREE_ORDER } from "@/lib/profile/labels";
import type { Education } from "@/lib/queries/profile";
import { Drawer, Field, Segmented, inputClass, inputStyle } from "./Drawer";

function toMonth(d: string | null): string {
  return d ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : "";
}

export function EducationDrawer({
  item,
  onClose,
}: {
  /** null 表示新增。 */
  item: Education | null | undefined;
  onClose: () => void;
}) {
  const open = item !== undefined;
  const [school, setSchool] = useState(item?.school ?? "");
  const [major, setMajor] = useState(item?.major ?? "");
  const [degree, setDegree] = useState(item?.degree ?? "bachelor");
  const [start, setStart] = useState(toMonth(item?.periodStart ?? null));
  const [end, setEnd] = useState(toMonth(item?.periodEnd ?? null));
  const [fullTime, setFullTime] = useState(item?.isFullTime ?? true);
  const [level, setLevel] = useState<"measured" | "absent">(item?.evidenceLevel ?? "measured");
  const [note, setNote] = useState(item?.credentialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();

  function submit() {
    setError(null);
    const input: EducationInput = {
      school,
      major,
      degree,
      is_full_time: fullTime,
      period_start: start,
      period_end: end,
      // 结束时间留空就是在读，两处说法不能各说各的
      status: end.trim() === "" ? "in_progress" : "graduated",
      evidence_level: level,
      credential_note: level === "measured" ? note || "学信网可查" : null,
    };
    run(async () => {
      const res = await saveEducation(item?.id ?? null, input);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <Drawer
      open={open}
      title={item ? "编辑教育经历" : "新增教育经历"}
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
            保存后立即重算档案完整度
          </span>
        </>
      }
    >
      <Field label="学校">
        <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="大连理工大学" className={inputClass} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="专业">
          <input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="软件工程" className={inputClass} style={inputStyle} />
        </Field>
        <Field label="学历">
          <select value={degree} onChange={(e) => setDegree(e.target.value as typeof degree)} className={inputClass} style={inputStyle}>
            {DEGREE_ORDER.map((d) => (
              <option key={d} value={d}>
                {DEGREE_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="入学">
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="2011.09" className={inputClass} style={inputStyle} />
        </Field>
        <Field label="毕业" hint="留空表示在读">
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="2015.07" className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <Field label="学习形式">
        <Segmented
          value={fullTime ? "y" : "n"}
          options={[
            { value: "y", label: "全日制" },
            { value: "n", label: "非全日制" },
          ]}
          onChange={(v) => setFullTime(v === "y")}
        />
      </Field>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
        <Field
          label="能被验证吗"
          hint="选「可查」记为实测，简历里可以正常写；选「无法验证」记为无证据，默认不导出。学历只有这两档，不套用估算和仅设计。"
        >
          <Segmented
            value={level}
            options={[
              { value: "measured", label: "学信网可查" },
              { value: "absent", label: "无法验证" },
            ]}
            onChange={setLevel}
          />
        </Field>
        {level === "measured" && (
          <Field label="可查渠道说明 · 选填" hint="海外学历认证编号等。留空按「学信网可查」记">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
        )}
      </div>

      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </Drawer>
  );
}
