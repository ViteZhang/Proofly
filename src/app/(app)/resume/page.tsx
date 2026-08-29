// 占位页。Step 6 接真实数据。
// JD 列表上的「生成简历 / 继续编辑 / 查看」都跳到这里，得给句实话，
// 不能让人点过来看见一片空白以为坏了。
export default function ResumePage() {
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold tracking-tight">简历</h1>
      <p className="mt-1.5 text-[14px]" style={{ color: "var(--slate)" }}>
        方向基线 + 逐 JD 增量
      </p>
      <p
        className="mt-5 max-w-[52ch] rounded-card px-5 py-4 text-[13.5px] leading-relaxed"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--slate)" }}
      >
        简历生成还没做完，Step 6 见。
        <br />
        在那之前，先把方向的策略配好、把 JD 的缺口补上——简历是从这两样长出来的。
      </p>
    </div>
  );
}
