"use server";

import { z } from "zod";

import { chitchatReply } from "@/lib/chat/chitchat";
import { classifyMessage } from "@/lib/chat/classify";
import {
  toMessageView,
  type ChatMessageRow,
  type ChatMessageView,
} from "@/lib/chat/message-shape";
import { ocrChatImage } from "@/lib/chat/ocr";
import { runRecord } from "@/lib/chat/pipeline";
import { answerQuery, renderQueryAnswer } from "@/lib/chat/query-answer";
import { formatTurns } from "@/lib/chat/turns";
import { fail, ok, type ActionResult } from "@/lib/domain";
import { loadMessages, signImages } from "@/lib/queries/chat";
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
 * 刷新页面后把「还在处理」这件事捡回来（验收 42）。
 *
 * 处理是在 Server Action 里同步跑完的，页面刷新不会打断它——
 * 但新页面并不知道后台还有活。靠这条作业记录知道。
 *
 * 卡了很久的作业不算「在处理」：跑它的那次请求多半已经没了，
 * 一直转圈比说错话还难查。
 */
const BUSY_WINDOW_MS = 10 * 60_000;

export async function chatBusy(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ingest_jobs")
    .select("id")
    .eq("input_type", "chat")
    .eq("status", "extracting")
    .gt("created_at", new Date(Date.now() - BUSY_WINDOW_MS).toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

/** 处理期间轮询新消息。afterIso 为 null 时只回状态，不回消息。 */
export async function pollChat(
  afterIso: string | null,
): Promise<ActionResult<{ messages: ChatMessageView[]; busy: boolean }>> {
  const busy = await chatBusy();
  if (afterIso === null) return ok({ messages: [], busy });

  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, role, kind, content, image_path, payload, created_at")
    .gt("created_at", afterIso)
    .order("created_at", { ascending: true })
    .limit(50);

  return ok({
    messages: await signImages(((data ?? []) as ChatMessageRow[]).map(toMessageView)),
    busy,
  });
}

/** 「更新某个项目」的经历选择器。只要能认出是哪条的最少几个字段。 */
export async function pickerAtoms(): Promise<
  ActionResult<{ id: string; title: string; org: string; status: string }[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atoms")
    .select("id, title, org, status")
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) return fail(`没读到经历列表：${error.message}`);
  return ok(
    (data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      org: a.org ?? "",
      status: a.status,
    })),
  );
}

/**
 * 发一条消息：先落库，再分类，再按四个分支处理。
 *
 * 用户那条消息无论后面成不成都留在库里——模型挂了的时候，
 * 用户看到的应该是「我说的话还在，重试一下」，而不是话没了。
 */
export async function sendMessage(
  text: string,
  imagePath?: string,
): Promise<ActionResult<SendResult>> {
  const body = text.trim();
  const image = imagePath?.trim() ?? "";
  if (body === "" && image === "") return fail("说点什么再发");
  if (body.length > MAX_LEN) return fail(`一次最多 ${MAX_LEN} 字，这条太长了`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      role: "user",
      kind: image === "" ? "text" : "image",
      content: body,
      image_path: image === "" ? null : image,
    })
    .select("id, role, kind, content, image_path, payload, created_at")
    .single();
  if (error || !data) return fail(`没能把这条记下来：${error?.message ?? "未知错误"}`);

  const mine = toMessageView(data);
  const replies = await process(mine.id, body, mine.imagePath);
  if (!replies.ok) {
    return ok({ messages: await signImages([mine]), modelError: replies.error });
  }
  return ok({ messages: await signImages([mine, ...replies.data]), modelError: null });
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
    .select("id, role, content, image_path, created_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.role !== "user") return fail("这条消息不在了");

  const { data: after } = await supabase
    .from("chat_messages")
    .select("id")
    .gt("created_at", msg.created_at ?? new Date(0).toISOString())
    .limit(1);
  if (after && after.length > 0) return fail("这条已经回过了");

  const replies = await process(msg.id, msg.content ?? "", msg.image_path);
  if (!replies.ok) return ok({ messages: [], modelError: replies.error });
  return ok({ messages: await signImages(replies.data), modelError: null });
}

// ---- 四个分支 ----

async function process(
  userMessageId: string,
  body: string,
  imagePath: string | null,
): Promise<ActionResult<ChatMessageView[]>> {
  const history = await loadMessages();
  const recentTurns = formatTurns(
    history.filter((m) => m.id !== userMessageId).map((m) => ({ role: m.role, content: m.content })),
  );

  // 图先认字。Stage A 的提示词里没有图片这一格，所以只有一种情况需要它：
  // 用户光贴了张图什么都没说——那就拿认出来的字当他说的话。
  let ocr = "";
  if (imagePath !== null) {
    const r = await ocrChatImage(imagePath);
    if (r.error !== null) return fail(r.error);
    ocr = r.text;
  }

  // 图里没字、人也没说话，那就是一张不知道要记什么的图。
  // 不硬凑经历，问一句就行（验收 24）。
  if (body.trim() === "" && ocr.trim() === "") {
    return say("这张图里没认出文字。你想记的是哪件事？说一句我就记下。", "clarify");
  }

  const said = body.trim() === "" ? ocr : body;

  const r = await classifyMessage({ userMessage: said, recentTurns });
  if (!r.ok) return fail(r.error);

  switch (r.data.intent) {
    case "QUERY": {
      const answer = await answerQuery({
        subject: r.data.query_subject,
        userMessage: said,
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

    case "RECORD": {
      const run = await runRecord({
        userMessage: said,
        recentTurns,
        imagePath,
        imageOcrText: ocr,
      });
      if (!run.ok) return fail(run.error);
      if (run.data.units === 0) {
        // Stage A 说这是要记的事，Stage B 却拆不出东西来。
        // 两边不一致时不猜，问一句。
        return say("这句我没拆出能记进档案的东西，能再说具体点吗？", "clarify");
      }
      return ok(run.data.messages);
    }
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
  return ok([toMessageView(data)]);
}
