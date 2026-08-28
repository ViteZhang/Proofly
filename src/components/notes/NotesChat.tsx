"use client";

// =============================================================
// Proofly · 随手记对话（《交互设计方案 v1.1》S5）
//
// 单列 760，底部固定输入框。用户消息右对齐深色气泡，助手左对齐浅底气泡，
// 确认卡不套气泡、左缩进 36 对齐助手头像。
//
// 三件事比样式重要：
// 1. 发送失败时输入框里的话必须还在（验收 44）——断网那一下 Server Action
//    是抛出来的，不是返回 ok:false，所以每次调用都得包 try/catch。
// 2. 刷新页面要能把「还在处理」捡回来（验收 42）——处理跑在服务端，
//    页面刷新打断不了它，但新页面并不知道后台还有活，靠轮询接回来。
// 3. 消息按 id 去重再追加——同一条既可能从 Server Action 的返回里来，
//    也可能被轮询捡回来，两条路会撞车（验收 41 的串话就是这么来的）。
// =============================================================

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { ChatConfirmCard } from "@/components/notes/ChatConfirmCard";
import { Button } from "@/components/ui/Button";
import {
  answerLinks,
  confirmCard,
  type ChatMessageView,
} from "@/lib/chat/message-shape";
import { createClient } from "@/lib/supabase/client";
import {
  loadMore,
  pickerAtoms,
  pollChat,
  retryMessage,
  sendMessage,
} from "@/app/(app)/notes/actions";
import { AnswerLinks } from "./AnswerLinks";
import { AtomPicker, type PickerAtom } from "./AtomPicker";
import { Composer } from "./Composer";

const POLL_MS = 2000;
const PLACEHOLDER = "说说项目进展、新拿到的数据，或者刚想起来的细节…";
const NEW_PLACEHOLDER = "这条经历叫什么、在哪做的、你负责哪部分、拿到了什么结果…";

export function NotesChat({
  initial,
  busy,
}: {
  initial: ChatMessageView[];
  busy: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [thinking, setThinking] = useState(busy);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDER);
  const [picker, setPicker] = useState<PickerAtom[] | null>(null);
  const [older, setOlder] = useState<"idle" | "loading" | "done">(
    initial.length === 0 ? "done" : "idle",
  );
  const [, start] = useTransition();

  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<{ focus: () => void; prepend: (s: string) => void }>(null);
  const stick = useRef(true);

  // 按 id 去重后追加。轮询和 Server Action 的返回会送来同一条消息。
  const append = useCallback((incoming: ChatMessageView[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      return add.length === 0 ? prev : [...prev, ...add];
    });
  }, []);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking]);

  // 处理中：轮询捡新消息，直到后台没活了
  useEffect(() => {
    if (!thinking) return;
    let alive = true;

    const tick = async () => {
      const last = messages[messages.length - 1]?.createdAt ?? null;
      try {
        const r = await pollChat(last);
        if (!alive || !r.ok) return;
        append(r.data.messages);
        if (!r.data.busy && r.data.messages.length === 0) setThinking(false);
      } catch {
        // 轮询失败不打断：下一次再试。断网时不该把「想一下…」变成一个错误。
      }
    };

    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [thinking, messages, append]);

  async function onSend(body: string, imagePath: string | null): Promise<boolean> {
    setError(null);
    setHint(null);
    stick.current = true;
    setThinking(true);
    try {
      const r = await sendMessage(body, imagePath ?? undefined);
      if (!r.ok) {
        setError(r.error);
        return false;      // 话留在输入框里
      }
      append(r.data.messages);
      setError(r.data.modelError);
      return true;
    } catch {
      // 断网、请求被掐断：Server Action 是抛出来的，不是返回 ok:false。
      setError("这条没发出去，网络断了或者请求被掐断了。内容还在，再点一次发送。");
      return false;
    } finally {
      setThinking(false);
    }
  }

  function retry() {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    setError(null);
    setThinking(true);
    start(async () => {
      try {
        const r = await retryMessage(last.id);
        if (!r.ok) setError(r.error);
        else {
          append(r.data.messages);
          setError(r.data.modelError);
        }
      } catch {
        setError("还是没通。等一下再试。");
      } finally {
        setThinking(false);
      }
    });
  }

  function onScroll() {
    const el = scroller.current;
    if (el === null) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (el.scrollTop > 60 || older !== "idle" || messages.length === 0) return;
    const oldest = messages[0].createdAt;
    if (oldest === null) return;

    setOlder("loading");
    const keep = el.scrollHeight;
    start(async () => {
      try {
        const r = await loadMore(oldest);
        if (!r.ok || r.data.length === 0) {
          setOlder("done");
          return;
        }
        setMessages((prev) => [...r.data, ...prev]);
        setOlder("idle");
        // 往上插了内容，把视口钉回用户原来看的地方
        requestAnimationFrame(() => {
          if (scroller.current !== null) {
            scroller.current.scrollTop = scroller.current.scrollHeight - keep;
          }
        });
      } catch {
        setOlder("idle");
      }
    });
  }

  function openPicker() {
    setHint(null);
    start(async () => {
      const r = await pickerAtoms();
      if (r.ok) setPicker(r.data);
      else setError(r.error);
    });
  }

  const canRetry = error !== null && messages[messages.length - 1]?.role === "user";

  return (
    <div className="mx-auto flex h-full max-w-[760px] flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {older === "loading" && (
          <p className="py-2 text-center text-[12px]" style={{ color: "var(--mute)" }}>
            在翻更早的…
          </p>
        )}
        {older === "done" && messages.length > 0 && (
          <p className="py-2 text-center text-[12px]" style={{ color: "var(--mute)" }}>
            没有更早的了
          </p>
        )}

        {messages.length === 0 && (
          <p className="py-6 text-[14px]" style={{ color: "var(--mute)" }}>
            还没说过话。随口说一件事，我记进去。
          </p>
        )}

        <div className="flex flex-col gap-3 pb-2">
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}

          {thinking && <Thinking />}

          {error !== null && (
            <div
              className="ml-9 rounded-btn border px-3 py-2 text-[13px]"
              style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}
            >
              <p style={{ color: "var(--ink)" }}>AI 这会儿没响应，再试一次</p>
              <p className="mt-1" style={{ color: "var(--slate)" }}>
                {error}
              </p>
              {canRetry && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={retry}>
                  再试一次
                </Button>
              )}
            </div>
          )}

          <div ref={bottom} />
        </div>
      </div>

      {picker !== null && (
        <AtomPicker
          atoms={picker}
          onClose={() => setPicker(null)}
          onPick={(a) => {
            setPicker(null);
            composer.current?.prepend(`关于「${a.title}」：`);
          }}
        />
      )}

      <div className="shrink-0 pt-3">
        <div className="flex flex-wrap gap-2 pb-2">
          <Pill
            onClick={() => {
              setPlaceholder(NEW_PLACEHOLDER);
              setHint(null);
              composer.current?.focus();
            }}
          >
            记一条新经历
          </Pill>
          <Pill onClick={openPicker}>更新某个项目</Pill>
          <Pill onClick={() => setHint("这个还在做，先记到经历库里吧")}>
            我刚面完，来复盘
          </Pill>
        </div>

        {hint !== null && (
          <p className="pb-2 text-[13px]" style={{ color: "var(--slate)" }}>
            {hint}
          </p>
        )}

        <Composer
          ref={composer}
          placeholder={placeholder}
          disabled={thinking}
          onSend={onSend}
          onError={setError}
          uploadImage={uploadImage}
        />
      </div>
    </div>
  );
}

// ---- 图片：浏览器直传 Storage，绕开 Server Action 的请求体上限 ----

async function uploadImage(file: File): Promise<{ path: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "登录状态过期了，刷新一下页面" };

  const name = file.name.trim() === "" ? "paste.png" : file.name;
  const path = `${user.id}/${crypto.randomUUID()}-${name.replace(/[^\w.\-]+/g, "_")}`;
  const up = await supabase.storage.from("chat-images").upload(path, file);
  return up.error ? { error: `图没传上去：${up.error.message}` } : { path };
}

// ---- 单条消息 ----

function Message({ m }: { m: ChatMessageView }) {
  const mine = m.role === "user";
  const card = m.kind === "confirm_card" ? confirmCard(m.payload) : null;

  // 确认卡不套气泡，左缩进 36 对齐助手头像
  if (card !== null) {
    return (
      <div className="ml-9">
        <ChatConfirmCard card={card} headline={m.content} imageUrl={m.imageUrl} />
      </div>
    );
  }

  if (mine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div
            className="rounded-card px-3.5 py-2.5 text-[14px]"
            style={{ background: "var(--ink)", color: "#fff" }}
          >
            {m.content !== "" && <p className="whitespace-pre-wrap">{m.content}</p>}
            {m.imageUrl !== null && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={m.imageUrl}
                alt="你贴的图"
                className={`max-h-[160px] rounded-btn ${m.content === "" ? "" : "mt-2"}`}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Avatar />
      <div className="min-w-0 max-w-[80%]">
        <div
          className="rounded-card border px-3.5 py-2.5 text-[14px]"
          style={{
            background: "var(--card)",
            borderColor: "var(--line)",
            color: "var(--ink)",
          }}
        >
          <p className="whitespace-pre-wrap">{m.content}</p>
          {m.kind === "query_answer" && <AnswerLinks links={answerLinks(m.payload)} />}
        </div>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-2">
      <Avatar />
      <div
        className="flex items-center gap-2 rounded-card border px-3.5 py-2.5 text-[14px]"
        style={{ background: "var(--card)", borderColor: "var(--line)", color: "var(--mute)" }}
      >
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
              style={{ background: "var(--ghost)", animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        想一下…
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span
      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
      style={{ background: "var(--ai-soft)", color: "var(--ai)" }}
      aria-hidden
    >
      P
    </span>
  );
}

function Pill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill border px-3 py-1 text-[13px] transition-colors hover:bg-[var(--line-soft)]"
      style={{ borderColor: "var(--line)", color: "var(--slate)" }}
    >
      {children}
    </button>
  );
}
