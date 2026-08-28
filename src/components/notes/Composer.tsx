"use client";

// =============================================================
// Proofly · 随手记输入框
//
// 三行起，最多长到八行。Enter 发送，Shift+Enter 换行。
// 支持粘贴图片，缩略图显示在输入框上方，可移除。
//
// 发送失败时不清空——话是用户打的，丢了就得重打（验收 44）。
// 所以 onSend 返回 false 时这里什么都不动。
// =============================================================

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/Button";

const MIN_ROWS = 3;
const MAX_ROWS = 8;

export type ComposerHandle = { focus: () => void; prepend: (s: string) => void };

type Pending = { path: string; name: string; preview: string };

export function Composer({
  ref,
  placeholder,
  disabled,
  onSend,
  onError,
  uploadImage,
}: {
  ref?: RefObject<ComposerHandle | null>;
  placeholder: string;
  disabled: boolean;
  onSend: (body: string, imagePath: string | null) => Promise<boolean>;
  onError: (message: string) => void;
  uploadImage: (file: File) => Promise<{ path: string } | { error: string }>;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<Pending | null>(null);
  const [uploading, setUploading] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => box.current?.focus(),
    prepend: (s: string) => {
      setText((prev) => (prev.startsWith(s) ? prev : s + prev));
      box.current?.focus();
    },
  }));

  // 自动增高：先塌回去量一次真实高度，再夹在三行到八行之间
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
    const pad = el.offsetHeight - el.clientHeight + 16;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line * MIN_ROWS + pad), line * MAX_ROWS + pad)}px`;
  }, [text]);

  const empty = text.trim() === "" && image === null;

  async function take(file: File) {
    setUploading(true);
    const r = await uploadImage(file);
    setUploading(false);
    if ("error" in r) {
      onError(r.error);
      return;
    }
    setImage({
      path: r.path,
      name: file.name.trim() === "" ? "粘贴的截图" : file.name,
      preview: URL.createObjectURL(file),
    });
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file === undefined) return;
    e.preventDefault();
    void take(file);
  }

  async function submit() {
    if (empty || disabled || uploading) return;
    const okDone = await onSend(text.trim(), image?.path ?? null);
    if (!okDone) return;
    setText("");
    setImage(null);
  }

  return (
    <div
      className="rounded-card border p-2.5"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      {image !== null && (
        <div className="mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.preview}
            alt={image.name}
            className="h-14 w-14 rounded-btn border object-cover"
            style={{ borderColor: "var(--line)" }}
          />
          <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--slate)" }}>
            {image.name}
          </span>
          <button
            type="button"
            onClick={() => setImage(null)}
            className="text-[13px] underline"
            style={{ color: "var(--mute)" }}
          >
            移除
          </button>
        </div>
      )}

      <textarea
        ref={box}
        rows={MIN_ROWS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-1 text-[14px] leading-[20px] outline-none"
        style={{ color: "var(--ink)" }}
      />

      <div className="mt-1.5 flex items-center justify-between">
        <label className="cursor-pointer text-[13px]" style={{ color: "var(--mute)" }}>
          {uploading ? "图在传…" : "加一张图"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void take(f);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--mute)" }}>
            Enter 发送 · Shift+Enter 换行
          </span>
          <Button size="sm" onClick={() => void submit()} disabled={empty || disabled || uploading}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
