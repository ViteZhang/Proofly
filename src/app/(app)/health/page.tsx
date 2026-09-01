import { runQuickScan, lastScan } from "@/lib/queries/health";
import { bannerOf, sortIssues } from "@/lib/health/report";
import { DeepScanPanel } from "@/components/health/DeepScanPanel";
import { rescan } from "./actions";

// 进入体检页自动跑一次快扫（《Step 8》§五-8.6 自动扫描时机）。
// 快扫零 LLM 调用，全是库查询与文本比对，所以敢挂在进页面上。
export default async function HealthPage() {
  const report = await runQuickScan();
  const meta = await lastScan("quick");
  const banner = bannerOf(report);
  const cover = meta?.coverage;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">体检</h1>
          <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
            投出去之前，先自查 · 全局 · 所有方向共用
          </p>
        </div>
        <form action={rescan}>
          <button
            type="submit"
            className="rounded-btn px-3 py-1.5 text-[13px]"
            style={{ background: "var(--card)", border: "1px solid var(--line)" }}
          >
            重新扫描
          </button>
        </form>
      </div>

      <DeepScanPanel initialScanId={null} />

      <div
        className="mt-5 rounded-card px-5 py-4"
        style={{
          background:
            banner.kind === "blocked"
              ? "var(--danger-soft)"
              : banner.kind === "minor"
                ? "var(--caution-soft)"
                : "var(--proof-soft)",
          color:
            banner.kind === "blocked"
              ? "var(--danger)"
              : banner.kind === "minor"
                ? "var(--caution)"
                : "var(--proof)",
        }}
      >
        <div className="text-[15px] font-medium">{banner.headline}</div>
        {banner.sub && <div className="mt-1 text-[13px] opacity-80">{banner.sub}</div>}
        {cover && (
          <div className="mt-2 text-[12px] opacity-70">
            {cover.atoms} 条经历 · {cover.skills} 个技能 · {cover.resumes} 份简历 ·{" "}
            {cover.sourceDocs} 份源材料
          </div>
        )}
      </div>

      {sortIssues([...report.blocking, ...report.warning, ...report.info]).map((i) => (
        <div
          key={i.fingerprint}
          className="mt-3 rounded-card px-5 py-4"
          style={{ background: "var(--card)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--mute)" }}>
            <span>{i.code}</span>
            <span>{i.level}</span>
          </div>
          <div className="mt-1 text-[14px] font-medium">{i.title}</div>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>
            {i.detail}
          </p>
          <a className="mt-2 inline-block text-[13px] underline" href={i.resolveLink}>
            去解决
          </a>
        </div>
      ))}

      <p className="mt-5 text-[13px]" style={{ color: "var(--mute)" }}>
        {report.passed.length} 项检查通过：{report.passed.map((p) => p.label).join(" · ")}
      </p>
    </div>
  );
}
