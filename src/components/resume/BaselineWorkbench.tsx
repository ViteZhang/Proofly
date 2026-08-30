"use client";

// =============================================================
// Proofly · 基线工作台（S8-A 主体）
//
// 左边是简历本身，右边是「为什么是这样」。右边这一半才是这个产品
// 跟一个简历生成器的区别：每一句话都能查到出处，每一条没出现的经历
// 都说得出是被哪条规则筛掉的。
//
// 生成过程分两段真实的步骤：选材（代码，瞬时）→ 渲染（模型，十几秒）。
// 选材结果先出来，等待期间用户至少知道这份简历会由哪几条经历构成。
// =============================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProofDot } from "@/components/library/ProofDot";
import { EVIDENCE_LABEL } from "@/lib/domain";
import { RENDER_WEIGHT_LABEL } from "@/lib/targets/strategy";
import {
  generateBaseline,
  prepareBaseline,
  type SelectionPreview,
} from "@/app/(app)/resume/baseline-actions";
import type { GateResult } from "@/lib/resume/gate";
import type { BaselineView } from "@/lib/queries/resume";

type Phase = "idle" | "selecting" | "rendering" | "blocked";

const REVEAL_MS = 90;

export function BaselineWorkbench({
  targetId,
  targetName,
  baseline,
}: {
  targetId: string;
  targetName: string;
  baseline: BaselineView | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<SelectionPreview | null>(null);
  const [blocked, setBlocked] = useState<GateResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [, start] = useTransition();

  const blocks = baseline?.blocks ?? [];

  // 新生成的块逐条露出来。不是进度条 —— 数据已经全在手上了，
  // 这只是让人能跟着读一遍，而不是「唰」地拍一整页在脸上。
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (!fresh) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= blocks.length) clearInterval(timer);
    }, REVEAL_MS);
    return () => clearInterval(timer);
  }, [fresh, blocks.length]);
  // 不是新生成的（刷新、切方向）就整份直接显示，逐条露出只发生在刚生成完那一次。
  const shown = fresh ? revealed : blocks.length;

  function run() {
    setError(null);
    setBlocked([]);
    setFresh(false);
    setRevealed(0);
    start(async () => {
      setPhase("selecting");
      const p = await prepareBaseline(targetId);
      if (!p.ok) {
        setError(p.error);
        setPhase("idle");
        return;
      }
      setPreview(p.data);

      setPhase("rendering");
      const r = await generateBaseline(targetId);
      if (!r.ok) {
        setError(r.error);
        setPhase("idle");
        return;
      }
      if (r.data.status === "blocked") {
        setBlocked(r.data.results.filter((x) => x.level === "blocking"));
        setPhase("blocked");
        return;
      }
      setFresh(true);
      setPhase("idle");
      router.refresh();
    });
  }

  const busy = phase === "selecting" || phase === "rendering";
  const locked = !!baseline?.lockedAt;

  return (
    <div className="mt-5 flex gap-6">
      {/* ---- 左：简历预览 ---- */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={run} disabled={busy || locked}>
            {blocks.length > 0 ? "重新生成" : "生成基线"}
          </Button>
          {locked && (
            <span className="text-[12.5px]" style={{ color: "var(--mute)" }}>
              已锁定，要重新生成先解锁
            </span>
          )}
          {baseline?.generatedAt && !busy && (
            <span className="text-[12px]" style={{ color: "var(--ghost)" }}>
              {new Date(baseline.generatedAt).toLocaleString("zh-CN")} 生成
            </span>
          )}
        </div>

        {error && (
          <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        {busy && <Progress phase={phase} preview={preview} />}

        {phase === "blocked" && (
          <div
            className="mt-4 rounded-card px-4 py-3"
            style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)" }}
          >
            <p className="text-[13.5px] font-medium">
              这一版没过门禁，{blocked.length} 处必须先解决，没有写入。
            </p>
            <ul className="mt-2 space-y-1.5">
              {blocked.map((r, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed">
                  <span
                    className="mr-1.5 rounded-pill px-1.5 py-0.5 text-[11px]"
                    style={{ background: "var(--card)", color: "var(--danger)" }}
                  >
                    {r.code}
                  </span>
                  {r.message}
                  <span className="ml-1" style={{ color: "var(--slate)" }}>
                    {r.detail}
                  </span>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" className="mt-3" onClick={run}>
              带着这些问题重试一次
            </Button>
          </div>
        )}

        {blocks.length === 0 && !busy && phase !== "blocked" && (
          <p
            className="mt-4 max-w-[52ch] rounded-card px-5 py-4 text-[13.5px] leading-relaxed"
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              color: "var(--slate)",
            }}
          >
            「{targetName}」还没有基线。生成之前先确认两件事：这个方向下的经历策略配好了
            （谁展开、谁一行、谁不出现），互斥组也定了。选材是按那份配置来的。
          </p>
        )}

        {blocks.length > 0 && (
          <article
            className="mt-4 rounded-card px-8 py-7"
            style={{
              background: "#fff",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-1)",
              maxWidth: 720,
            }}
          >
            {baseline?.headline && (
              <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink)" }}>
                {baseline.headline}
              </p>
            )}

            {blocks.slice(0, shown).map((b, i) => (
              <section key={b.id} className={i === 0 && !baseline?.headline ? "" : "mt-6"}>
                {(i === 0 || blocks[i - 1].section !== b.section) && (
                  <h3
                    className="mb-2 border-b pb-1 text-[12px] font-medium tracking-wide"
                    style={{ color: "var(--mute)", borderColor: "var(--line-soft)" }}
                  >
                    {b.section}
                  </h3>
                )}
                <div className="flex items-baseline gap-2">
                  <ProofDot level={b.evidenceLevel} size={9} className="translate-y-[1px]" />
                  <span className="text-[14px] font-medium">{b.title}</span>
                  <span className="ml-auto text-[12px]" style={{ color: "var(--mute)" }}>
                    {b.meta}
                  </span>
                </div>
                {b.summary && (
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
                    {b.summary}
                  </p>
                )}
                {b.bullets.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {b.bullets.map((line, j) => (
                      <li key={j} className="flex gap-2 text-[13px] leading-relaxed">
                        <span style={{ color: "var(--ghost)" }}>·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ghost)" }}>
                  {EVIDENCE_LABEL[b.templateUsed]}模板 · 来源「{b.atomTitle}」
                </p>
              </section>
            ))}

            {baseline && baseline.skills.length > 0 && shown >= blocks.length && (
              <section className="mt-6">
                <h3
                  className="mb-2 border-b pb-1 text-[12px] font-medium tracking-wide"
                  style={{ color: "var(--mute)", borderColor: "var(--line-soft)" }}
                >
                  技能
                </h3>
                <p className="text-[13px] leading-relaxed">{baseline.skills.join("、")}</p>
              </section>
            )}
          </article>
        )}
      </div>

      {/* ---- 右：本版取舍与门禁 ---- */}
      <aside className="w-[288px] shrink-0">
        <SidePanel baseline={baseline} preview={preview} />
      </aside>
    </div>
  );
}

function Progress({ phase, preview }: { phase: Phase; preview: SelectionPreview | null }) {
  return (
    <div
      className="mt-4 rounded-card px-4 py-3 text-[13px]"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <p style={{ color: "var(--ink)" }}>
        {phase === "selecting" ? "正在按方向策略选材…" : "正在渲染正文…"}
      </p>
      {preview && (
        <>
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
            选中 {preview.atoms.length} 条经历，{preview.tradeoffs.length} 条落选，技能栏
            {preview.skills.length} 个标签。
          </p>
          <ul className="mt-2 space-y-1">
            {preview.atoms.map((a) => (
              <li key={a.id} className="text-[12.5px]" style={{ color: "var(--slate)" }}>
                {a.title}
                <span className="ml-1.5" style={{ color: "var(--ghost)" }}>
                  {RENDER_WEIGHT_LABEL[a.renderWeight]}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px]" style={{ color: "var(--mute)" }}>
            渲染是一次 strong 档调用，通常十几秒。写入前还要过一遍门禁。
          </p>
        </>
      )}
    </div>
  );
}

function SidePanel({
  baseline,
  preview,
}: {
  baseline: BaselineView | null;
  preview: SelectionPreview | null;
}) {
  const tradeoffs = baseline?.tradeoffs ?? preview?.tradeoffs ?? [];
  const checks = baseline?.checks ?? [];
  const warnings = checks.filter((c) => c.level === "warning");
  const blocking = checks.filter((c) => c.level === "blocking");

  return (
    <div className="space-y-4">
      {blocking.length > 0 && (
        <Panel title={`必须先解决 ${blocking.length} 处`} tone="danger">
          {blocking.map((c) => (
            <p key={c.id} className="text-[12.5px] leading-relaxed">
              <b>{c.code}</b> {c.title}
              <span className="block" style={{ color: "var(--slate)" }}>
                {c.detail}
              </span>
            </p>
          ))}
        </Panel>
      )}

      {warnings.length > 0 && (
        <Panel title={`提醒 ${warnings.length} 处`} tone="warn">
          {warnings.map((c) => (
            <p key={c.id} className="text-[12.5px] leading-relaxed">
              {c.title}
              <span className="block" style={{ color: "var(--slate)" }}>
                {c.detail}
              </span>
            </p>
          ))}
        </Panel>
      )}

      <Panel title="本版取舍">
        {tradeoffs.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--mute)" }}>
            这个方向下没有落选的经历，技能栏也没有被过滤的标签。
          </p>
        ) : (
          tradeoffs.map((t, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed">
              <span
                className="mr-1.5 rounded-pill px-1.5 py-0.5 text-[11px]"
                style={{
                  background: "var(--bg)",
                  color: t.kind === "skill" ? "var(--mute)" : "var(--slate)",
                }}
              >
                {t.kind === "exclusive" ? "互斥" : t.kind === "omit" ? "省略" : "空标签"}
              </span>
              <b>{t.title}</b>
              <span className="block" style={{ color: "var(--slate)" }}>
                {t.detail}
              </span>
            </p>
          ))
        )}
      </Panel>

      <p className="text-[12px] leading-relaxed" style={{ color: "var(--mute)" }}>
        选材、互斥消解、技能过滤全部由代码判定，同样的策略配置生成十次得到同样的名单。
        模型只负责措辞。
        <Link href="/targets/strategy" className="ml-1 underline" style={{ color: "var(--ink)" }}>
          去改策略
        </Link>
      </p>
    </div>
  );
}

function Panel({
  title,
  tone = "plain",
  children,
}: {
  title: string;
  tone?: "plain" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const border =
    tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--line)";
  const bg =
    tone === "danger" ? "var(--danger-soft)" : tone === "warn" ? "var(--warn-soft)" : "var(--card)";
  return (
    <section
      className="rounded-card px-4 py-3"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <h3 className="text-[12.5px] font-semibold">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
