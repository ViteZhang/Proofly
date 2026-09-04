import { lastScan, readReport, shouldSuggestDeepScan } from "@/lib/queries/health";
import { bannerOf, type ReportIssue } from "@/lib/health/report";
import { DeepScanPanel } from "@/components/health/DeepScanPanel";
import { IssueCard } from "@/components/health/IssueCard";
import { PassedList } from "@/components/health/PassedList";
import { ScanOnArrival } from "@/components/health/ScanOnArrival";
import { FreeTag } from "@/components/billing/CreditTag";
import { rescan } from "./actions";

// S10 体检页。全局视图 —— 方向选择器在这一页置灰（判定在 nav.ts）。
//
// 进页面自动跑一次快扫，由 ScanOnArrival 在客户端触发（原因写在那个文件里：
// 渲染期扫会让顶栏芯片比页面慢一轮）。这里只读已落库的结果。
// 快扫零 LLM 调用；深扫要调模型，只能手动点。
export default async function HealthPage() {
  const [report, meta, suggestDeep] = await Promise.all([
    readReport(),
    lastScan("quick"),
    shouldSuggestDeepScan(),
  ]);
  const banner = bannerOf(report);
  const cover = meta?.coverage;

  const tone =
    banner.kind === "blocked"
      ? { bg: "var(--danger-soft)", fg: "var(--danger)" }
      : banner.kind === "minor"
        ? { bg: "var(--caution-soft)", fg: "var(--caution)" }
        : { bg: "var(--proof-soft)", fg: "var(--proof)" };

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">体检</h1>
          <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
            投出去之前，先自查
            <span className="ml-2 rounded-pill px-2 py-[2px] text-[11.5px]" style={{ background: "var(--bg)", color: "var(--mute)" }}>
              全局 · 所有方向共用
            </span>
            <ScanOnArrival />
          </p>
        </div>

        <div className="text-right">
          <form action={rescan} className="inline">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-btn px-3 py-1.5 text-[13px]"
              style={{ background: "var(--card)", border: "1px solid var(--line)" }}
            >
              重新扫描
              {/* 免费要显性标注：用户不会自己发现「哦这个没扣分」 */}
              <FreeTag />
            </button>
          </form>
          <DeepScanPanel initialScanId={null} />
          {meta?.finishedAt && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--mute)" }}>
              上次扫描 {new Date(meta.finishedAt).toLocaleString("zh-CN", { hour12: false })}
              {cover && (
                <>
                  <br />
                  {cover.atoms} 条经历 · {cover.skills} 个技能 · {cover.resumes} 份简历 ·{" "}
                  {cover.sourceDocs} 份源材料
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {suggestDeep && (
        <p
          className="mt-4 rounded-card px-4 py-3 text-[13px]"
          style={{ background: "var(--ai-soft)", color: "var(--ai)" }}
        >
          导入了新材料，建议做一次深度扫描 —— 新旧材料之间说法不一致，只有语义比对查得出来。
        </p>
      )}

      <div className="mt-4 rounded-card px-5 py-4" style={{ background: tone.bg, color: tone.fg }}>
        <p className="text-[15px] font-medium">{banner.headline}</p>
        {banner.sub && <p className="mt-1 text-[13px] opacity-80">{banner.sub}</p>}
      </div>

      <Group title="必须解决" issues={report.blocking} anchor="blocking" />
      <Group title="建议解决" issues={report.warning} />
      <Group title="知道就行" issues={report.info} />
      <Group title="已忽略" issues={report.ignored} muted />

      <PassedList passed={report.passed} />
    </div>
  );
}

function Group({
  title,
  issues,
  muted,
  anchor,
}: {
  title: string;
  issues: ReportIssue[];
  muted?: boolean;
  /** 导出被拦时的「去看看」带着 #blocking 过来，直接落在这一组上。 */
  anchor?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <section className="mt-6 scroll-mt-6" id={anchor}>
      <h2
        className="text-[11.5px] font-medium"
        style={{ letterSpacing: "0.06em", color: "var(--mute)", opacity: muted ? 0.7 : 1 }}
      >
        {title} · {issues.length}
      </h2>
      <div className="mt-2 space-y-2" style={{ opacity: muted ? 0.72 : 1 }}>
        {issues.map((i) => (
          <IssueCard key={i.fingerprint} issue={i} />
        ))}
      </div>
    </section>
  );
}
