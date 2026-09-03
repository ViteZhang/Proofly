"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { JdForm } from "./JdForm";
import { GenerateResumeButton } from "@/components/resume/GenerateResumeButton";
import { RequirementList } from "./RequirementList";
import { deleteJd, parseJd } from "@/app/app/targets/jd-actions";
import { BIND_LABEL } from "@/lib/jd/labels";
import type { JdCard, JdDetail } from "@/lib/queries/jds";

// S6 区块二。列表 + 录入 + 解析结果。
export function JdSection({
  targetId,
  jds,
  jd,
  assessPanel,
}: {
  targetId: string;
  jds: JdCard[];
  jd: JdDetail | null;
  /** 区块三：评估结果。由页面装配好传进来。 */
  assessPanel?: React.ReactNode;
}) {
  const router = useRouter();
  const [addingJd, setAddingJd] = useState(false);
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [removing, startRemove] = useTransition();

  function select(jdId: string) {
    router.replace(`/app/targets?target=${targetId}&jd=${jdId}`, { scroll: false });
  }

  function parse(jdId: string) {
    setError(null);
    setParsedCount(null);
    startParse(async () => {
      const res = await parseJd(jdId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setParsedCount(res.data.length);
      router.refresh();
    });
  }

  function remove(jdId: string) {
    setError(null);
    startRemove(async () => {
      const res = await deleteJd(jdId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.replace(`/app/targets?target=${targetId}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[16px] font-semibold">岗位描述</h2>
        {!addingJd && (
          <Button variant="secondary" size="sm" onClick={() => setAddingJd(true)}>
            ＋ 添加 JD
          </Button>
        )}
      </div>

      {addingJd && (
        <JdForm
          targetId={targetId}
          onClose={() => setAddingJd(false)}
          onCreated={(jdId) => {
            setAddingJd(false);
            select(jdId);
            router.refresh();
            // 存完直接解析，不让人再点一次
            parse(jdId);
          }}
        />
      )}

      {jds.length === 0 && !addingJd ? (
        <p className="mt-3 text-[13.5px]" style={{ color: "var(--mute)" }}>
          还没有 JD。贴一份进来，就能看出差在哪、为什么差。
        </p>
      ) : (
        <div
          className="mt-3 overflow-hidden rounded-card"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          {jds.map((j) => (
            <JdRow
              key={j.id}
              jd={j}
              selected={j.id === jd?.id}
              onSelect={() => select(j.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {jd && (
        <div
          className="mt-4 rounded-card px-5 py-4"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold">
                {jd.company ?? "未填公司"} · {jd.roleTitle ?? "未填岗位"}
              </h3>
              {jd.sourceUrl && (
                <a
                  href={jd.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-block max-w-[52ch] truncate text-[12px] hover:underline"
                  style={{ color: "var(--mute)" }}
                >
                  {jd.sourceUrl}
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => parse(jd.id)}
                disabled={parsing}
              >
                {parsing
                  ? "解析中…"
                  : jd.requirements.length > 0
                    ? "重新解析"
                    : "解析要求"}
              </Button>
              <GenerateResumeButton jdId={jd.id} />
              <Button
                variant="danger"
                size="sm"
                onClick={() => remove(jd.id)}
                disabled={removing}
              >
                删除
              </Button>
            </div>
          </div>

          {/* 解析完直接追问，不让用户自己再点一次 */}
          {parsedCount !== null && (
            <div
              className="mt-3 flex flex-wrap items-center gap-3 rounded-btn px-3 py-2"
              style={{ background: "var(--ai-soft)" }}
            >
              <span className="text-[13px]" style={{ color: "var(--ai)" }}>
                解析出 {parsedCount} 条要求。要现在评估匹配度吗？
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <Button variant="text" size="sm" onClick={() => setParsedCount(null)}>
                  先不用
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setParsedCount(null);
                    document
                      .getElementById("assess-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  去评估
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3">
            {jd.requirements.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--mute)" }}>
                还没解析。点上面的「解析要求」，把这份 JD 拆成一条条能对照的能力点。
              </p>
            ) : (
              <RequirementList
                jdId={jd.id}
                requirements={jd.requirements}
                onChanged={() => router.refresh()}
              />
            )}
          </div>
        </div>
      )}

      {assessPanel}
    </section>
  );
}

function JdRow({
  jd,
  selected,
  onSelect,
}: {
  jd: JdCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const bind = BIND_LABEL[jd.bind];
  const bindColor = jd.bind === "none" ? "var(--mute)" : "var(--proof)";

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{
        borderBottom: "1px solid var(--line-soft)",
        background: selected ? "var(--line-soft)" : undefined,
      }}
    >
      {/* 选中整行的按钮跟「生成简历」是两个动作，不能嵌套成一个 button */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          {jd.company ?? "未填公司"}
          <span style={{ color: "var(--slate)" }}> · {jd.roleTitle ?? "未填岗位"}</span>
        </span>

        <span className="shrink-0 text-[12.5px]" style={{ color: "var(--slate)" }}>
          {jd.requirementCount > 0 ? `${jd.requirementCount} 条要求` : "未解析"}
        </span>

        <span className="w-[72px] shrink-0 text-right text-[13px]">
          {jd.matchScore === null ? (
            <span style={{ color: "var(--mute)" }}>未评估</span>
          ) : (
            <>
              <span className="font-display font-semibold">{Math.round(jd.matchScore)}</span>
              <span style={{ color: "var(--slate)" }}> 分</span>
            </>
          )}
        </span>

        <span
          className="flex w-[104px] shrink-0 items-center gap-1 text-[12px]"
          style={{ color: bindColor }}
        >
          <span aria-hidden>{bind.mark}</span>
          {bind.text}
        </span>
      </button>

      {/* 简历要到 Step 6，按钮先给个说明，状态判定逻辑现在就是对的 */}
      <Link
        href={`/app/resume?jd=${jd.id}`}
        className="shrink-0 rounded-btn px-2.5 py-1 text-[12.5px] transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ color: "var(--slate)", border: "1px solid var(--line)" }}
      >
        {bind.action}
      </Link>
    </div>
  );
}
