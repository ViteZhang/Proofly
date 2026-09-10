// =============================================================
// Proofly · 简历正文渲染
//
// 一份 Markdown 同时是三样东西：导出的文件、rendered_md 的内容、
// 打印页的数据来源。所以它必须是纯函数 —— 三处渲染出来的东西
// 只要有一处不一样，用户就会怀疑导出的不是他看到的那份。
//
// ATS 硬性要求在这里就开始：不用表格、不用装饰符号、每条 bullet
// 是独立的一行「- 」，不是伪造的圆点字符。
//
// 分组与去重不在这里算，在 layout.ts 里 —— 打印视图要用同一套。
// =============================================================

import {
  employmentHeading,
  itemHeading,
  layoutResume,
  type LayoutBlock,
} from "./layout";
import { groupSkills } from "@/lib/skills/taxonomy";

/** 版面分组要的字段都在 LayoutBlock 上。这里只是给它一个简历语境下的名字。 */
export type RenderBlock = LayoutBlock;

export { layoutResume } from "./layout";

/**
 * 同一个 section 的块排在一起，section 之间按第一次出现的先后。
 *
 * 拖拽排序允许把一块拖到另一个 section 中间去，渲染时如果照单全收，
 * 「工作经历」这个标题就会在一份简历里出现两次 —— ATS 会把它当成
 * 两段互不相干的经历，而人读起来只觉得排版坏了。
 *
 * layoutResume 内部做的是同一件事外加雇主分组；这个泛型版本留给只需要
 * 排序、不需要分组的调用方（块的持久化顺序、拖拽面板）。
 */
export function groupBySection<T extends { section: string }>(blocks: T[]): T[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const b of blocks) {
    if (!buckets.has(b.section)) {
      buckets.set(b.section, []);
      order.push(b.section);
    }
    buckets.get(b.section)!.push(b);
  }
  return order.flatMap((s) => buckets.get(s)!);
}

/** 教育背景 / 证书段落的一行。不从 atom 来，见 profile-sections。 */
export type ProfileLine = { main: string; when: string };

export type ResumeDoc = {
  name: string;
  contact: string[];
  headline: string;
  blocks: RenderBlock[];
  skills: string[];
  educations?: ProfileLine[];
  credentials?: ProfileLine[];
};

export function renderMarkdown(doc: ResumeDoc): string {
  const out: string[] = [];

  out.push(`# ${doc.name || "简历"}`);
  const contact = doc.contact.filter((s) => s.trim() !== "");
  if (contact.length > 0) out.push(contact.join(" · "));
  if (doc.headline.trim() !== "") {
    out.push("");
    out.push(doc.headline.trim());
  }

  let section = "";
  for (const g of layoutResume(doc.blocks)) {
    if (g.section !== section) {
      section = g.section;
      out.push("");
      out.push(`## ${section}`);
    }

    if (g.employment) {
      out.push("");
      // 一段任职一个 ###。项目降一级用加粗，不用 #### —— ATS 对四级标题的
      // 解析不稳，而加粗它一定当成普通文本读，读到的仍然是那句话。
      out.push(`### ${employmentHeading(g.employment)}`);
    }

    for (const item of g.items) {
      const heading = itemHeading(item, g.employment);
      if (!g.employment) {
        out.push("");
        // 标题与时间同一行，中间用空格分隔。ATS 对「标题 | 时间」这种
        // 竖线分隔的解析不稳，而两段之间的空格它一定认得。
        out.push(`### ${heading}`);
      } else if (heading !== "") {
        out.push("");
        out.push(`**${heading}**`);
      }
      if (item.summary.trim() !== "") out.push(item.summary.trim());
      for (const line of item.bullets) {
        if (line.trim() === "") continue;
        out.push(`- ${line.trim()}`);
      }
    }
  }

  // 教育背景排在经历之后、技能之前。这是中文简历里最常见的顺序，而
  // ATS 认的是标题文字本身，不是位置 —— 位置只影响人读起来顺不顺。
  section2(out, "教育背景", doc.educations);

  const skillGroups = groupSkills(doc.skills);
  if (skillGroups.length > 0) {
    out.push("");
    out.push("## 技能");
    for (const g of skillGroups) {
      out.push(`- **${g.category}**：${g.items.join(" · ")}`);
    }
  }

  section2(out, "证书与语言", doc.credentials);

  return out.join("\n") + "\n";
}

/**
 * 教育背景 / 证书这类「一行一条」的段落。
 * 每条仍然是独立的一行「- 」，跟 bullet 同一套写法 —— ATS 对列表的
 * 解析是稳的，对两列排版不是。
 */
function section2(out: string[], title: string, lines: ProfileLine[] | undefined): void {
  if (!lines || lines.length === 0) return;
  out.push("");
  out.push(`## ${title}`);
  for (const l of lines) {
    if (l.main.trim() === "") continue;
    out.push(`- ${[l.main, l.when].filter((s) => s && s.trim() !== "").join("　")}`);
  }
}

/** 导出文件名：{姓名}-{岗位}-{日期}.md */
export function exportFilename(name: string, role: string, ext: "md" | "pdf"): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 24) || "简历";
  return `${safe(name)}-${safe(role)}-${date}.${ext}`;
}
