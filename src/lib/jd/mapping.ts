// =============================================================
// Proofly · 一条要求对的是什么
//
// 学历、证书、年限这几类要求，答案不在经历里，在结构化档案里。拿它们去
// 跟经历做语义匹配，等于在一个所有候选人都有确切答案的维度上瞎猜 ——
// 而猜错的代价是一条假缺口加一条永远关不掉的任务。
//
// 判定放在代码里而不是加进提示词，三个理由：
//   1. 确定性。同一份 JD 解析十次要得到同样的 mapped_kind，不然「上次
//      说我学历满足，这次说不满足」会让人彻底不信这个分数。
//   2. 不加钱、不加一次调用、不增加整份解析因为多一个字段而校验失败的
//      风险。
//   3. 关键词表能被单测钉死，提示词不能。
//
// 纯函数，不 import Next、不连库。
// =============================================================

import type { MappedKind } from "@/types/database";

// 顺序即优先级：一句「本科及以上，有 PMP 证书者优先」先归学历。
// 学历是最常见、也最容易被误判成技能缺口的一类。
const RULES: { kind: MappedKind; re: RegExp }[] = [
  {
    kind: "education",
    re: /(学历|学位|本科|专科|大专|硕士|博士|研究生|统招|全日制|双一流|985|211|海归|留学|相关专业|计算机专业|理工科)/,
  },
  {
    kind: "credential",
    re: /(证书|资格证|执业|持证|职称|CET|四六级|雅思|托福|TOEFL|IELTS|PMP|CPA|CFA|ACCA|司法考试|法考|注册会计|教师资格)/i,
  },
  {
    kind: "employment",
    // 「5 年以上」「3-5 年经验」「大厂背景」这类：答案在履历表，不在某一条经历里
    re: /(\d+\s*年以上|\d+\s*[-~－]\s*\d+\s*年|工作年限|从业年限|一线大厂|知名互联网|行业背景|行业出身)/,
  },
  {
    kind: "profile_fact",
    re: /(常驻|驻地|base\s|工作地点|可接受出差|接受外派|户口|户籍)/i,
  },
];

/**
 * 归类一条要求。默认是 skill —— 判不准就当技能，走原来那条路，
 * 那条路至少不会凭空造出一条关不掉的任务。
 */
export function classifyRequirement(text: string, rawPhrase?: string | null): MappedKind {
  const hay = `${text} ${rawPhrase ?? ""}`;
  for (const r of RULES) {
    if (r.re.test(hay)) return r.kind;
  }
  return "skill";
}

/**
 * 这条要求要不要走硬门槛那条路。
 *
 * 只有 hard 的学历 / 证书类才走：
 *   · implicit 是模型反推出来的，反推出一条「隐含要求本科学历」然后据此
 *     判人不合格，太重了；
 *   · nice_to_have 本来就是加分项，不满足不构成门槛；
 *   · employment（年限）与 profile_fact 暂不拦，年限可以由经历侧支撑，
 *     判成硬门槛会误伤「活儿干得多但工龄短」的人。
 */
export function isHardGate(kind: string, mapped: MappedKind): boolean {
  return kind === "hard" && (mapped === "education" || mapped === "credential");
}
