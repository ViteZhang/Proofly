"use client";

// =============================================================
// Proofly · 打印视图
//
// ATS 硬性要求全部落在这里，一条不少：
//   单栏、不用 table 排版、不用 background-color 传达信息、
//   系统字体（不嵌 Space Grotesk —— ATS 对特殊字体解析不稳）、
//   每条 bullet 是真实的 <li>，不是伪造的圆点字符。
//
// 屏幕上盖住整个应用外壳，打印时把外壳（[data-chrome]）藏掉。
// =============================================================

import { useEffect, useRef } from "react";
import { groupBySection } from "@/lib/resume/markdown";
import type { PrintDoc } from "@/lib/queries/resume";

const CSS = `
.print-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: auto;
  background: #fff;
  color: #12141a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 10.5pt;
  line-height: 1.62;
}
.print-page { max-width: 190mm; margin: 0 auto; padding: 18mm 16mm 24mm; }
.print-note {
  margin: 0 0 14mm;
  padding: 10px 12px;
  border: 1px solid #d7dbe3;
  border-radius: 8px;
  font-size: 9.5pt;
  color: #5a6270;
}
.print-note button {
  margin-left: 10px;
  padding: 4px 10px;
  border: 1px solid #12141a;
  border-radius: 6px;
  background: #12141a;
  color: #fff;
  font-size: 9.5pt;
  cursor: pointer;
}
.print-root h1 { font-size: 17pt; font-weight: 700; margin: 0 0 2mm; }
.print-root .contact { font-size: 9.5pt; color: #4b5260; margin: 0 0 4mm; }
.print-root .headline { margin: 0 0 5mm; }
.print-root h2 {
  font-size: 11pt;
  font-weight: 700;
  margin: 6mm 0 2mm;
  padding-bottom: 1mm;
  border-bottom: 1px solid #c9cfd8;
}
.print-root h3 { font-size: 10.5pt; font-weight: 700; margin: 3.5mm 0 1mm; }
.print-root h3 .meta { font-weight: 400; color: #4b5260; }
.print-root ul { margin: 0 0 0 5mm; padding: 0; list-style: disc outside; }
.print-root li { margin: 0 0 1mm; }
.print-root p { margin: 0 0 1.5mm; }

@page { size: A4; margin: 18mm; }

@media print {
  [data-chrome] { display: none !important; }
  main { padding: 0 !important; }
  html, body { background: #fff !important; }
  .print-root { position: static; overflow: visible; }
  .print-page { max-width: none; margin: 0; padding: 0; }
  .print-note { display: none !important; }
  .print-root h2, .print-root h3 { break-after: avoid; page-break-after: avoid; }
  .print-root section { break-inside: avoid-page; }
}
`;

export function PrintView({ doc }: { doc: PrintDoc }) {
  const printed = useRef(false);

  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    // 等字体与排版稳定再唤起打印，否则第一页可能少半行。
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  // section 标题在渲染前先算好。渲染过程里改外部变量在 React 19 里
  // 是明确禁止的，而且它本来就是一个纯派生。
  const ordered = groupBySection(doc.blocks);
  const rows = ordered.map((b, i) => ({
    block: b,
    head: i === 0 || ordered[i - 1].section !== b.section,
  }));

  return (
    <div className="print-root">
      <style>{CSS}</style>
      <div className="print-page">
        <div className="print-note">
          在打印对话框里把「页眉页脚」关掉，「背景图形」关掉，保存为 PDF。
          <button type="button" onClick={() => window.print()}>
            打印
          </button>
        </div>

        <h1>{doc.name || "简历"}</h1>
        {doc.contact.length > 0 && <p className="contact">{doc.contact.join(" · ")}</p>}
        {doc.headline && <p className="headline">{doc.headline}</p>}

        {rows.map(({ block: b, head }) => {
          return (
            <section key={b.id}>
              {head && <h2>{b.section}</h2>}
              <h3>
                {b.title}
                {b.meta && <span className="meta">　{b.meta}</span>}
              </h3>
              {b.summary && <p>{b.summary}</p>}
              {b.bullets.length > 0 && (
                <ul>
                  {b.bullets.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {doc.skills.length > 0 && (
          <section>
            <h2>技能</h2>
            <p>{doc.skills.join("、")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
