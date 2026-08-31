"use client";

// =============================================================
// Proofly · 面试小抄视图
//
// 跟简历打印页不同：这一份不是给 ATS 看的，是给人在手机上、面试前
// 十分钟看的。所以反过来优化 —— 字号偏大、行距宽松、单栏、段与段之间
// 留白多，扫一眼就能定位。
//
// 顺序即优先级：高风险 → 自己标了答不好的 → 核心数字 → 其余只列题干。
// 已练熟的不列 —— 小抄是给还没把握的题用的。
// =============================================================

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CheatSheet } from "@/lib/interview/cheatsheet";
import type { QuestionView } from "@/lib/queries/interview";

const KIND_LABEL: Record<string, string> = {
  project_probe: "项目深挖",
  product_case: "产品设计",
  ai_tech: "AI 技术",
  data_case: "数据分析",
};

const CSS = `
.cheat-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: auto;
  background: #fff;
  color: #12141a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  /* 手机上读的，所以比简历那份大两号，行距也放宽 */
  font-size: 13pt;
  line-height: 1.75;
}
/* 这一页只有小抄。应用外壳（顶栏的搜索框）在 390px 的手机上会把
   文档撑到 452px，读的时候要左右划 —— 外壳被 .cheat-root 整个盖住，
   它的横向溢出对这一页没有任何意义，直接锁掉。 */
html, body { overflow-x: hidden; }
.cheat-root * { box-sizing: border-box; }
/* box-sizing 必须是 border-box：默认的 content-box 会让 padding 加在
   宽度之外，390px 的手机上整页横向溢出 62px —— 那就得左右划着读了。 */
.cheat-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 150mm;
  margin: 0 auto;
  padding: 12mm 5mm 20mm;
  overflow-wrap: anywhere;
}
@media (min-width: 480px) { .cheat-page { padding-left: 10mm; padding-right: 10mm; } }
.cheat-note {
  margin: 0 0 8mm;
  padding: 10px 12px;
  border: 1px solid #d7dbe3;
  border-radius: 8px;
  font-size: 11pt;
  color: #5a6270;
}
.cheat-note button, .cheat-note a {
  display: inline-block;
  margin-left: 10px;
  padding: 5px 12px;
  border: 1px solid #12141a;
  border-radius: 6px;
  background: #12141a;
  color: #fff;
  font-size: 11pt;
  text-decoration: none;
  cursor: pointer;
}
.cheat-note a.ghost { background: #fff; color: #12141a; }
.cheat-root h1 { font-size: 19pt; font-weight: 700; margin: 0 0 2mm; line-height: 1.35; }
.cheat-root .sub { font-size: 11pt; color: #4b5260; margin: 0 0 8mm; }
.cheat-root h2 {
  font-size: 14pt;
  font-weight: 700;
  margin: 10mm 0 3mm;
  padding-bottom: 1.5mm;
  border-bottom: 2px solid #12141a;
}
.cheat-root h3 { font-size: 13pt; font-weight: 700; margin: 6mm 0 2mm; line-height: 1.5; }
.cheat-root .why { font-size: 11pt; color: #8a2f2f; margin: 0 0 2mm; }
.cheat-root .from { font-size: 11pt; color: #4b5260; margin: 0 0 2mm; }
.cheat-root ul { margin: 0 0 3mm 6mm; padding: 0; list-style: disc outside; }
.cheat-root li { margin: 0 0 2mm; }
.cheat-root li .label { font-weight: 700; }
.cheat-root li.dont .label { color: #8a2f2f; }
.cheat-root .num { margin: 0 0 3mm; }
.cheat-root .num .caliber { font-size: 11.5pt; color: #4b5260; }
.cheat-root .rest { font-size: 12pt; }
.cheat-root .empty { color: #4b5260; }

@page { size: A4; margin: 14mm; }

@media print {
  [data-chrome] { display: none !important; }
  main { padding: 0 !important; }
  html, body { background: #fff !important; }
  .cheat-root { position: static; overflow: visible; }
  .cheat-page { max-width: none; margin: 0; padding: 0; }
  .cheat-note { display: none !important; }
  .cheat-root h2, .cheat-root h3 { break-after: avoid; page-break-after: avoid; }
  .cheat-root section { break-inside: avoid-page; }
}
`;

function Outline({ q }: { q: QuestionView }) {
  if (q.answerOutline.length === 0 && !q.dontDo) return null;
  return (
    <ul>
      {q.answerOutline.map((p, i) => (
        <li key={i}>
          <span className="label">{p.label}</span>　{p.content}
        </li>
      ))}
      {q.dontDo && (
        <li className="dont">
          <span className="label">⛔ 别做的事</span>　{q.dontDo}
        </li>
      )}
    </ul>
  );
}

export function CheatSheetView({
  sheet,
  kitId,
  versionId,
}: {
  sheet: CheatSheet;
  kitId: string;
  versionId: string;
}) {
  const printed = useRef(false);

  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="cheat-root">
      <style>{CSS}</style>
      <div className="cheat-page">
        <div className="cheat-note">
          在打印对话框里把「页眉页脚」关掉，保存为 PDF，存到手机上。
          <button type="button" onClick={() => window.print()}>
            打印
          </button>
          <a href={`/interview/${kitId}/export`}>下载 MD</a>
          <Link className="ghost" href={`/interview?v=${versionId}`}>
            返回
          </Link>
        </div>

        <h1>
          面试小抄 · {sheet.company} {sheet.roleTitle}
        </h1>
        <p className="sub">{sheet.date} · 面试前十分钟看这一份</p>

        <section>
          <h2>必须提前想清楚的</h2>
          {sheet.mustThink.length === 0 ? (
            <p className="empty">这一版没有高风险题。</p>
          ) : (
            sheet.mustThink.map((q) => (
              <div key={q.id}>
                <h3>{q.question}</h3>
                {q.riskReason && <p className="why">{q.riskReason}</p>}
                {q.fromAtomTitle && <p className="from">来自 {q.fromAtomTitle}</p>}
                <Outline q={q} />
              </div>
            ))
          )}
        </section>

        {sheet.struggling.length > 0 && (
          <section>
            <h2>自己标了答不好的</h2>
            {sheet.struggling.map((q) => (
              <div key={q.id}>
                <h3>{q.question}</h3>
                {q.practiceNote && <p className="why">卡在：{q.practiceNote}</p>}
                <Outline q={q} />
              </div>
            ))}
          </section>
        )}

        <section>
          <h2>核心数字速记</h2>
          {sheet.numbers.length === 0 ? (
            <p className="empty">这份简历里没有实测指标。被问数字时直接说没有，不要估。</p>
          ) : (
            sheet.numbers.map((n, i) => (
              <p className="num" key={i}>
                <strong>{n.name}</strong>　{n.value}　<span className="caliber">｜{n.atomTitle}</span>
                <br />
                <span className="caliber">
                  口径：{n.method?.trim() || "没记口径 —— 被问怎么算的就如实说没有记录"}
                </span>
              </p>
            ))
          )}
        </section>

        {sheet.rest.length > 0 && (
          <section>
            <h2>其余题目</h2>
            <ul className="rest">
              {sheet.rest.map((q) => (
                <li key={q.id}>
                  [{KIND_LABEL[q.kind] ?? q.kind}] {q.question}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
