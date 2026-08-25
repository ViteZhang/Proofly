"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { recentCalls, runProbe, type CallRow, type ProbeResult } from "./actions";
import type { Tier } from "@/lib/llm/config";

const TIERS: Tier[] = ["light", "strong", "vision", "embedding"];

const TIER_NOTE: Record<Tier, string> = {
  light: "Pass 1 切分定位",
  strong: "Pass 2 抽取 · Pass 3 意图判定（顺带验 JSON 强制与 zod 校验）",
  vision: "扫描件与图片识别（发一张纯红方块，答不对就是没看见图）",
  embedding: "向量召回（必须是 1536 维）",
};

export function CheckPanel({ initialCalls }: { initialCalls: CallRow[] }) {
  const [results, setResults] = useState<Partial<Record<Tier, ProbeResult>>>({});
  const [calls, setCalls] = useState(initialCalls);
  const [running, setRunning] = useState<Tier | "all" | null>(null);
  const [, startTransition] = useTransition();

  async function run(tiers: Tier[], label: Tier | "all") {
    setRunning(label);
    for (const tier of tiers) {
      const r = await runProbe(tier);
      setResults((prev) => ({ ...prev, [tier]: r }));
    }
    setCalls(await recentCalls());
    setRunning(null);
  }

  return (
    <>
      <div className="mt-5 flex gap-2">
        <Button
          disabled={running !== null}
          onClick={() => startTransition(() => void run(TIERS, "all"))}
        >
          {running === "all" ? "跑着…" : "四档全跑一遍"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {TIERS.map((tier) => {
          const r = results[tier];
          return (
            <div
              key={tier}
              className="rounded-card p-4"
              style={{ background: "var(--card)", border: "1px solid var(--line)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[14px] font-semibold">{tier}</span>
                    {r && (
                      <span className="font-mono text-[12px]" style={{ color: "var(--mute)" }}>
                        {r.model}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--slate)" }}>
                    {TIER_NOTE[tier]}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={running !== null}
                  onClick={() => startTransition(() => void run([tier], tier))}
                >
                  {running === tier ? "跑着…" : "单独跑"}
                </Button>
              </div>

              {r && (
                <div
                  className="mt-3 border-t pt-3 text-[13px]"
                  style={{ borderColor: "var(--line)" }}
                >
                  <p style={{ color: r.ok ? "var(--ink)" : "var(--danger)" }}>
                    {r.ok ? "✓ " : "✗ "}
                    {r.detail}
                  </p>
                  {r.ok && (
                    <p className="mt-1 font-mono text-[12px]" style={{ color: "var(--mute)" }}>
                      {r.durationMs} ms · 入 {r.promptTokens ?? "—"} · 出{" "}
                      {r.completionTokens ?? "—"} · 请求 {r.attempts} 次
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 text-[15px] font-semibold">llm_calls 最近 20 条</h2>
      <p className="mt-1 text-[13px]" style={{ color: "var(--slate)" }}>
        每次实际发出的请求一行，失败和重试也算。这张表是「哪个环节贵」的唯一答案。
      </p>
      <div
        className="mt-3 overflow-x-auto rounded-card"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <table className="w-full text-left font-mono text-[12px]">
          <thead style={{ color: "var(--mute)" }}>
            <tr className="border-b" style={{ borderColor: "var(--line)" }}>
              <th className="px-3 py-2 font-medium">tier</th>
              <th className="px-3 py-2 font-medium">purpose</th>
              <th className="px-3 py-2 text-right font-medium">入</th>
              <th className="px-3 py-2 text-right font-medium">出</th>
              <th className="px-3 py-2 text-right font-medium">ms</th>
              <th className="px-3 py-2 font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr>
                <td className="px-3 py-3" colSpan={6} style={{ color: "var(--mute)" }}>
                  还没有调用记录，先按上面的按钮跑一次
                </td>
              </tr>
            ) : (
              calls.map((c) => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-1.5">{c.tier}</td>
                  <td className="px-3 py-1.5">{c.purpose}</td>
                  <td className="px-3 py-1.5 text-right">{c.prompt_tokens ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right">{c.completion_tokens ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right">{c.duration_ms ?? "—"}</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--mute)" }}>
                    {c.created_at?.slice(11, 19) ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
