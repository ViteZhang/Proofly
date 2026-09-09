// =============================================================
// C11..C15 · 基本信息相关的五项检查
//
// 五项放在一个文件里：它们读的是同一批数据（educations / employments /
// profile_facts / user_profiles），拆成五个文件之后每个文件都只有十几行
// 判定，反而看不出它们其实在管同一件事。
//
// 分级的依据只有一条：**这个问题会不会让一份已经导出的简历是错的。**
//   C11 会 → 阻断
//   C12 C13 C14 会让下游判断失准 → 警告
//   C15 不会 → 提示，不计入问题数
// =============================================================

import { monthsBetween } from "@/lib/profile/labels";
import type { HealthCheck, HealthContext, HealthIssue } from "./types";

/** 空档超过这个月数就提醒。半年以下太常见，报出来只是噪音。 */
export const GAP_MONTHS = 6;

const EDU_HEADINGS = ["## 教育背景", "## 教育经历", "## 学历"];

/**
 * C11 · 简历里有教育段落，档案里却没有学历。
 *
 * 阻断级。这说明那段文字的来源不是档案 —— 要么是从旧简历里抄进来的，
 * 要么是模型编的。两种都属于溯源断裂：简历上印着一行没人能对得上账的
 * 学历，而这个产品的全部主张就是「每一句都有出处」。
 */
export const c11ResumeEducation: HealthCheck = {
  code: "C11",
  level: "blocking",
  scope: "resume",
  label: "简历里的学历都能在档案里对上",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    if (ctx.profile.educations.length > 0) return [];

    return ctx.resumes
      .filter((r) => EDU_HEADINGS.some((h) => (r.renderedMd ?? "").includes(h)))
      .map((r) => ({
        code: "C11",
        level: "blocking" as const,
        title: `「${r.label}」里有教育段落，档案里却没有学历`,
        detail:
          "这份简历里印着教育经历，但基本信息里一条学历都没有。\n\n" +
          "也就是说那段文字的出处不在档案里 —— 要么是从旧简历抄过来的，要么是生成时编的。" +
          "这个产品的全部主张是「每一句都有出处」，所以在补上学历之前，这份简历不给导出。\n\n" +
          "去基本信息填一条学历，然后重新生成这份简历。",
        refIds: [r.id],
        resolveLink: "/app/profile#education",
        fingerprint: `C11:${r.id}`,
        autoFixable: false,
      }));
  },
};

/**
 * C12 · 必填的基础信息缺项。
 *
 * 警告级，不阻断简历生成 —— 一份没写手机号的简历仍然是一份能看的简历，
 * 只是投出去没人联系得上。但缺项会直接影响 JD 匹配的准确度，所以要说。
 */
export const c12ProfileMissing: HealthCheck = {
  code: "C12",
  level: "warning",
  scope: "facts",
  label: "必填的基本信息都填了",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    const missing = ctx.profile.missingFactLabels;
    if (missing.length === 0) return [];

    return [
      {
        code: "C12",
        level: "warning" as const,
        title: `基本信息还差 ${missing.length} 项`,
        detail:
          `还没填：${missing.join("、")}。\n\n` +
          "这几项要么会原样印在简历抬头上，要么会影响 JD 匹配的准确度。不阻断生成，但缺着的时候" +
          "评估算出来的分数要打个折扣看。",
        // 缺项可能随时变，指纹只认「有缺项」这件事，不认具体是哪几项 ——
        // 否则每补一项就变成一条新问题，忽略记录也跟着失效。
        refIds: [],
        resolveLink: "/app/profile#identity",
        fingerprint: "C12:missing",
        autoFixable: false,
      },
    ];
  },
};

/**
 * C13 · 履历之间有说不清的空档。
 *
 * 警告级。面试官一定会问，那时候没准备好才是问题。这里只负责让它别在
 * 面试当天才第一次出现。
 */
export const c13EmploymentGap: HealthCheck = {
  code: "C13",
  level: "warning",
  scope: "facts",
  label: "工作履历没有说不清的空档",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    const sorted = [...ctx.profile.employments]
      .filter((e) => e.periodStart)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

    const out: HealthIssue[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      // 上一段还没结束就不算空档 —— 那是兼着两份，不是断档。
      if (!prev.periodEnd) continue;
      const months = monthsBetween(prev.periodEnd, cur.periodStart);
      if (months <= GAP_MONTHS) continue;

      out.push({
        code: "C13",
        level: "warning" as const,
        title: `${prev.org} 到 ${cur.org} 之间有 ${months} 个月空档`,
        detail:
          `${prev.org} 结束于 ${prev.periodEnd.slice(0, 7)}，${cur.org} 开始于 ${cur.periodStart.slice(0, 7)}，` +
          `中间空了 ${months} 个月。\n\n` +
          "面试时这一定会被问到。可能只是起止时间填错了 —— 那就去改；" +
          "如果是真的空档，想好怎么说，别在面试当天第一次想这个问题。",
        refIds: [prev.id, cur.id],
        resolveLink: "/app/profile#employment",
        fingerprint: `C13:${prev.id}:${cur.id}`,
        autoFixable: false,
      });
    }
    return out;
  },
};

/**
 * C14 · 同一家公司在履历表与经历里写法不一致。
 *
 * 警告级。简历上公司名取自履历表，而面试小抄、JD 匹配读的是经历里的
 * org。两处写法不同，等于同一段经历在两份材料里挂着两个东家。
 */
export const c14OrgMismatch: HealthCheck = {
  code: "C14",
  level: "warning",
  scope: "cross_doc",
  label: "公司名在履历与经历里写法一致",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    if (ctx.profile.employments.length === 0) return [];

    const known = new Set(ctx.profile.employments.map((e) => e.org.trim()));
    const orphan = new Map<string, string[]>();

    for (const a of ctx.atoms) {
      const org = a.org?.trim();
      if (!org || known.has(org)) continue;
      // 完全对不上才报。一方包含另一方（「润泽园」vs「润泽园教育科技」）
      // 通常是同一家的简称，报出来是噪音。
      const near = [...known].some((k) => k.includes(org) || org.includes(k));
      if (near) continue;
      const list = orphan.get(org) ?? [];
      list.push(a.title);
      orphan.set(org, list);
    }

    return [...orphan].map(([org, titles]) => ({
      code: "C14",
      level: "warning" as const,
      title: `经历里的「${org}」在工作履历里找不到`,
      detail:
        `有 ${titles.length} 条经历挂在「${org}」名下：${titles.slice(0, 3).join("、")}` +
        `${titles.length > 3 ? " 等" : ""}，但工作履历里没有这家公司。\n\n` +
        "简历上的公司名与起止时间取自工作履历，而 JD 匹配和面试小抄读的是经历里的写法。" +
        "两边对不上，同一段经历在两份材料里就挂着两个东家。\n\n" +
        "要么去工作履历补一条，要么把经历里的公司名改成一致的写法。",
      refIds: [],
      resolveLink: "/app/profile#employment",
      fingerprint: `C14:${org}`,
      autoFixable: false,
    }));
  },
};

/**
 * C15 · 账户显示名与档案姓名不一致。
 *
 * 提示级，不计入问题数 —— 用网名当显示名完全正当，这一条只是确保用户
 * 知道简历上印的是另一个名字，不做校验也不做拦截。
 */
export const c15DisplayName: HealthCheck = {
  code: "C15",
  level: "info",
  scope: "facts",
  label: "显示名与简历姓名的关系是清楚的",

  async run(ctx: HealthContext): Promise<HealthIssue[]> {
    const display = ctx.profile.displayName?.trim();
    const real = ctx.facts.find((f) => f.key === "name")?.value?.trim();
    if (!display || !real || display === real) return [];

    return [
      {
        code: "C15",
        level: "info" as const,
        title: `你的显示名是「${display}」，简历上印的是「${real}」`,
        detail:
          "这两个是不同的字段，各有各的用处：显示名只出现在这个界面里，简历上印的一直是档案姓名。\n\n" +
          "这一条只是让你知道有这回事，不用处理。要改简历上的名字，去基本信息。",
        refIds: [],
        resolveLink: "/app/profile#identity",
        fingerprint: "C15:display-name",
        autoFixable: false,
      },
    ];
  },
};
