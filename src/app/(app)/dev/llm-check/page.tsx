import { MODEL, llmEndpoint } from "@/lib/llm/config";
import { CheckPanel } from "./CheckPanel";
import { recentCalls } from "./actions";

// 临时页面：确认四个档位都通、成本记录正常写入。
// 交付物清单要求 Step 2 结束前删掉它。
export default async function LlmCheckPage() {
  const endpoint = llmEndpoint();
  const calls = await recentCalls();

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">模型接入自检</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        临时页面，Step 2 结束前删掉。四个档位各发一个最小请求。
      </p>

      <div
        className="mt-4 rounded-card p-4 font-mono text-[12.5px]"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        {endpoint ? (
          <>
            <div>接入点 {endpoint.baseURL}</div>
            <div style={{ color: "var(--mute)" }}>
              key ····{endpoint.apiKey.slice(-4)}
            </div>
            <div className="mt-2">
              {Object.entries(MODEL).map(([tier, model]) => (
                <div key={tier}>
                  {tier.padEnd(10, " ")} {model}
                </div>
              ))}
            </div>
          </>
        ) : (
          <span style={{ color: "var(--danger)" }}>
            .env.local 里还没有 OPENAI_API_KEY，四档都跑不了
          </span>
        )}
      </div>

      <CheckPanel initialCalls={calls} />
    </div>
  );
}
