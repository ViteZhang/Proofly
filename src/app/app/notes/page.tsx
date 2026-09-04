import { NotesChat } from "@/components/notes/NotesChat";
import { getBalance } from "@/lib/queries/billing";
import { loadMessages } from "@/lib/queries/chat";
import { chatBusy } from "./actions";

// 单列 760，底部固定输入框。外壳是 Topbar 56 + main 上下各 28，
// 所以这里减掉 112 才能让消息区自己滚、输入框钉在底下。
export default async function NotesPage() {
  const [initial, busy, balance] = await Promise.all([
    loadMessages(),
    chatBusy(),
    getBalance(),
  ]);

  return (
    <div className="mx-auto flex h-[calc(100vh-112px)] max-w-[760px] flex-col">
      <div className="shrink-0 pb-3">
        <h1 className="font-display text-[26px] font-semibold tracking-tight">随手记</h1>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
          随口说一句，档案自己更新。问句和闲聊不写库。
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <NotesChat
          initial={initial}
          busy={busy}
          freeLeft={balance.freeChatLeft}
          freeLimit={balance.freeChatLimit}
        />
      </div>
    </div>
  );
}
