// =============================================================
// Proofly · 首次赠送与护栏触顶的引导卡（交互方案 3.5、3.6）
//
// **赠送额度与免费功能必须一起说。** 只说「送你 45 分」会让用户以为
// 这是个处处收费的产品 —— 而事实恰恰相反，他日常最常做的那些事都不
// 花钱。这一句是这张卡真正的作用。
//
// 触顶时不说「系统繁忙」这类模糊话：说清是名额限制，并给一条现在就
// 能走的路。
// =============================================================

import Link from "next/link";

import { FREE_QUOTA } from "@/config/plan";

import { CreditGlyph } from "./CreditGlyph";

export function SignupGuide({
  state,
}: {
  state: { justGranted: number; pending: boolean; backfilled: boolean };
}) {
  if (state.pending) {
    return (
      <Card>
        <h3 className="mb-2 text-[17px] font-semibold">今天的新用户名额满了</h3>
        <p className="mb-2.5 text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
          赠送额度每天有限，明天再来吧。
        </p>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
          你现在就可以先手动录几条经历 —— 经历库、体检、评分这些都是免费的。
        </p>
        <div className="mt-4">
          <Link
            href="/app/library?new=1"
            className="inline-flex h-9 items-center rounded-btn px-4 text-[13.5px] font-medium"
            style={{ background: "var(--ink)", color: "#fff" }}
          >
            手动添加第一条经历
          </Link>
        </div>
      </Card>
    );
  }

  if (state.justGranted <= 0) return null;

  return (
    <Card>
      <h3 className="mb-2 flex items-center gap-2 text-[17px] font-semibold">
        <span style={{ color: "var(--proof)" }}>
          <CreditGlyph size={15} />
        </span>
        {state.backfilled
          ? `今天的名额有了，${state.justGranted} 分已经到账`
          : `送你 ${state.justGranted} 分，够解析 3 份材料`}
      </h3>
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--slate)" }}>
        先传一份旧简历，我把它拆成一条条经历，你确认一下就存进档案库。
      </p>
      <p
        className="mt-3 rounded-btn px-3.5 py-2.5 text-[13.5px] leading-relaxed"
        style={{ background: "var(--proof-soft)", color: "#0A7355" }}
      >
        另外，体检、简历评分、日常维护这些都是免费的，不花积分。
        对话式维护每月还有 {FREE_QUOTA.chat_record_per_month} 次不计分的额度。
      </p>
      <div className="mt-4 flex gap-2">
        <Link
          href="/app/import"
          className="inline-flex h-9 items-center rounded-btn px-4 text-[13.5px] font-medium"
          style={{ background: "var(--ink)", color: "#fff" }}
        >
          上传简历
        </Link>
        <Link
          href="/app/library"
          className="inline-flex h-9 items-center rounded-btn px-4 text-[13.5px]"
          style={{ border: "1px solid var(--line)" }}
        >
          先随便看看
        </Link>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-5 max-w-[440px] rounded-card p-[22px]"
      style={{ background: "var(--card)", boxShadow: "var(--shadow-1)" }}
    >
      {children}
    </div>
  );
}
