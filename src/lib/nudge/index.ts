// =============================================================
// Proofly · 主动追问
//
// 进随手记页面时查一次。不做定时推送、不发邮件、不弹浏览器通知（方案六）。
//
// 「每天最多 1 次」不靠先查再插：查完再插中间隔着一次往返，
// 两个标签页同时打开随手记就会发两条。改成先抢 nudge_log 那行
// （unique(user_id, sent_on) 会挡住第二次），抢到了才去生成措辞。
// 措辞生成失败就把抢到的那行删掉，别占着今天的名额。
// =============================================================

import { STATUS_LABEL, parsePendingMetrics } from "@/lib/domain";
import { toMessageView, type ChatMessageView } from "@/lib/chat/message-shape";
import { callLLM } from "@/lib/llm";
import { NUDGE_SYSTEM, nudgeUser } from "@/lib/llm/chat-prompts";
import { createClient } from "@/lib/supabase/server";
import type { AtomStatus } from "@/types/database";
import { pickNudge, SAME_ATOM_RULE_DAYS, type NudgeCandidate, type NudgeHistory } from "./rules";

export { pickNudge };
export type { NudgeCandidate, NudgeHistory, NudgePick, NudgeRule } from "./rules";

const MAX_LEN = 60; // 提示词要求不超过 40 字，留点余量再截

/**
 * 该问就问一句，不该问就返回 null。
 * 返回的是已经落库的那条助手消息，界面直接接到对话流末尾。
 */
export async function maybeNudge(): Promise<ChatMessageView | null> {
  const supabase = await createClient();

  const [{ data: atoms }, { data: history }, { data: lastSaid }] = await Promise.all([
    supabase
      .from("atoms")
      .select("id, title, status, pending_metrics, updated_at")
      .in("status", ["in_dev", "shipped"])
      .limit(200),
    supabase
      .from("nudge_log")
      .select("rule, atom_id, sent_at, responded")
      .gte(
        "sent_at",
        new Date(Date.now() - SAME_ATOM_RULE_DAYS * 86_400_000).toISOString(),
      ),
    supabase
      .from("chat_messages")
      .select("created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const candidates: NudgeCandidate[] = (atoms ?? []).map((a) => ({
    atomId: a.id,
    title: a.title,
    status: a.status,
    daysSinceUpdate: daysSince(a.updated_at) ?? 0,
    pendingNames: parsePendingMetrics(a.pending_metrics).map((p) => p.name),
  }));

  const pick = pickNudge({
    candidates,
    daysSinceLastVisit: daysSince(lastSaid?.[0]?.created_at ?? null),
    sentToday: false, // 由下面那次插入来判定，不在这里猜
    history: (history ?? []).map(
      (h): NudgeHistory => ({
        rule: h.rule as NudgeHistory["rule"],
        atomId: h.atom_id,
        daysAgo: daysSince(h.sent_at) ?? 999,
        responded: h.responded,
      }),
    ),
  });
  if (pick === null) return null;

  // 抢今天的名额。撞唯一索引就是今天已经问过了，安静退出。
  const { data: claim, error: claimError } = await supabase
    .from("nudge_log")
    .insert({ rule: pick.rule, atom_id: pick.candidate.atomId })
    .select("id")
    .single();
  if (claimError || !claim) return null;

  const said = await phrase(pick.reason, pick.candidate);
  if (said === null) {
    // 没生成出来就把名额还回去，明天还能问
    await supabase.from("nudge_log").delete().eq("id", claim.id);
    return null;
  }

  const { data: msg } = await supabase
    .from("chat_messages")
    .insert({ role: "assistant", kind: "clarify", content: said })
    .select("id, role, kind, content, image_path, payload, created_at")
    .single();
  if (!msg) {
    await supabase.from("nudge_log").delete().eq("id", claim.id);
    return null;
  }

  await supabase.from("nudge_log").update({ chat_message_id: msg.id }).eq("id", claim.id);
  return toMessageView(msg);
}

/** 用户开口说话了，就算回应了刚才那次追问。 */
export async function markNudgeResponded(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nudge_log")
    .select("id")
    .eq("responded", false)
    .gte("sent_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(1);
  const id = data?.[0]?.id;
  if (id !== undefined) {
    await supabase.from("nudge_log").update({ responded: true }).eq("id", id);
  }
}

// ---------------------------------------------------------------

async function phrase(reason: string, c: NudgeCandidate): Promise<string | null> {
  const r = await callLLM({
    tier: "light",
    purpose: "chat_nudge",
    system: NUDGE_SYSTEM,
    user: nudgeUser({
      reason,
      atomTitle: c.title,
      status: STATUS_LABEL[c.status as AtomStatus] ?? c.status,
      daysSinceUpdate: c.daysSinceUpdate,
      pendingMetrics: c.pendingNames,
    }),
  });
  if (!r.ok) return null;

  // 提示词写死了「只输出那一句话本身，不要引号」。它偶尔还是会带上引号。
  const said = r.data.trim().replace(/^[「"'“]|[」"'”]$/g, "").trim();
  return said === "" ? null : said.slice(0, MAX_LEN);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
