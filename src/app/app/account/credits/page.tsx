// =============================================================
// Proofly · 充值（交互方案 4.2）
//
// 两条排版上的硬要求：
//
// 1. **先讲这个包能完成什么，积分数与价格放其后。** 用户买的不是
//    200 个数字，是「完整跑通一个方向」。
// 2. **价目表放在正文里，不藏进帮助文档、不做成折叠面板。**
//    定价透明本身就是产品主张的一部分。
//
// 三档到顶，不加第四档。
// =============================================================

import { PackageGrid } from "@/components/billing/PackageGrid";
import { CreditGlyph } from "@/components/billing/CreditGlyph";
import { ACTION_PRICES, FREE_QUOTA, PACKAGES } from "@/config/plan";

export const metadata = { title: "充值 · Proofly" };

const PAID_ROWS: [string, number][] = [
  ["解析文档（≤5 段）", ACTION_PRICES.doc_parse_base],
  ["　每多一段经历", ACTION_PRICES.doc_parse_extra_seg],
  ["　扫描件每页", ACTION_PRICES.doc_parse_scan_page],
  ["解析并评估", ACTION_PRICES.target_assess],
  ["生成行动清单", ACTION_PRICES.task_plan],
  ["基线简历", ACTION_PRICES.resume_baseline],
  ["投递版本", ACTION_PRICES.resume_delta],
  ["重写一块", ACTION_PRICES.resume_block],
  ["面试题包", ACTION_PRICES.interview_kit],
  ["体检深扫", ACTION_PRICES.health_deep_scan],
];

const FREE_ROWS: [string, string][] = [
  ["一致性体检", "免费"],
  ["简历评分", "免费"],
  ["证据等级推导", "免费"],
  ["行动排序", "免费"],
  ["数据导出", "免费"],
  ["对话式维护", `每月 ${FREE_QUOTA.chat_record_per_month} 次`],
];

export default function CreditsPage() {
  return (
    <div className="max-w-[860px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">充值</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        先看这个包能完成什么，再看多少分、多少钱。
      </p>

      <div className="mt-6">
        <PackageGrid packages={PACKAGES} />
      </div>

      {/*
        交互方案这里还有一句「每个动作的标价只会降、不会涨」。
        技术方案 0.1 建议在成本报告完成、分值转正式之后再对外承诺 ——
        当前分值是初值，样本还不够。所以这句先不写。
      */}
      <p className="my-5 text-center text-[13px]" style={{ color: "var(--slate)" }}>
        积分永不过期。
      </p>

      <section className="rounded-card p-5" style={{ background: "var(--card)" }}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-2.5 text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
              你的积分怎么用
            </h2>
            {PAID_ROWS.map(([label, credits]) => (
              <div
                key={label}
                className="flex justify-between py-1.5 text-[13px]"
                style={{ borderBottom: "1px solid var(--line-soft)" }}
              >
                <span>{label}</span>
                <span className="inline-flex items-center gap-1 font-display font-semibold">
                  <CreditGlyph size={9} />
                  {credits}
                </span>
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-2.5 text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>
              不花积分的
            </h2>
            {FREE_ROWS.map(([label, note]) => (
              <div
                key={label}
                className="flex justify-between py-1.5 text-[13px]"
                style={{ borderBottom: "1px solid var(--line-soft)" }}
              >
                <span>{label}</span>
                <span className="text-[12px]" style={{ color: "var(--proof)" }}>
                  {note}
                </span>
              </div>
            ))}
            <p className="mt-3.5 text-[12.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
              失败不扣分。
              <br />
              24 小时内没改过事实的重新生成，也不扣分。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
