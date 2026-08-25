import { getProfileFacts } from "@/lib/queries/facts";
import { EnsureFacts } from "@/components/facts/EnsureFacts";
import { FactRow } from "@/components/facts/FactRow";

// 事实层：全局唯一口径。跨文件说法不一致的问题在这里收口。
export default async function FactsPage() {
  const { facts, blockingCount, missingKeys } = await getProfileFacts();

  return (
    <div className="max-w-[720px]">
      <EnsureFacts missing={missingKeys} />

      <h1 className="font-display text-[26px] font-semibold tracking-tight">事实层</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        {blockingCount > 0
          ? `有 ${blockingCount} 处对不上，简历和面试都会用到这些，先定下来。`
          : "这些数在简历、JD 匹配、面试里反复用到，口径以这里为准。"}
      </p>

      <div
        className="mt-5 overflow-hidden rounded-card"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        {facts.length === 0 ? (
          <p className="px-5 py-6 text-[13.5px]" style={{ color: "var(--mute)" }}>
            正在初始化…
          </p>
        ) : (
          facts.map((fact) => <FactRow key={fact.id} fact={fact} />)
        )}
      </div>
    </div>
  );
}
