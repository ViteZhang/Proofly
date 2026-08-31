// =============================================================
// Proofly · 面试小抄
//
// 用途是面试前十分钟在手机上速览，不是重新学习。所以顺序不按题号，
// 按「现在最该看什么」：
//   1 岗位  2 必须提前想清楚的（高风险）  3 自己标了答不好的
//   4 核心数字速记  5 其余题目只列题干
//
// 第 4 块是方案之外加的：面试前最容易忘的就是具体数字和它的口径，
// 单独列一块比在题目里翻高效得多 —— 而口径正是被追问时唯一救得了你的东西。
// =============================================================

import type { QuestionView } from "@/lib/queries/interview";

export type CheatNumber = {
  atomTitle: string;
  name: string;
  value: string;
  method: string | null;
};

export type CheatSheet = {
  company: string;
  roleTitle: string;
  date: string;
  /** 高风险题，含应答骨架与「别做的事」。 */
  mustThink: QuestionView[];
  /** 自己标了「答不好」的，含备注。 */
  struggling: QuestionView[];
  numbers: CheatNumber[];
  /** 其余题目，只列题干。 */
  rest: QuestionView[];
};

export function buildCheatSheet(input: {
  company: string;
  roleTitle: string;
  questions: QuestionView[];
  numbers: CheatNumber[];
  today?: Date;
}): CheatSheet {
  const d = input.today ?? new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const mustThink = input.questions.filter((q) => q.riskLevel === "high");
  const seen = new Set(mustThink.map((q) => q.id));

  // 高风险且又标了答不好的，只在第 2 块出现一次 —— 小抄上同一道题
  // 出现两遍，读的人会以为是两道。
  const struggling = input.questions.filter(
    (q) => q.practiceStatus === "struggling" && !seen.has(q.id),
  );
  for (const q of struggling) seen.add(q.id);

  // 已练熟的不再列题干：小抄是给还没把握的题用的。
  const rest = input.questions.filter(
    (q) => !seen.has(q.id) && q.practiceStatus !== "practiced",
  );

  return {
    company: input.company,
    roleTitle: input.roleTitle,
    date,
    mustThink,
    struggling,
    numbers: input.numbers,
    rest,
  };
}

const KIND_LABEL: Record<string, string> = {
  project_probe: "项目深挖",
  product_case: "产品设计",
  ai_tech: "AI 技术",
  data_case: "数据分析",
};

function outlineLines(q: QuestionView): string[] {
  const lines = q.answerOutline.map((p) => `- **${p.label}** ${p.content}`);
  if (q.dontDo) lines.push(`- **⛔ 别做的事** ${q.dontDo}`);
  return lines;
}

export function renderCheatSheetMd(sheet: CheatSheet): string {
  const out: string[] = [];
  out.push(`# 面试小抄 · ${sheet.company} ${sheet.roleTitle}`.trim());
  out.push("");
  out.push(`${sheet.date} · 面试前十分钟看这一份`);
  out.push("");

  out.push("## 必须提前想清楚的");
  out.push("");
  if (sheet.mustThink.length === 0) {
    out.push("这一版没有高风险题。");
    out.push("");
  } else {
    for (const q of sheet.mustThink) {
      out.push(`### ${q.question}`);
      out.push("");
      if (q.riskReason) out.push(`> ${q.riskReason}`);
      if (q.fromAtomTitle) out.push(`> 来自 ${q.fromAtomTitle}`);
      out.push("");
      out.push(...outlineLines(q));
      out.push("");
    }
  }

  if (sheet.struggling.length > 0) {
    out.push("## 自己标了答不好的");
    out.push("");
    for (const q of sheet.struggling) {
      out.push(`### ${q.question}`);
      out.push("");
      if (q.practiceNote) out.push(`> 卡在：${q.practiceNote}`);
      out.push("");
      out.push(...outlineLines(q));
      out.push("");
    }
  }

  out.push("## 核心数字速记");
  out.push("");
  if (sheet.numbers.length === 0) {
    out.push("这份简历里没有实测指标。被问数字时直接说没有，不要估。");
    out.push("");
  } else {
    for (const n of sheet.numbers) {
      out.push(`- **${n.name}** ${n.value}｜${n.atomTitle}`);
      // 口径没填就说出来。面试前十分钟发现「这条我答不上归因」，
      // 比在面试里发现要好。
      out.push(`  - 口径：${n.method?.trim() || "没记口径 —— 被问怎么算的就如实说没有记录"}`);
    }
    out.push("");
  }

  if (sheet.rest.length > 0) {
    out.push("## 其余题目");
    out.push("");
    for (const q of sheet.rest) {
      out.push(`- [${KIND_LABEL[q.kind] ?? q.kind}] ${q.question}`);
    }
    out.push("");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** 面试小抄-{公司}-{日期}.{ext} */
export function cheatSheetFilename(company: string, date: string, ext: string): string {
  const safe = (company || "未填公司").replace(/[\\/:*?"<>|]/g, "");
  return `面试小抄-${safe}-${date}.${ext}`;
}
