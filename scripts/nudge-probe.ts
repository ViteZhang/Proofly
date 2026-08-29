// =============================================================
// Proofly · 主动追问的判定探针
//
//   pnpm nudge:probe            只跑判定，不调模型
//   pnpm nudge:probe --say      再让模型把三条规则各说一句，验收 40
//
// 覆盖《Step 3 方案》第七节验收 36–39，外加几条边界。
// 判定全是代码，不调模型也不连库 —— 追问这件事多发一次就是骚扰，
// 频次控制必须能被单独喂数据验证，而不是上线之后靠观察。
// =============================================================

import { pickNudge } from "../src/lib/nudge/rules";
import type { NudgeCandidate } from "../src/lib/nudge/rules";

const STALE: NudgeCandidate = {
  atomId: "a-stale",
  title: "润泽园 AI 模块",
  status: "in_dev",
  daysSinceUpdate: 25,
  pendingNames: [],
};

const SHIPPED_PENDING: NudgeCandidate = {
  atomId: "a-pending",
  title: "知识宇宙",
  status: "shipped",
  daysSinceUpdate: 30,
  pendingNames: ["第二周回访率", "月度购买率"],
};

const FRESH: NudgeCandidate = {
  atomId: "a-fresh",
  title: "刚更新过的项目",
  status: "in_dev",
  daysSinceUpdate: 2,
  pendingNames: [],
};

type Case = {
  id: string;
  input: Parameters<typeof pickNudge>[0];
  want: string | null; // "规则:经历id"，null 表示不该问
};

const CASES: Case[] = [
  {
    id: "验收 36 · in_dev 且 25 天没更新 → R1",
    input: { candidates: [STALE, FRESH], daysSinceLastVisit: 1, sentToday: false, history: [] },
    want: "R1:a-stale",
  },
  {
    id: "验收 37 · 有待补项时 R2 优先于 R1",
    input: {
      candidates: [STALE, SHIPPED_PENDING],
      daysSinceLastVisit: 1,
      sentToday: false,
      history: [],
    },
    want: "R2:a-pending",
  },
  {
    id: "验收 38 · 今天已经问过 → 不再问",
    input: {
      candidates: [STALE, SHIPPED_PENDING],
      daysSinceLastVisit: 1,
      sentToday: true,
      history: [],
    },
    want: null,
  },
  {
    id: "验收 39 · 同一条经历同一规则 30 天内不重复",
    input: {
      candidates: [SHIPPED_PENDING],
      daysSinceLastVisit: 1,
      sentToday: false,
      history: [{ rule: "R2", atomId: "a-pending", daysAgo: 12, responded: true }],
    },
    want: null,
  },
  {
    id: "边界 · 同一规则换一条经历，30 天内可以问",
    input: {
      candidates: [
        SHIPPED_PENDING,
        { ...SHIPPED_PENDING, atomId: "a-other", title: "另一个项目" },
      ],
      daysSinceLastVisit: 1,
      sentToday: false,
      history: [{ rule: "R2", atomId: "a-pending", daysAgo: 12, responded: true }],
    },
    want: "R2:a-other",
  },
  {
    id: "边界 · 上次问了没回应，7 天内同一规则歇着",
    input: {
      candidates: [SHIPPED_PENDING, STALE],
      daysSinceLastVisit: 1,
      sentToday: false,
      history: [{ rule: "R2", atomId: "a-other", daysAgo: 3, responded: false }],
    },
    want: "R1:a-stale",
  },
  {
    id: "边界 · 没回应过了 8 天，同一规则可以再问",
    input: {
      candidates: [SHIPPED_PENDING],
      daysSinceLastVisit: 1,
      sentToday: false,
      history: [{ rule: "R2", atomId: "a-other", daysAgo: 8, responded: false }],
    },
    want: "R2:a-pending",
  },
  {
    id: "边界 · 14 天没来 → R3 压过 R2",
    input: {
      candidates: [STALE, SHIPPED_PENDING],
      daysSinceLastVisit: 20,
      sentToday: false,
      history: [],
    },
    want: "R3:a-pending",
  },
  {
    id: "边界 · 从没来过（null）不算久未登录",
    input: {
      candidates: [SHIPPED_PENDING],
      daysSinceLastVisit: null,
      sentToday: false,
      history: [],
    },
    want: "R2:a-pending",
  },
  {
    id: "边界 · 什么都不满足就闭嘴",
    input: { candidates: [FRESH], daysSinceLastVisit: 1, sentToday: false, history: [] },
    want: null,
  },
  {
    id: "边界 · 21 天整不算停滞（要「超过」）",
    input: {
      candidates: [{ ...STALE, daysSinceUpdate: 21 }],
      daysSinceLastVisit: 1,
      sentToday: false,
      history: [],
    },
    want: null,
  },
];

let pass = 0;
for (const c of CASES) {
  const got = pickNudge(c.input);
  const label = got === null ? null : `${got.rule}:${got.candidate.atomId}`;
  const okk = label === c.want;
  if (okk) pass++;
  console.log(
    `${okk ? "✓" : "✗"} ${c.id}` +
      (okk ? "" : `\n    期望 ${c.want ?? "不问"}，实得 ${label ?? "不问"}`),
  );
  if (okk && got !== null) console.log(`    追问原因：${got.reason}`);
}

console.log(`\n${pass} / ${CASES.length} 项通过`);
if (pass < CASES.length) process.exitCode = 1;


// ---------------------------------------------------------------
// --say：验收 40 —— 措辞里必须有具体项目名和天数，不许恭维、不许表情符号
// ---------------------------------------------------------------

if (process.argv.includes("--say")) {
  const { callLLM, setCallLogger } = await import("../src/lib/llm/core");
  const { NUDGE_SYSTEM, nudgeUser } = await import("../src/lib/llm/chat-prompts");
  setCallLogger(async () => {});

  const SAY: { id: string; reason: string; c: NudgeCandidate; statusLabel: string }[] = [
    {
      id: "R1 停滞",
      reason: "这条状态还停在开发中，已经 25 天没更新了",
      c: STALE,
      statusLabel: "开发中",
    },
    {
      id: "R2 数据待补",
      reason: "这条已经上线，但还有 2 项数据没填",
      c: SHIPPED_PENDING,
      statusLabel: "已上线",
    },
    {
      id: "R3 久未登录",
      reason: "用户 20 天没来了，这条是档案里最该更新的一条",
      c: SHIPPED_PENDING,
      statusLabel: "已上线",
    },
  ];

  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}~～]/u;
  const FLATTER = /(亲爱的|温馨提示|您好|棒|加油|辛苦了)/;

  let sayPass = 0;
  let sayTotal = 0;
  console.log("\n── 验收 40 · 措辞 ──");
  for (const s of SAY) {
    const r = await callLLM({
      tier: "light",
      purpose: "chat_nudge",
      system: NUDGE_SYSTEM,
      user: nudgeUser({
        reason: s.reason,
        atomTitle: s.c.title,
        status: s.statusLabel,
        daysSinceUpdate: s.c.daysSinceUpdate,
        pendingMetrics: s.c.pendingNames,
      }),
    });
    if (!r.ok) {
      console.log(`✗ ${s.id} 调用失败：${r.error}`);
      sayTotal += 5;
      continue;
    }
    const said = r.data.trim();
    const checks: [string, boolean][] = [
      ["不超过 40 字", [...said].length <= 40],
      ["带了项目名", said.includes(s.c.title.slice(0, 4))],
      ["带了天数", said.includes(String(s.c.daysSinceUpdate))],
      ["没有表情符号", !EMOJI.test(said)],
      ["没有恭维、不用「您」", !FLATTER.test(said) && !said.includes("您")],
    ];
    sayTotal += checks.length;
    sayPass += checks.filter(([, ok]) => ok).length;
    console.log(`${s.id}  [${r.usage.provider}]  ${[...said].length} 字`);
    console.log(`  「${said}」`);
    console.log("  " + checks.map(([n, ok]) => `${ok ? "✓" : "✗"} ${n}`).join("  "));
  }
  console.log(`\n措辞 ${sayPass} / ${sayTotal} 项通过`);
  if (sayPass < sayTotal) process.exitCode = 1;
}
