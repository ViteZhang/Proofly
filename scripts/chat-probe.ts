// =============================================================
// Proofly · Stage A 会话意图分类的探针
//
//   pnpm chat:probe                 跑内置的四类各三句
//   pnpm chat:probe "上周灰度上线了"   只跑这一句
//
// 走 llm/core.ts 而不是 llm/index.ts：core 不认识 Next，
// 所以不用起服务器、不写 llm_calls，纯看分类结果。
//
// 分类是随手记整条链路的第一道闸。它判错一次，
// 下游要么在档案里编一条经历，要么把用户的问句当成事实记下来。
// 所以这道闸要能随时单独跑一遍。
// =============================================================

import { callLLM, setCallLogger } from "../src/lib/llm/core";
import { STAGE_A_SYSTEM, stageAUser } from "../src/lib/llm/chat-prompts";
import { stageASchema, type ChatIntent } from "../src/lib/chat/schema";

setCallLogger(async () => {});

type Case = { text: string; want: ChatIntent; ctx?: string };

// 有些句子离开上文根本没法判。「那个项目其实是我主导的」——哪个项目？
// 不给上文就期望它判 RECORD，是在考一道没有答案的题。
const CTX = `用户：知识宇宙这个项目我在做意图路由
助手：记下了。`;
const NO_CTX = "（还没有上文，这是第一句话）";

// 四类各三句：前两句照抄方案第七节验收清单，第三句是同类里更难的那种。
const CASES: Case[] = [
  { text: "我那个 AI 模块进展怎么样了", want: "QUERY" },
  { text: "我一共记了多少条经历", want: "QUERY" },
  { text: "知识宇宙那条写的什么", want: "QUERY" },

  { text: "好的谢谢", want: "CHITCHAT" },
  { text: "你能做什么", want: "CHITCHAT" },
  { text: "先这样", want: "CHITCHAT" },

  { text: "最近那个项目有点进展", want: "AMBIGUOUS" },
  { text: "数据出来了", want: "AMBIGUOUS" },
  { text: "改了一版", want: "AMBIGUOUS" },

  { text: "上周灰度上线了，渗透率 35%", want: "RECORD" },
  { text: "我还做了个打招呼功能", want: "RECORD" },
  { text: "那个项目其实是我主导的", want: "RECORD", ctx: CTX },
];

async function classify(text: string, ctx = NO_CTX) {
  return callLLM({
    tier: "light",
    purpose: "chat_stage_a",
    system: STAGE_A_SYSTEM,
    user: stageAUser({ recentTurns: ctx, userMessage: text }),
    jsonSchema: stageASchema,
  });
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));

if (argv.length > 0) {
  for (const text of argv) {
    const r = await classify(text);
    if (!r.ok) {
      console.log(`✗ ${text}\n  ${r.error}`);
      continue;
    }
    console.log(`${text}\n  → ${r.data.intent}  [${r.usage.provider}]`);
    if (r.data.clarify) console.log(`  追问：${r.data.clarify}`);
    if (r.data.query_subject) console.log(`  在问：${r.data.query_subject}`);
  }
} else {
  let right = 0;
  for (const c of CASES) {
    const r = await classify(c.text, c.ctx);
    if (!r.ok) {
      console.log(`✗ ${c.want.padEnd(9)} ${c.text}  ——  ${r.error}`);
      continue;
    }
    const hit = r.data.intent === c.want;
    if (hit) right++;
    const extra = r.data.clarify
      ? `  追问：${r.data.clarify}`
      : r.data.query_subject
        ? `  在问：${r.data.query_subject}`
        : "";
    console.log(
      `${hit ? "✓" : "✗"} 期望 ${c.want.padEnd(9)} 实得 ${r.data.intent.padEnd(9)} ` +
        `[${r.usage.provider}] ${c.text}${c.ctx ? "（带上文）" : ""}${extra}`,
    );
  }
  console.log(`\n${right} / ${CASES.length} 判对`);
  if (right < CASES.length) process.exitCode = 1;
}
