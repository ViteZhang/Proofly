"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  checkExtension,
  registerUpload,
  type UploadSummary,
} from "@/app/(app)/import/actions";

type Phase = "idle" | "uploading" | "parsing";

const MAX_BYTES = 25 * 1024 * 1024;

export function UploadZone({ onDone }: { onDone?: (s: UploadSummary) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    setError(null);
    setSummary(null);

    if (file.size > MAX_BYTES) {
      setError(`这个文件 ${(file.size / 1024 / 1024).toFixed(1)} MB，超过 25 MB 了`);
      return;
    }
    const known = await checkExtension(file.name);
    if (!known.ok) {
      setError(known.error);
      return;
    }

    setPhase("uploading");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("登录状态过期了，刷新一下页面");
      setPhase("idle");
      return;
    }

    const path = `${user.id}/${crypto.randomUUID()}-${sanitize(file.name)}`;
    const up = await supabase.storage.from("source-docs").upload(path, file);
    if (up.error) {
      setError(`没传上去：${up.error.message}`);
      setPhase("idle");
      return;
    }

    setPhase("parsing");
    const r = await registerUpload({ storagePath: path, filename: file.name });
    setPhase("idle");
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSummary(r.data);
    onDone?.(r.data);
  }

  const busy = phase !== "idle";

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && !busy) void handle(f);
        }}
        onClick={() => !busy && input.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-card px-6 py-12 text-center transition-colors"
        style={{
          background: dragging ? "var(--line-soft)" : "var(--card)",
          border: `1.5px dashed ${dragging ? "var(--ink)" : "var(--line)"}`,
        }}
      >
        <input
          ref={input}
          type="file"
          className="hidden"
          accept=".md,.markdown,.txt,.text,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
            e.target.value = "";
          }}
        />
        <p className="text-[15px] font-medium">
          {phase === "uploading"
            ? "正在上传…"
            : phase === "parsing"
              ? "正在读这份文档…"
              : "把文档拖到这里，或者点一下选文件"}
        </p>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--slate)" }}>
          支持 .md .txt .docx .pdf，以及 .png .jpg .webp 图片。单个不超过 25 MB。
        </p>
        {phase === "parsing" && (
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--mute)" }}>
            扫描件要逐页认字，比文本文件慢
          </p>
        )}
      </div>

      {error && (
        <p
          className="mt-3 rounded-card px-4 py-3 text-[13.5px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      {summary && <ParseSummary summary={summary} />}
    </div>
  );
}

function ParseSummary({ summary }: { summary: UploadSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="mt-4 rounded-card p-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate text-[15px] font-medium">{summary.filename}</h3>
        <span className="shrink-0 text-[12.5px]" style={{ color: "var(--mute)" }}>
          {summary.kind}
          {summary.pages !== null && ` · ${summary.pages} 页`}
          {` · ${summary.chars.toLocaleString()} 字`}
        </span>
      </div>

      {summary.note && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--slate)" }}>
          {summary.note}
        </p>
      )}

      <Button
        variant="text"
        size="sm"
        className="mt-2 !px-0"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "收起读出来的文字" : "看看读出来的文字"}
      </Button>

      {open && (
        <pre
          className="mt-2 max-h-[380px] overflow-auto whitespace-pre-wrap rounded-card p-3 text-[12.5px] leading-relaxed"
          style={{ background: "var(--line-soft)", color: "var(--slate)" }}
        >
          {summary.preview}
          {summary.chars > summary.preview.length && "\n\n……（只显示前 1200 字）"}
        </pre>
      )}
    </div>
  );
}

// Storage 的路径别塞奇怪字符，原始文件名照样存在 source_docs.filename 里。
function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80);
}
