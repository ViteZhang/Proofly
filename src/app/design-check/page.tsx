import type { CSSProperties } from "react";
import { Button } from "@/components/ui/Button";

/**
 * TEMPORARY design-token check page.
 * Renders every token for visual proofing. Delete at the end of Step 1.
 */

export const metadata = { title: "Design Check · Proofly" };

const COLORS: { group: string; items: { name: string; varName: string }[] }[] = [
  {
    group: "中性 Neutral",
    items: [
      { name: "ink", varName: "--ink" },
      { name: "ink-2", varName: "--ink-2" },
      { name: "slate", varName: "--slate" },
      { name: "mute", varName: "--mute" },
      { name: "line", varName: "--line" },
      { name: "line-soft", varName: "--line-soft" },
      { name: "bg", varName: "--bg" },
      { name: "card", varName: "--card" },
    ],
  },
  {
    group: "证明度 Proof（界面唯一语义色）",
    items: [
      { name: "proof", varName: "--proof" },
      { name: "proof-mid", varName: "--proof-mid" },
      { name: "proof-soft", varName: "--proof-soft" },
      { name: "ghost", varName: "--ghost" },
    ],
  },
  {
    group: "AI 标记",
    items: [
      { name: "ai", varName: "--ai" },
      { name: "ai-soft", varName: "--ai-soft" },
    ],
  },
  {
    group: "状态 Status",
    items: [
      { name: "warn", varName: "--warn" },
      { name: "warn-soft", varName: "--warn-soft" },
      { name: "danger", varName: "--danger" },
      { name: "danger-soft", varName: "--danger-soft" },
    ],
  },
];

// 四档证明标记 —— 单一色相四档形态（见交互方案 §2.3）
const dotBase: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 999,
  display: "inline-block",
  boxSizing: "border-box",
  flex: "none",
};
const PROOF_DOTS: { label: string; style: CSSProperties; textColor: string }[] = [
  {
    label: "实测",
    style: { ...dotBase, background: "var(--proof)" },
    textColor: "var(--proof)",
  },
  {
    label: "估算",
    style: {
      ...dotBase,
      border: "1.5px solid var(--proof-mid)",
      background:
        "linear-gradient(90deg, var(--proof-mid) 0 50%, transparent 50% 100%)",
    },
    textColor: "var(--proof-mid)",
  },
  {
    label: "仅设计",
    style: {
      ...dotBase,
      border: "1.5px solid var(--proof)",
      background: "var(--proof-soft)",
    },
    textColor: "var(--slate)",
  },
  {
    label: "无证据",
    style: { ...dotBase, border: "1.5px dashed var(--ghost)", background: "transparent" },
    textColor: "var(--mute)",
  },
];

const TYPE_LADDER: {
  role: string;
  sample: string;
  style: CSSProperties;
  display?: boolean;
  note: string;
}[] = [
  {
    role: "证明度主数字",
    sample: "46%",
    style: { fontSize: 52, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 },
    display: true,
    note: "52 / 600 · Space Grotesk · 字距 -0.03em",
  },
  {
    role: "页面标题",
    sample: "经历库",
    style: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" },
    display: true,
    note: "26 / 600 · 字距 -0.02em",
  },
  {
    role: "卡片标题",
    sample: "AI 作业点评 + AI 回应",
    style: { fontSize: 15, fontWeight: 600 },
    note: "15 / 600",
  },
  {
    role: "正文",
    sample: "把你说过的话，变成能被证明的事。行高 1.7 保证中文段落的呼吸感。",
    style: { fontSize: 14, fontWeight: 400, lineHeight: 1.7 },
    note: "14 / 400 · 行高 1.7",
  },
  {
    role: "次级",
    sample: "润泽园 · 2022.02 至今 · 已上线",
    style: { fontSize: 13, fontWeight: 400, color: "var(--slate)" },
    note: "13 / 400 · slate",
  },
  {
    role: "标签",
    sample: "#AI产品0→1  #留存优化",
    style: { fontSize: 11.5, fontWeight: 500, color: "var(--mute)" },
    note: "11.5 / 500 · mute",
  },
  {
    role: "微标签",
    sample: "EVIDENCE LEVEL",
    style: { fontSize: 10.5, fontWeight: 500, letterSpacing: "0.06em", color: "var(--mute)" },
    note: "10.5 / 500 · 字距 0.06em",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2
        className="font-display mb-5 text-[13px] font-medium uppercase"
        style={{ letterSpacing: "0.08em", color: "var(--mute)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignCheckPage() {
  return (
    <main
      className="min-h-screen px-8 py-10"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="mx-auto max-w-[1000px]">
        <header className="mb-10">
          <div className="font-display text-[26px] font-semibold tracking-tight">
            Proofly · Design Check
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--slate)" }}>
            设计令牌视觉校对页（临时，Step 1 结束时删除）
          </p>
        </header>

        {/* 颜色 */}
        <Section title="颜色 Colors">
          {COLORS.map((g) => (
            <div key={g.group} className="mb-6">
              <div className="mb-3 text-[13px]" style={{ color: "var(--slate)" }}>
                {g.group}
              </div>
              <div className="flex flex-wrap gap-3">
                {g.items.map((c) => (
                  <div
                    key={c.name}
                    className="overflow-hidden"
                    style={{
                      width: 132,
                      background: "var(--card)",
                      borderRadius: "var(--r-card)",
                      border: "1px solid var(--line)",
                      boxShadow: "var(--shadow-1)",
                    }}
                  >
                    <div style={{ height: 56, background: `var(${c.varName})` }} />
                    <div className="px-3 py-2">
                      <div className="font-display text-[13px] font-medium">{c.name}</div>
                      <div className="text-[11.5px]" style={{ color: "var(--mute)" }}>
                        {c.varName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        {/* 四档证明标记 */}
        <Section title="证明度四档标记 ProofDot">
          <div
            className="flex flex-wrap gap-8 p-6"
            style={{
              background: "var(--card)",
              borderRadius: "var(--r-card)",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            {PROOF_DOTS.map((d) => (
              <div key={d.label} className="flex items-center gap-2">
                <span style={d.style} />
                <span className="text-[13px] font-medium" style={{ color: d.textColor }}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
            始终成对出现：圆点 + 文字标签，不允许只用颜色传达状态。
          </p>
        </Section>

        {/* 字号阶梯 */}
        <Section title="字号阶梯 Type Scale">
          <div
            className="p-6"
            style={{
              background: "var(--card)",
              borderRadius: "var(--r-card)",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            {TYPE_LADDER.map((t) => (
              <div
                key={t.role}
                className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b py-4 last:border-0"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <div className="w-28 shrink-0 text-[11.5px]" style={{ color: "var(--mute)" }}>
                  {t.role}
                </div>
                <div className={t.display ? "font-display" : ""} style={t.style}>
                  {t.sample}
                </div>
                <div className="ml-auto text-[11.5px]" style={{ color: "var(--mute)" }}>
                  {t.note}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 按钮四种形态 */}
        <Section title="按钮四种形态 Buttons（交互色恒为 ink，禁用绿）">
          <div
            className="p-6"
            style={{
              background: "var(--card)",
              borderRadius: "var(--r-card)",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            {(["primary", "secondary", "text", "danger"] as const).map((v) => (
              <div key={v} className="mb-5 flex flex-wrap items-center gap-4 last:mb-0">
                <div className="w-24 text-[13px]" style={{ color: "var(--slate)" }}>
                  {v}
                </div>
                <Button variant={v} size="lg">
                  大 44
                </Button>
                <Button variant={v} size="md">
                  常规 36
                </Button>
                <Button variant={v} size="sm">
                  小 30
                </Button>
                <Button variant={v} size="md" disabled>
                  禁用
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* 圆角与阴影 */}
        <Section title="圆角与阴影 Radius & Shadow">
          <div className="flex flex-wrap gap-8">
            <div className="flex flex-wrap gap-4">
              {[
                { label: "r-card 14", v: "--r-card" },
                { label: "r-btn 10", v: "--r-btn" },
                { label: "r-pill 999", v: "--r-pill" },
              ].map((r) => (
                <div key={r.v} className="text-center">
                  <div
                    style={{
                      width: 96,
                      height: 64,
                      background: "var(--card)",
                      border: "1px solid var(--line)",
                      borderRadius: `var(${r.v})`,
                    }}
                  />
                  <div className="mt-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
                    {r.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-6">
              {[
                { label: "shadow-1", v: "--shadow-1" },
                { label: "shadow-2", v: "--shadow-2" },
                { label: "shadow-3", v: "--shadow-3" },
              ].map((s) => (
                <div key={s.v} className="text-center">
                  <div
                    style={{
                      width: 96,
                      height: 64,
                      background: "var(--card)",
                      borderRadius: "var(--r-card)",
                      boxShadow: `var(${s.v})`,
                    }}
                  />
                  <div className="mt-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
