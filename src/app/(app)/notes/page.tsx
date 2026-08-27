import { NotesChat } from "@/components/notes/NotesChat";
import { loadMessages } from "@/lib/queries/chat";

export default async function NotesPage() {
  const initial = await loadMessages();

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">随手记</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        随口说一句，档案自己更新。问句和闲聊不写库。
      </p>

      <div className="mt-5">
        <NotesChat initial={initial} />
      </div>
    </div>
  );
}
