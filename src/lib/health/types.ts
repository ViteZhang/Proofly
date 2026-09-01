// =============================================================
// Proofly · 体检引擎的形状
//
// 《Step 8 施工提示词 v1.0》切片 8.1。
//
// 每个检查项一个文件，统一接口。检查函数不 import Next、不连库——
// 数据由调用方一次性喂进 HealthContext，检查只做判定。跟门禁
// （gate.ts）同一个理由：判定逻辑必须能脱库单测，否则「常驻地写错了
// 报不报、报什么级别」这种事只能靠肉眼在页面上看，看几遍就松了。
// =============================================================

import type { EvidenceLevel, EvidenceStrength, ProfileFactStatus } from "@/types/database";
import type { FactConflict } from "@/lib/domain";

export type HealthLevel = "blocking" | "warning" | "info";
export type HealthScope = "facts" | "skills" | "resume" | "cross_doc" | "atoms";

export type HealthIssue = {
  code: string;
  level: HealthLevel;
  /** 一句话说清是什么问题。列表里就看这一行。 */
  title: string;
  /** 展开说明 + 后果。不写后果的问题描述等于没写——用户不知道该不该管。 */
  detail: string;
  refIds: string[];
  /** 直达修复位置。带 query，不是页面名。 */
  resolveLink: string;
  /**
   * 跨扫描的身份。忽略记录靠它认人：check_results 每次扫描删了重写，
   * id 每次都变，认不了。
   */
  fingerprint: string;
  /** Phase 2 用。本步一律 false。 */
  autoFixable?: boolean;
};

export interface HealthCheck {
  code: string;
  level: HealthLevel;
  scope: HealthScope;
  /** 全部通过时列在「N 项检查通过」里的名字。 */
  label: string;
  /**
   * 深扫项要调模型，一次二十到六十秒，跑在后台作业里，不能挂在进页面上。
   * 它的 run() 返回空数组 —— 结果由作业写库，报告从库里读。
   */
  deep?: boolean;
  run(ctx: HealthContext): Promise<HealthIssue[]>;
}

// ---- 输入形状 ----
//
// 一次扫描把库读完，喂给所有检查项。检查项之间不许再各自去查库：
// 十项各查各的，一次进页面就是几十条查询。

export type HealthFact = {
  id: string;
  key: string;
  label: string;
  value: string | null;
  status: ProfileFactStatus;
  conflicts: FactConflict[];
  disclosureRule: string | null;
};

export type HealthMetric = {
  id: string;
  name: string;
  kind: "outcome" | "output";
  fromValue: string | null;
  toValue: string | null;
  delta: string | null;
  method: string | null;
  evidenceLevel: EvidenceLevel;
};

export type HealthAtom = {
  id: string;
  title: string;
  org: string | null;
  role: string | null;
  status: string;
  evidenceLevel: EvidenceLevel;
  situation: string | null;
  task: string | null;
  actions: string[];
  periodStart: string | null;
  periodEnd: string | null;
  metrics: HealthMetric[];
  updatedAt: string;
  /** 关联的源文档 id。C8 只扫两个及以上的。 */
  sourceDocIds: string[];
};

export type HealthSkill = {
  id: string;
  label: string;
  evidenceStrength: EvidenceStrength;
  /** 挂在哪些经历上。C2 的「去解决」要跳到能给它补证据的地方。 */
  atomIds: string[];
};

export type HealthTarget = { id: string; name: string };

/** 一份简历产物：基线或投递版本。C6 C7 都在这上面跑。 */
export type HealthResume = {
  kind: "baseline" | "version";
  id: string;
  targetId: string;
  targetName: string;
  /** 投递版本显示成「方向 · JD 公司」，基线就是「方向 · 基线」。 */
  label: string;
  renderedMd: string | null;
  blocks: { id: string; atomId: string | null; renderedText: string | null }[];
};

export type HealthSourceDoc = {
  id: string;
  filename: string;
  parsedText: string | null;
  ingestedAt: string | null;
};

/** 门禁在 Step 6 写下的结果。C2..C5 从这里汇总，不重新实现检测。 */
export type GateRow = {
  id: string;
  code: string | null;
  level: "blocking" | "warning" | "pass";
  title: string;
  detail: string | null;
  /** 'baseline:<id>' / 'version:<id>' */
  owner: string | null;
  blockId: string | null;
};

export type HealthContext = {
  facts: HealthFact[];
  atoms: HealthAtom[];
  skills: HealthSkill[];
  targets: HealthTarget[];
  resumes: HealthResume[];
  sourceDocs: HealthSourceDoc[];
  gateRows: GateRow[];
  interviewOutlines: { id: string; atomId: string | null; text: string }[];
  /** 判定「60 天未更新」的基准。传进来而不是取 Date.now()，测试才好写。 */
  now: Date;
};

// ---- 小工具 ----

export function blank(s: string | null | undefined): boolean {
  return !s || s.trim().length === 0;
}
