// =============================================================
// Proofly · 简历正文渲染
//
// 一份 Markdown 同时是三样东西：导出的文件、rendered_md 的内容、
// 打印页的数据来源。所以它必须是纯函数 —— 三处渲染出来的东西
// 只要有一处不一样，用户就会怀疑导出的不是他看到的那份。
//
// ATS 硬性要求在这里就开始：不用表格、不用装饰符号、每条 bullet
// 是独立的一行「- 」，不是伪造的圆点字符。
// =============================================================

export type RenderBlock = {
  section: string;
  title: string;
  meta: string;
  summary: string;
  bullets: string[];
};

export type ResumeDoc = {
  name: string;
  contact: string[];
  headline: string;
  blocks: RenderBlock[];
  skills: string[];
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
  for (const b of doc.blocks) {
    if (b.section !== section) {
      section = b.section;
      out.push("");
      out.push(`## ${section}`);
    }
    out.push("");
    // 标题与时间同一行，中间用空格分隔。ATS 对「标题 | 时间」这种
    // 竖线分隔的解析不稳，而两段之间的空格它一定认得。
    out.push(`### ${[b.title, b.meta].filter((s) => s && s.trim() !== "").join("　")}`);
    if (b.summary.trim() !== "") out.push(b.summary.trim());
    for (const line of b.bullets) {
      if (line.trim() === "") continue;
      out.push(`- ${line.trim()}`);
    }
  }

  if (doc.skills.length > 0) {
    out.push("");
    out.push("## 技能");
    out.push(doc.skills.join("、"));
  }

  return out.join("\n") + "\n";
}

/** 导出文件名：{姓名}-{岗位}-{日期}.md */
export function exportFilename(name: string, role: string, ext: "md" | "pdf"): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 24) || "简历";
  return `${safe(name)}-${safe(role)}-${date}.${ext}`;
}
