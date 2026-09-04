import { RedeemForm } from "@/components/billing/RedeemForm";

export const metadata = { title: "兑换码 · Proofly" };

export default function RedeemPage() {
  return (
    <div className="max-w-[460px]">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">兑换码</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        付款后我会把码发给你。兑换到账的是购买积分，永不过期。
      </p>
      <div className="mt-6">
        <RedeemForm />
      </div>
    </div>
  );
}
