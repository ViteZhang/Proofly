// =============================================================
// C6 · 文本产物里出现与权威值不符的表述
//
// 《Step 8》切片 8.2。这一项负责复现 v5 里那五处手工发现的冲突中的
// 三处：工作年限、常驻地、公司主体是否披露。
//
// 按 key 分类检测，不写通用算法——「常驻地」和「工作年限」的判法
// 完全不同，硬套一个通用比对只会两头都不准。
//
// 级别看它出现在哪儿：
//   简历产物（基线 / 投递版本）→ 阻断。这是要发出去的东西。
//   经历字段、源文档、应答骨架  → 警告。源文档是历史材料，里面写着
//     旧的常驻地是正常的，改不改都行，但简历里别带出来。
//
// 误报控制是这一项的命门：报错一次用户会去核对，报错三次他就不看了。
// 所以每条规则都宁可漏，不可滥——位置必须带「常驻/坐标/base 在」这类
// 标记词才认，年限必须紧跟职业词才认。
// =============================================================

import type { HealthCheck, HealthContext, HealthIssue, HealthLevel } from "./types";

// ---- 被扫的文本 ----

export type TextSource = {
  /** 'baseline' | 'version' 是简历产物，其余不是。 */
  kind: "baseline" | "version" | "atom" | "doc" | "interview";
  id: string;
  /** 人看得懂的位置，写进 title。 */
  where: string;
  text: string;
  resolveLink: string;
};

function isResumeProduct(s: TextSource): boolean {
  return s.kind === "baseline" || s.kind === "version";
}

function levelOf(s: TextSource): HealthLevel {
  return isResumeProduct(s) ? "blocking" : "warning";
}

const DOC_NOTE =
  "这是你上传的旧材料，改不改都行，但简历里别把它带出来 —— 抽取的时候它是原料，写简历的时候它不是依据。";

function tail(s: TextSource): string {
  if (isResumeProduct(s)) return "\n\n这是要发出去的简历，在改掉之前生成会被拦住。";
  if (s.kind === "doc") return `\n\n${DOC_NOTE}`;
  return "\n\n不阻断任何事，但简历是从这里长出来的，早晚会带出去。";
}

// ---- location ----

// 只认带标记词的位置表述。裸的城市名满篇都是（「北京大学」「上海分公司」），
// 见一个报一个就没人看了。
const PLACE_MARKERS = ["常驻", "坐标", "现居", "所在地", "居住地", "base 在", "Base 在", "base在"];

export const CITIES = [
  "北京","上海","广州","深圳","杭州","南京","成都","武汉","西安","苏州","天津","重庆",
  "长沙","郑州","青岛","合肥","福州","厦门","济南","大连","宁波","无锡","昆明","沈阳",
  "东莞","佛山","南昌","贵阳","南宁","石家庄","太原","哈尔滨","长春","温州","珠海",
  "香港","澳门","台北","新加坡","东京","首尔","纽约","伦敦","硅谷","旧金山","洛杉矶",
];

/** 找出文本里所有「标记词 + 城市」的说法。 */
export function statedCities(text: string): string[] {
  const out: string[] = [];
  for (const marker of PLACE_MARKERS) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(marker, from);
      if (at < 0) break;
      from = at + marker.length;
      // 标记词后面十个字以内出现的城市名才算这句话在说位置。
      const window = text.slice(from, from + 10);
      for (const city of CITIES) {
        if (window.includes(city)) out.push(city);
      }
    }
  }
  return [...new Set(out)];
}

/** 权威值可能写成「北京」「北京市」「中国北京」，取其中的城市名。 */
function cityOf(value: string): string | null {
  return CITIES.find((c) => value.includes(c)) ?? null;
}

// ---- years_of_experience ----

// 紧跟职业词才算。中间隔了标点就是另一句话了：
// 「项目做了 2 年，产品上线」里的 2 年说的是项目，不是资历。
const YEARS =
  /(\d+)\s*年\s*(?:的\s*)?(经验|从业|工作|互联网|产品|研发|技术|行业|资历|经历|PM|Product)/g;

export function statedYears(text: string): number[] {
  return [...text.matchAll(YEARS)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 60);
}

export function authoritativeYears(value: string): number | null {
  const m = value.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** ±1 之内不算冲突：「9 年」和「10 年」多半是取整方式不同，不是两种说法。 */
export const YEARS_TOLERANCE = 1;

// ---- name / phone / email ----

const PHONE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// ---- entity_disclosure ----

const NO_DISCLOSE = ["不主动披露", "不披露", "不提及", "不写", "隐去", "匿名"];

export function rulesAgainstDisclosure(rule: string | null): boolean {
  if (!rule) return false;
  return NO_DISCLOSE.some((w) => rule.includes(w));
}

// ---- 其余 key ----

/** 「标签：值」这种写死的字段。只有明确标注了才敢比对，否则全是误报。 */
export function labelledValue(text: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*[：:]\\s*([^\\s，。；、\\n]{1,30})`);
  const m = text.match(re);
  return m ? m[1] : null;
}

// ---- 主检查 ----

function issue(
  s: TextSource,
  factKey: string,
  title: string,
  body: string,
  refIds: string[],
): HealthIssue {
  return {
    code: "C6",
    level: levelOf(s),
    title,
    detail: body + tail(s),
    refIds,
    resolveLink: s.resolveLink,
    fingerprint: `C6:${factKey}:${s.kind}:${s.id}`,
    autoFixable: false,
  };
}

export function scanSource(ctx: HealthContext, s: TextSource): HealthIssue[] {
  const out: HealthIssue[] = [];
  const text = s.text;
  if (text.trim() === "") return out;

  for (const fact of ctx.facts) {
    const value = (fact.value ?? "").trim();

    if (fact.key === "entity_disclosure") {
      // 规则说不主动披露，那主体全称就不该出现在任何产物里。
      if (!rulesAgainstDisclosure(fact.disclosureRule) || value === "") continue;
      if (!text.includes(value)) continue;
      out.push(
        issue(
          s,
          fact.key,
          `${s.where}里出现了公司主体全称`,
          `你给「主体披露口径」定的规则是：${fact.disclosureRule}\n\n但这里写着「${value}」。`,
          [fact.id, s.id],
        ),
      );
      continue;
    }

    if (value === "") continue;

    if (fact.key === "location") {
      const authoritative = cityOf(value);
      if (!authoritative) continue;
      const conflicting = statedCities(text).filter((c) => c !== authoritative);
      if (conflicting.length === 0) continue;
      out.push(
        issue(
          s,
          fact.key,
          `${s.where}写的常驻地是「${conflicting.join("、")}」，事实台账写的是「${value}」`,
          `台账里「常驻地」的权威值是 ${value}，这里写的是 ${conflicting.join("、")}。\n\n面试官会按简历上写的地方安排面试。`,
          [fact.id, s.id],
        ),
      );
      continue;
    }

    if (fact.key === "years_of_experience") {
      const authoritative = authoritativeYears(value);
      if (authoritative === null) continue;
      const conflicting = [
        ...new Set(statedYears(text).filter((n) => Math.abs(n - authoritative) > YEARS_TOLERANCE)),
      ];
      if (conflicting.length === 0) continue;
      out.push(
        issue(
          s,
          fact.key,
          `${s.where}写的工作年限是 ${conflicting.join("、")} 年，事实台账写的是 ${value}`,
          `台账里「工作年限」的权威值是 ${value}，这里写的是 ${conflicting.map((n) => `${n} 年`).join("、")}。\n\n年限对不上是最容易被当场核算的一项 —— 面试官会拿它去对每段经历的起止时间。`,
          [fact.id, s.id],
        ),
      );
      continue;
    }

    if (fact.key === "phone" || fact.key === "email") {
      const re = fact.key === "phone" ? PHONE : EMAIL;
      const found = [...new Set([...text.matchAll(re)].map((m) => m[0]))].filter(
        (v) => v.toLowerCase() !== value.toLowerCase(),
      );
      if (found.length === 0) continue;
      out.push(
        issue(
          s,
          fact.key,
          `${s.where}里的${fact.label}是「${found.join("、")}」，事实台账写的是「${value}」`,
          `台账里的权威值是 ${value}。写错联系方式，前面做的一切都白做。`,
          [fact.id, s.id],
        ),
      );
      continue;
    }

    // name 与其余 key：只认明确标注的「标签：值」。
    // 从一段自由文本里认出「哪个词是姓名」做不到，硬猜必然误报。
    const stated = labelledValue(text, fact.label);
    if (stated === null || stated === value) continue;
    out.push(
      issue(
        s,
        fact.key,
        `${s.where}里的${fact.label}写的是「${stated}」，事实台账写的是「${value}」`,
        `台账里「${fact.label}」的权威值是 ${value}，这里写的是 ${stated}。`,
        [fact.id, s.id],
      ),
    );
  }

  return out;
}

/** 把库里的五类文本产物摊成待扫列表。 */
export function textSources(ctx: HealthContext): TextSource[] {
  const out: TextSource[] = [];

  for (const r of ctx.resumes) {
    if (!r.renderedMd) continue;
    out.push({
      kind: r.kind,
      id: r.id,
      where: r.label,
      text: r.renderedMd,
      resolveLink: `/app/resume?target=${r.targetId}`,
    });
  }

  for (const a of ctx.atoms) {
    const text = [a.situation, a.task, ...a.actions].filter(Boolean).join("\n");
    if (text.trim() === "") continue;
    out.push({
      kind: "atom",
      id: a.id,
      where: `经历「${a.title}」`,
      text,
      resolveLink: `/app/library?atom=${a.id}`,
    });
  }

  for (const d of ctx.sourceDocs) {
    if (!d.parsedText) continue;
    out.push({
      kind: "doc",
      id: d.id,
      where: `源材料《${d.filename}》`,
      text: d.parsedText,
      resolveLink: `/app/import`,
    });
  }

  for (const q of ctx.interviewOutlines) {
    out.push({
      kind: "interview",
      id: q.id,
      where: "面试题的应答骨架",
      text: q.text,
      resolveLink: `/app/interview`,
    });
  }

  return out;
}

export const c6FactDrift: HealthCheck = {
  code: "C6",
  level: "blocking",
  scope: "cross_doc",
  label: "文本产物与事实台账的口径一致",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    return textSources(ctx).flatMap((s) => scanSource(ctx, s));
  },
};
