"use server";

import { z } from "zod";

import { chitchatReply } from "@/lib/chat/chitchat";
import { classifyMessage } from "@/lib/chat/classify";
import type { ChatMessageView } from "@/lib/chat/message-shape";
import { answerQuery, renderQueryAnswer } from "@/lib/chat/query-answer";
import { formatTurns } from "@/lib/chat/turns";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { loadMessages } from "@/lib/queries/chat";
import { createClient } from "@/lib/supabase/server";
import type { ChatKind, Json } from "@/types/database";

// 一句随手记再长也就几行。超过这个数多半是粘错了东西，
// 与其送去 Stage A 烧一遍 token，不如当场拦下。
const MAX_LEN = 2000;

const uuid = z.uuid();

/**
 * 模型挂了不是「这次操作失败了」——用户那条消息已经稳稳落库了。
 * 所以失败也要把消息带回去：界面得先把用户说的话显示出来，
 * 「再试一次」才有对象可重试。
 * modelError 非空就是这种情况；真正的写库失败仍然走 fail()。
 */
export type SendResult = { messages: ChatMessageView[]; modelError: string | null };

export async function loadMore(before: string): Promise<ActionResult<ChatMessageView[]>> {
  return ok(await loadMessages(before));
}

/**
 * 发一条消息：先落库，再分类，再按四个分支处理。
 *
 * 用户那条消息无论后面成不成都留在库里——模型挂了的时候，
 * 用户看到的应该是「我说的话还在，重试一下」，而不是话没了。
 */
export async function sendMessage(text: string): Promise<ActionResult<SendResult>> {
  const body = text.trim();
  if (body === "") return fail("说点什么再发");
  if (body.length > MAX_LEN) return fail(`一次最多 ${MAX_LEN} 字，这条太长了`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ role: "user", kind: "text", content: body })
    .select("id, role, kind, content, image_path, payload, created_at")
    .single();
  if (error || !data) return fail(`没能把这条记下来：${error?.message ?? "未知错误"}`);

  const mine = view(data);
  const replies = await process(mine.id, body);
  if (!replies.ok) return ok({ messages: [mine], modelError: replies.error });
  return ok({ messages: [mine, ...replies.data], modelError: null });
}

/**
 * 对一条已经落库、但还没有回复的用户消息重跑一次。
 *
 * 模型调用失败后界面上的「再试一次」走这里。拒绝对已经有回复的消息重跑，
 * 否则连点两下就是两条回复对着一句话。
 */
export async function retryMessage(messageId: string): Promise<ActionResult<SendResult>> {
  if (!uuid.safeParse(messageId).success) return fail("消息标识不对");

  const supabase = await createClient();
  const { data: msg } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.role !== "user") return fail("这条消息不在了");

  const { data: after } = await supabase
    .from("chat_messages")
    .select("id")
    .gt("created_at", msg.created_at ?? new Date(0).toISOString())
    .limit(1);
  if (after && after.length > 0) return fail("这条已经回过了");

  const replies = await process(msg.id, msg.content ?? "");
  if (!replies.ok) return ok({ messages: [], modelError: replies.error });
  return ok({ messages: replies.data, modelError: null });
}

// ---- 四个分支 ----

async function process(
  userMessageId: string,
  body: string,
): Promise<ActionResult<ChatMessageView[]>> {
  const history = await loadMessages();
  const recentTurns = formatTurns(
    history.filter((m) => m.id !== userMessageId).map((m) => ({ role: m.role, content: m.content })),
  );

  const r = await classifyMessage({ userMessage: body, recentTurns });
  if (!r.ok) return fail(r.error);

  switch (r.data.intent) {
    case "QUERY": {
      const answer = await answerQuery({
        subject: r.data.query_subject,
        userMessage: body,
      });
      return say(renderQueryAnswer(answer), "query_answer", answer as unknown as Json);
    }

    case "CHITCHAT":
      return say(chitchatReply(), "text");

    case "AMBIGUOUS": {
      // clarify 空了也不能默认往 RECORD 走——那正是这个分支要挡住的事。
      const q =
        r.data.clarify.trim() === ""
          ? "这条我没太看明白说的是哪个项目，能补一句吗？"
          : r.data.clarify.trim();
      return say(q, "clarify");
    }

    case "RECORD":
      // 切片 3.3 接上 Stage B / Stage C 之后，这里换成拆分 → 定位 → 确认卡。
      return say(
        "这条我判定成「要记进档案」了。拆分和定位是下一片的活，还没接上，所以现在先不写库。",
        "text",
      );
  }
}

async function say(
  content: string,
  kind: ChatKind,
  payload?: Json,
): Promise<ActionResult<ChatMessageView[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ role: "assistant", kind, content, payload: payload ?? {} })
    .select("id, role, kind, content, image_path, payload, created_at")
    .single();
  if (error || !data) return fail(`回复没能存下来：${error?.message ?? "未知错误"}`);
  return ok([view(data)]);
}

type Row = {
  id: string;
  role: ChatMessageView["role"];
  kind: ChatMessageView["kind"];
  content: string | null;
  image_path: string | null;
  payload: Json;
  created_at: string | null;
};

function view(r: Row): ChatMessageView {
  return {
    id: r.id,
    role: r.role,
    kind: r.kind,
    content: r.content ?? "",
    imagePath: r.image_path,
    payload: r.payload,
    createdAt: r.created_at,
  };
}
