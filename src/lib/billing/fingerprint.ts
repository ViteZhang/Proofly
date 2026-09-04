// =============================================================
// Proofly · 生成指纹
//
// 「24 小时内重新生成不扣分」要能回答一个问题：从上次生成到现在，
// 输入到底变没变。指纹就是那个答案。
//
// 指纹的形状是 `<core>.<promptVersion>`。比对时**只看 core** ——
// 提示词是我们改的，改完让用户重新花钱说不过去（技术方案 0.3）。
// promptVersion 仍然带在后面，因为排查问题时要知道那次是哪版提示词
// 生成的。
//
// 上游：《商业化技术方案 v1.0》0.3 ·《商业化 C1》切片 C1.4
// =============================================================

import { createHash } from "node:crypto";

/** 指纹的输入。按动作取用其中几项，见 FINGERPRINT_FIELDS。 */
export type FingerprintCtx = {
  /** 事实层版本号，quota_counters.fact_revision */
  factRevision?: number | null;
  /** 策略层版本号，quota_counters.strategy_revision */
  strategyRevision?: number | null;
  targetId?: string | null;
  jdId?: string | null;
  /** JD 文本或要求项的变更计数 */
  jdRevision?: number | null;
  resumeVersionId?: string | null;
  /** 任务生成：全部未解决 gap 的 id 集合 */
  gapIds?: string[] | null;
  /** 体检深扫：这一批扫的经历 id */
  atomIds?: string[] | null;
  /** 提示词版本。不参与比对，只随指纹存档。 */
  promptVersion?: string | null;
};

/**
 * 每个动作认哪几项。
 *
 * 少认一项 = 输入变了却判成没变 = 白给一次收费动作；
 * 多认一项 = 明明没变却判成变了 = 用户被重复收费。后者更伤，
 * 所以这张表按「真正影响输出的输入」逐个列，不图省事写个全集。
 */
const FINGERPRINT_FIELDS: Record<string, (keyof FingerprintCtx)[]> = {
  resume_baseline: ["factRevision", "strategyRevision", "targetId"],
  resume_delta: ["factRevision", "strategyRevision", "targetId", "jdId", "jdRevision"],
  resume_block: ["factRevision", "strategyRevision", "targetId", "resumeVersionId"],
  interview_kit: ["factRevision", "resumeVersionId"],
  target_assess: ["factRevision", "jdId", "jdRevision"],
  task_plan: ["gapIds"],
  health_deep_scan: ["factRevision", "atomIds"],
};

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return [...v].map(String).sort().join(",");
  return String(v);
}

/**
 * 算指纹。
 *
 * 没登记的动作返回空串 —— 表示「这个动作不参与重生成窗口」，
 * 而不是「指纹算不出来」。免费判定那边把空串当作不命中。
 */
export function computeFingerprint(actionCode: string, ctx: FingerprintCtx): string {
  const fields = FINGERPRINT_FIELDS[actionCode];
  if (!fields) return "";
  const body = fields.map((f) => `${f}=${norm(ctx[f])}`).join("|");
  const core = createHash("sha256").update(`${actionCode}|${body}`).digest("hex").slice(0, 32);
  return `${core}.${ctx.promptVersion ?? "v0"}`;
}

/** 指纹的比对部分。SQL 侧用的是 split_part(fingerprint,'.',1)，两边要一致。 */
export function fingerprintCore(fp: string | null | undefined): string {
  return (fp ?? "").split(".")[0] ?? "";
}

/** 只有提示词版本不同 → 视为同一个输入。 */
export function sameInput(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = fingerprintCore(a);
  return ca !== "" && ca === fingerprintCore(b);
}
