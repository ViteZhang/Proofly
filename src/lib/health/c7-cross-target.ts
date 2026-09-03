// =============================================================
// C7 · 同一经历在不同方向的简历里说法不一致
//
// 《Step 8》切片 8.3。本步最有价值的新增检查。
//
// 你投两个方向，同一段经历会出现在两份简历里。**措辞按方向调整是对的，
// 数字和职责动词不能变。** C 端简历写「主导」、Agent 简历写「参与」，
// 两家公司的面试官如果交流过，或者你自己复盘时对不上，都是硬伤。
//
// 一律阻断。两份简历说法不一没有「可忽略」的情况。
//
// 两项检查：
//   数字一致性 —— 只比对同时出现在两处的数字。render_weight 不同导致
//     的数量差异是正常的（expand 写三个数字，brief 只写一个）。
//   职责动词一致性 —— 强度不得跨级。同级替换（主导↔负责）允许。
// =============================================================

import type { HealthCheck, HealthContext, HealthIssue, HealthResume } from "./types";

// ---- 职责动词强度 ----

export const ROLE_VERBS: Record<number, string[]> = {
  4: ["主导", "负责", "牵头", "Own", "own"],
  3: ["设计", "规划", "制定", "主持"],
  2: ["参与", "协作", "配合"],
  1: ["支持", "协助", "辅助"],
};

/**
 * 这段话的职责动词 —— 取**最先出现**的那个，不是最强的。
 *
 * 简历的 bullet 是以职责动词开头的：「参与 AI 模块规划，协助设计意图路由」，
 * 开头的「参与」才是这段的自我定位，后面的「规划」「设计」说的是做了什么事。
 * 取最强的会把这句读成 3 级，跟「主导」比只差一级，跨级检查就漏了。
 *
 * 同一位置上有多个动词时取强的那个（不会发生，但排序要确定）。
 */
export function verbStrength(text: string): { level: number; verb: string } | null {
  let best: { level: number; verb: string; at: number } | null = null;
  for (const lv of [4, 3, 2, 1]) {
    for (const v of ROLE_VERBS[lv]) {
      const at = text.indexOf(v);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && lv > best.level)) {
        best = { level: lv, verb: v, at };
      }
    }
  }
  return best ? { level: best.level, verb: best.verb } : null;
}

// ---- 数字 ----

// 百分比、倍数、计数都要。「5%」「3 倍」「12 人」「4 万 DAU」。
const NUMBER = /\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|千|人|次|个|天|周|月|年)?/g;

/** 归一化：去掉空格，全角百分号统一成半角，小数末尾的 0 抹掉。 */
export function normalizeNumber(raw: string): string {
  const s = raw.replace(/\s+/g, "").replace("％", "%");
  const m = s.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!m) return s;
  const n = Number(m[1]);
  return `${Number.isInteger(n) ? n : n}${m[2]}`;
}

export function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(NUMBER)].map((m) => normalizeNumber(m[0])));
}

/**
 * 只比对同时出现在两处的数字 —— 按「数值 + 单位」里的单位配对。
 * 一处写「人效提升 75%」另一处写「70%」是冲突；一处写三个数字另一处
 * 只写一个，那一个对得上就不算冲突。
 */
export function conflictingNumbers(a: string, b: string): { unit: string; a: string; b: string }[] {
  const parse = (t: string) =>
    [...t.matchAll(NUMBER)].map((m) => {
      const s = normalizeNumber(m[0]);
      const mm = s.match(/^(\d+(?:\.\d+)?)(.*)$/);
      return { value: mm?.[1] ?? s, unit: mm?.[2] ?? "" };
    });

  const byUnit = (list: ReturnType<typeof parse>) => {
    const map = new Map<string, Set<string>>();
    for (const x of list) {
      // 无单位的裸数字不参与比对：年份、序号、条数太多，比了全是噪声。
      if (x.unit === "") continue;
      const set = map.get(x.unit) ?? new Set<string>();
      set.add(x.value);
      map.set(x.unit, set);
    }
    return map;
  };

  const ma = byUnit(parse(a));
  const mb = byUnit(parse(b));
  const out: { unit: string; a: string; b: string }[] = [];

  for (const [unit, va] of ma) {
    const vb = mb.get(unit);
    if (!vb) continue; // 只在一处出现 → 是详略差异，不是冲突
    // 两边各自的取值集合有交集就算对得上（expand 写了三个，brief 写了其中一个）
    const shared = [...va].some((x) => vb.has(x));
    if (shared) continue;
    out.push({ unit, a: [...va].join("、"), b: [...vb].join("、") });
  }
  return out;
}

// ---- 主检查 ----

type Appearance = { resume: HealthResume; blockId: string; text: string };

/** 同一经历在各份简历里的出场。同一份简历里同一条经历只取第一块。 */
export function appearancesByAtom(ctx: HealthContext): Map<string, Appearance[]> {
  const map = new Map<string, Appearance[]>();
  for (const r of ctx.resumes) {
    const seen = new Set<string>();
    for (const b of r.blocks) {
      if (!b.atomId || !b.renderedText || b.renderedText.trim() === "") continue;
      if (seen.has(b.atomId)) continue;
      seen.add(b.atomId);
      const list = map.get(b.atomId) ?? [];
      list.push({ resume: r, blockId: b.id, text: b.renderedText });
      map.set(b.atomId, list);
    }
  }
  return map;
}

function quote(a: Appearance): string {
  return `${a.resume.label}\n  ${a.text.replace(/\n/g, "\n  ")}`;
}

function link(a: Appearance, other: Appearance): string {
  return `/app/resume?target=${a.resume.targetId}&block=${a.blockId}&compare=${other.resume.targetId}`;
}

export const c7CrossTarget: HealthCheck = {
  code: "C7",
  level: "blocking",
  scope: "cross_doc",
  label: "同一经历在各方向简历里说法一致",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    const out: HealthIssue[] = [];
    const titleOf = new Map(ctx.atoms.map((a) => [a.id, a.title]));

    for (const [atomId, apps] of appearancesByAtom(ctx)) {
      if (apps.length < 2) continue;
      const title = titleOf.get(atomId) ?? "这条经历";

      // 两两比对。同一对只报一次，所以内层从 i+1 开始。
      for (let i = 0; i < apps.length; i++) {
        for (let j = i + 1; j < apps.length; j++) {
          const a = apps[i];
          const b = apps[j];
          // 同一个方向的基线与投递版本本来就该不同——delta 就是干这个的。
          if (a.resume.targetId === b.resume.targetId) continue;

          const va = verbStrength(a.text);
          const vb = verbStrength(b.text);
          if (va && vb && va.level !== vb.level) {
            out.push({
              code: "C7",
              level: "blocking",
              title: `「${title}」在两个方向的简历里说法不一样`,
              detail:
                `${quote(a)}\n\n${quote(b)}\n\n` +
                `职责动词从「${va.verb}」变成了「${vb.verb}」，强度差 ${Math.abs(va.level - vb.level)} 级。\n` +
                `两家的面试官如果交流过，这就是硬伤。`,
              refIds: [atomId, a.blockId, b.blockId],
              resolveLink: link(a, b),
              fingerprint: `C7:verb:${atomId}:${a.resume.targetId}:${b.resume.targetId}`,
              autoFixable: false,
            });
          }

          for (const c of conflictingNumbers(a.text, b.text)) {
            out.push({
              code: "C7",
              level: "blocking",
              title: `「${title}」的数字在两个方向的简历里对不上`,
              detail:
                `${quote(a)}\n\n${quote(b)}\n\n` +
                `同一个口径（${c.unit}）在两处写的是 ${c.a}${c.unit} 与 ${c.b}${c.unit}。\n` +
                `措辞按方向调整是对的，数字不能变。`,
              refIds: [atomId, a.blockId, b.blockId],
              resolveLink: link(a, b),
              fingerprint: `C7:num:${c.unit}:${atomId}:${a.resume.targetId}:${b.resume.targetId}`,
              autoFixable: false,
            });
          }
        }
      }
    }

    return out;
  },
};
