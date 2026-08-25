import { NewAtomButton } from "./NewAtomButton";

// 一条经历都没有时，整个页面替换成这个引导——不是只把左栏做空。
export function EmptyLibrary() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="w-full max-w-[420px] rounded-card px-7 py-8 text-center"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}
      >
        <h2 className="font-display text-[18px] font-semibold tracking-tight">还没有经历</h2>
        <p className="mx-auto mt-2 max-w-[320px] text-[13.5px]" style={{ color: "var(--slate)" }}>
          先手动加一条试试，或者等下一步做完，直接传一份旧简历自动拆。
        </p>
        <div className="mt-5">
          <NewAtomButton label="手动添加第一条" variant="primary" />
        </div>
      </div>
    </div>
  );
}
