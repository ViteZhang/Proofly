"use client";

// =============================================================
// Proofly · 随手记对话（切片 3.2 的临时界面）
//
// 这一版只为把 Stage A 的四个分支测出来：能发、能看到回复、
// 模型挂了能重试。按《交互设计方案》S5 做的完整界面是切片 3.5 的活，
// 到时候这个文件会被整体替换——所以这里不做气泡样式、不做粘贴图片、
// 不做快捷入口、不做向上滚动加载，免得写两遍。
// =============================================================

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { ChatConfirmCard } from "@/components/notes/ChatConfirmCard";
import { answerLinks, confirmCard, type ChatMessageView } from "@/lib/chat/message-shape";
import { createClient } from "@/lib/supabase/client";
import { retryMessage, sendMessage } from "@/app/(app)/notes/actions";

export function NotesChat({ initial }: { initial: ChatMessageView[] }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ path: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  // 重试针对的是最后那条没得到回复的用户消息
  const last = messages[messages.length - 1];
  const canRetry = error !== null && last?.role === "user";

  function send() {
    const body = text.trim();
    if ((body === "" && image === null) || pending) return;
    setError(null);
    const path = image?.path;
    start(async () => {
      const r = await sendMessage(body, path);
      if (!r.ok) {
        setError(r.error);      // 连库都没写进去，输入框里的话原样留着
        return;
      }
      setMessages((prev) => [...prev, ...r.data.messages]);
      setText("");
      setImage(null);
      setError(r.data.modelError);
    });
  }

  // 完整的粘贴图片是 3.5 的活。这里放个文件选择框，只为把 OCR 那条路径跑通。
  async function pick(file: File) {
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("登录状态过期了，刷新一下页面");
      return;
    }
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const up = await supabase.storage.from("chat-images").upload(path, file);
    if (up.error) {
      setError(`图没传上去：${up.error.message}`);
      return;
    }
    setImage({ path, name: file.name });
  }

  function retry() {
    if (!last || pending) return;
    setError(null);
    start(async () => {
      const r = await retryMessage(last.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMessages((prev) => [...prev, ...r.data.messages]);
      setError(r.data.modelError);
    });
  }

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-[14px]" style={{ color: "var(--mute)" }}>
            还没说过话。随便说一件事试试。
          </p>
        )}

        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}

        {pending && (
          <p className="text-[14px]" style={{ color: "var(--mute)" }}>
            想一下…
          </p>
        )}

        {error !== null && (
          <div
            className="rounded-btn border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--warn)", color: "var(--slate)" }}
          >
            <p style={{ color: "var(--ink)" }}>AI 这会儿没响应，再试一次</p>
            <p className="mt-1">{error}</p>
            {canRetry && (
              <Button variant="secondary" size="sm" className="mt-2" onClick={retry}>
                再试一次
              </Button>
            )}
          </div>
        )}

        <div ref={bottom} />
      </div>

      {image !== null && (
        <p className="mt-4 text-[13px]" style={{ color: "var(--slate)" }}>
          带了一张图：{image.name}
          <button
            type="button"
            onClick={() => setImage(null)}
            className="ml-2 underline"
            style={{ color: "var(--mute)" }}
          >
            去掉
          </button>
        </p>
      )}

      <div className="mt-5 flex items-end gap-2">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="说说项目进展、新拿到的数据，或者刚想起来的细节…"
          className="flex-1 resize-none rounded-btn border px-3 py-2 text-[14px] outline-none"
          style={{ borderColor: "var(--line)" }}
        />
        <Button onClick={send} disabled={pending || (text.trim() === "" && image === null)}>
          发送
        </Button>
      </div>

      <label className="mt-2 inline-block text-[13px] underline" style={{ color: "var(--mute)" }}>
        选一张图
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function Message({ m }: { m: ChatMessageView }) {
  const mine = m.role === "user";
  const links = m.kind === "query_answer" ? answerLinks(m.payload) : [];
  const card = m.kind === "confirm_card" ? confirmCard(m.payload) : null;

  return (
    <div className={mine ? "flex justify-end" : ""}>
      <div className="max-w-[85%]">
        <p className="text-[12px]" style={{ color: "var(--mute)" }}>
          {mine ? "你" : "助手"}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-[14px]" style={{ color: "var(--ink)" }}>
          {m.content}
        </p>
        {m.imageUrl !== null && mine && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.imageUrl}
            alt="你贴的图"
            className="mt-1.5 max-h-[140px] rounded-btn border"
            style={{ borderColor: "var(--line)" }}
          />
        )}
        {card !== null && (
          <div className="mt-1.5">
            <ChatConfirmCard card={card} imageUrl={m.imageUrl} />
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {links.map((l) => (
              <Link
                key={l.atomId}
                href={`/library?atom=${l.atomId}`}
                className="rounded-btn border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--line)", color: "var(--slate)" }}
              >
                去看「{l.title}」
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
