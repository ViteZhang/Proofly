// =============================================================
// Proofly · 拼给模型看的「最近几轮对话」
//
// 代词解析全靠这段上下文：「那个项目上线了」里的「那个」，
// 只有在这里能找到。取 6 轮是方案 3.3 定的口径。
//
// 不依赖 Next，方便脱离页面单测。
// =============================================================

export const RECENT_TURNS = 6;

/** 一轮 = 一条用户消息。助手回的那几条跟在它后面，一起算这一轮。 */
const PER_MESSAGE_CHARS = 200;

export type TurnMessage = {
  role: "user" | "assistant" | "system";
  content: string | null;
};

/**
 * 按时间正序传入历史消息，返回拼进提示词的那段文本。
 *
 * 从尾部往前数满 RECENT_TURNS 条用户消息为止——按用户消息数截断而不是
 * 按总条数，是因为一条用户消息可能带出好几条助手消息（多单元时会有
 * 多张确认卡），按总条数截会把用户自己说的话先挤掉。
 */
export function formatTurns(messages: TurnMessage[]): string {
  let userSeen = 0;
  let from = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userSeen++;
      if (userSeen > RECENT_TURNS) {
        from = i + 1;
        break;
      }
    }
  }

  const lines = messages
    .slice(from)
    .filter((m) => m.role !== "system")
    .map((m) => {
      const text = (m.content ?? "").trim().replace(/\s+/g, " ");
      if (text === "") return null;
      const clipped =
        text.length > PER_MESSAGE_CHARS ? `${text.slice(0, PER_MESSAGE_CHARS)}…` : text;
      return `${m.role === "user" ? "用户" : "助手"}：${clipped}`;
    })
    .filter((s): s is string => s !== null);

  return lines.length === 0 ? "（还没有上文，这是第一句话）" : lines.join("\n");
}
