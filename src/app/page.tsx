import type { Metadata } from "next";
import "./site.css";
import { SiteNav } from "@/components/site/SiteNav";
import { Reveal } from "@/components/site/Reveal";
import { JoinForm } from "@/components/site/JoinForm";
import { LogoWordmark } from "@/components/layout/Logo";
import {
  HeroDiagram,
  ArchiveDiagram,
  ResumeDiagram,
  MatchDiagram,
  ScoreDiagram,
  InterviewDiagram,
  PainIconStack,
  PainIconUnsure,
  PainIconWarn,
} from "@/components/site/Diagrams";

export const metadata: Metadata = {
  title: "Proofly · 一份档案，投遍所有方向",
  description:
    "Proofly 把你的简历、项目材料和零散笔记整理成一份完整的职业档案，按不同求职方向生成定制简历，并提供岗位匹配、简历评分与面试题准备。AI 只整理，不编造。",
  openGraph: {
    title: "Proofly · 一份档案，投遍所有方向",
    description:
      "把经历做成资产，让每一次努力都不被浪费。经历录一次，简历生成无数次，AI 只整理，不编造。",
    type: "website",
  },
};

// 五个功能的顺序就是叙事：建档 → 生成 → 匹配 → 提分 → 面试。
// 编号之间那条竖线不是装饰，这五步真的有先后依赖。
//
// 每块第三条 bullet 固定处理一个顾虑（会不会越录越乱 / 格式能不能直接投 /
// 分析完了然后呢 / 会不会又给我编），不是凑数。
//
// 04 和 05 各多一条计费与耗时的交代。这两句本可以放进定价节，
// 但读到功能的人未必会往下滑 —— 「评分不要钱」是首次价值的钩子，
// 「面试题要等几分钟」是预期管理，都得在人还在看这块的时候说。
const FEATURES = [
  {
    n: "01",
    title: "超级档案",
    lead:
      "把旧简历、项目总结、周报片段全部倒进来，AI 抽取成一条条结构化经历：做了什么、怎么做的、结果如何、能证明到什么程度。存下来的是事实，不是一堆文件。",
    bullets: [
      "支持文件上传，也支持直接说一句话就更新",
      "抽取结果逐条确认，不会替你做主",
      "同一件事重复录入会被识别为更新，不会变成两条",
    ],
    diagram: <ArchiveDiagram />,
  },
  {
    n: "02",
    title: "多方向定制简历",
    lead:
      "想投几个方向就建几个。同一份档案会按方向自动取舍：哪些经历前置、哪些一笔带过、措辞往哪个语境靠。事实层不变，所以不同版本之间永远不会打架。",
    bullets: [
      "每个方向锁一份基线，投具体公司时只生成差异",
      "档案更新后，所有方向的简历一起同步",
      "导出 ATS 友好版式，机器解析不掉信息",
    ],
    diagram: <ResumeDiagram />,
  },
  {
    n: "03",
    title: "岗位匹配分析",
    lead:
      "粘一份 JD，逐条对照你的档案：哪些要求你已经满足、证据在哪条经历里；哪些只是沾边；哪些完全空着。给出匹配度，也给出具体差在哪。",
    bullets: [
      "每一条要求都能追溯到具体经历，不是笼统打分",
      "区分「能力没有」和「有能力但没证据」——后者补起来快得多",
      "缺口沉淀成待办，不用每次重新想",
    ],
    diagram: <MatchDiagram />,
  },
  {
    n: "04",
    title: "简历评分",
    lead:
      "投出去之前先跑一遍。从事实一致性、证据强度、与目标岗位的贴合度、表达清晰度几个维度给分，并直接指出最弱的几处，以及怎么改能加分。",
    bullets: [
      "不是笼统的「良好」，而是具体到哪一条 bullet",
      "发现前后口径不一致会直接标红",
      "改完可以再跑一次，分数变化看得见",
      "不带 JD 的评分永久免费，不消耗积分",
    ],
    diagram: <ScoreDiagram />,
  },
  {
    n: "05",
    title: "面试题准备",
    lead:
      "拿这份 JD 和这份简历，生成大概率会被问到的题目，并给出答题骨架——该讲哪段经历、按什么顺序、哪个数字是关键。你简历上写的每一句，都得接得住。",
    bullets: [
      "题目来自简历本身，不是通用题库",
      "证据薄弱的地方会被优先出题，因为面试官也会盯那里",
      "答题骨架只引用你档案里已有的事实",
      "内容量大，后台生成，完成后通知你",
    ],
    diagram: <InterviewDiagram />,
  },
];

// 证明度四档。这张表是「AI 不编造」那句话的凭据，
// 术语与产品内一致（实测 / 估算 / 仅设计 / 无证据）。
const GRADES = [
  { dot: "m", name: "实测", en: "MEASURED", can: "精确数字", limit: "没有限制，随便追问" },
  { dot: "e", name: "估算", en: "ESTIMATED", can: "带「约」「测算」的表述", limit: "不许写成精确百分比" },
  { dot: "d", name: "仅设计", en: "DESIGNED ONLY", can: "你做了什么设计", limit: "任何结果数字都不许出现" },
  { dot: "a", name: "无证据", en: "ABSENT", can: "你做了什么动作", limit: "任何暗示效果的词都不许出现" },
];

// 免费与付费的分界线不按功能重要性划，按「要不要调用大模型」划。
// 这条线本身就是卖点：能用代码算准的不交给模型，所以这部分不收钱。
const FREE_ITEMS = [
  { name: "投递前的硬伤自查", quota: "不限次" },
  { name: "简历评分（不带 JD 时）", quota: "不限次" },
  { name: "证据等级判定", quota: "不限次" },
  { name: "待办优先级排序", quota: "不限次" },
  { name: "随时导出全部数据", quota: "不限次" },
  { name: "对话式更新档案", quota: "20 次 / 月" },
];

// 付费栏一律只写「按次」，不写分值。分值目前是初值，
// 展示一个后续要改的数字，等于给正式版预约一次「涨价了」的观感。
const PAID_ITEMS = [
  { name: "解析一份材料", quota: "新用户送 3 份" },
  { name: "岗位匹配分析", quota: "按次" },
  { name: "生成基线简历", quota: "按次" },
  { name: "按 JD 生成投递版本", quota: "按次" },
  { name: "改写单个段落", quota: "按次 · 最低" },
  { name: "生成面试题包", quota: "按次" },
];

// 三档封顶。四档以上会引发比价瘫痪，而买的人多半正焦虑着，决策带宽有限。
// 描述写在积分数前面：积分制没有价格锚，得先说这个包能干成什么。
const PACKS = [
  { name: "体验包", credits: 50, desc: "先试试水。够解析 2 份材料，再生成 1 版基线简历。" },
  {
    name: "求职包",
    credits: 200,
    desc: "够完整跑通一个方向：5 份材料、5 次岗位匹配、8 版简历，外加一套面试题。",
    hot: true,
  },
  { name: "长期包", credits: 600, desc: "同时推进 3 个方向，含全部面试准备。适合长线找工作的人。" },
];

// 定价模块要在内测 / 公测 / 正式版三个阶段复用，结构一模一样，
// 变的只有积分包的价格位。抽成配置是策划方案 7.2 点名的要求：
// 切阶段只动这两行，模板不用碰。正式版要长购买按钮时也从这里接，
// 单价取商业化方案，别写死进 JSX。
const PRICE_SLOT = {
  beta: "内测期不开放购买",
  preview: "即将开放 · 单价上线前公布",
  ga: "",
} as const;
const PRICING_STAGE: keyof typeof PRICE_SLOT = "beta";

// 第三条是积分制最要紧的一条：按次计费的心理阻力本质是
// 「怕花了钱没拿到东西」，这条把风险整个搬到产品这边。
const VOWS = [
  { t: "积分不过期", d: "买了就一直在，空窗期放着不用也不清零" },
  { t: "不会贬值", d: "以后调价只影响新购买，不影响你手里的积分" },
  { t: "失败不扣分", d: "生成失败、超时，或 24 小时内重试，都不扣" },
  { t: "导出不要钱", d: "随时把全部数据带走，不消耗积分" },
];

const FAQS = [
  {
    q: "我的经历和简历会被用来训练模型吗？",
    a: "不会。你的档案只用于给你自己生成材料。数据可以随时完整导出，也可以随时删除账号连带删除全部内容。",
  },
  {
    q: "生成的简历会不会被看出是 AI 写的？",
    a: "内容全部来自你自己确认过的事实，AI 只做挑选、排序和措辞调整，不会产出模板化的套话。而且你随时可以手动改任何一句，改完的版本会被记住。",
  },
  {
    q: "支持哪些行业和岗位？",
    a: "档案结构是通用的，只要你的经历能被拆成「做了什么、怎么做的、结果如何」，就能用。互联网、金融、教育、制造、设计、市场等方向都适用。学术简历（CV）目前不在支持范围内。",
  },
  {
    q: "我没有现成的简历，可以用吗？",
    a: "可以。你也可以直接把项目经历一条条说出来，或者上传工作总结、周报、作品说明。系统会引导你把缺的部分补齐。",
  },
  {
    q: "生成的简历是什么格式？能直接投吗？",
    a: "导出 PDF 和纯文本两种。版式按 ATS（简历解析系统）友好标准做，避免用表格、图标和多栏导致机器读不出信息。没有花哨模板，这是刻意的取舍。",
  },
  {
    q: "手机上能用吗？",
    a: "手机上可以随时查看档案、看简历、翻面试题。编辑和生成建议在电脑上做，因为这是需要专注的活儿。",
  },
  {
    q: "为什么不做订阅制？",
    a: "因为找工作是一段有起止的事，通常两到四个月。订阅制会让你为空窗期付费，或者拿到 offer 后立刻退订——两种结果都不好。按动作计费更贴合这个节奏：忙的时候多用，闲的时候放着，档案还在，钱也还在。",
  },
  {
    q: "积分会过期吗？",
    a: "购买的积分永久有效，不清零。以后如果调整价格，只影响新的购买，不影响你手里已有的积分。赠送类积分（比如活动发放的）会标明有效期。",
  },
  {
    q: "内测期要花钱吗？",
    a: "不用。内测期不收费也不开放购买，全部功能可用，注册即送 3 份材料解析额度。积分单价会在正式版上线前公布。",
  },
  {
    q: "生成一次要等多久？",
    a: "简历生成和岗位匹配通常在一分钟内。面试题包内容量大，需要几分钟，所以它是后台跑的——你可以先去做别的，生成完会通知你。中途失败或超时不扣积分。",
  },
  {
    q: "申请内测后多久能用上？",
    a: "按申请顺序分批发放邀请。轮到你时会往你留的邮箱发一封带链接的邮件，点开就能进，不用注册密码。",
  },
];

// CTA 背景那圈同心环。纯装饰，服务端直接摆好，不值得为它下发一段脚本。
const DECO = Array.from({ length: 7 }, (_, i) => {
  const d = 330 - i * 42;
  return { d, left: 380 - d / 2, top: 170 - d / 2, opacity: (1 - i * 0.12).toFixed(2) };
});

export default function SitePage() {
  return (
    <div className="site">
      {/* .rev 的初始态是 opacity:0，靠脚本解除。脚本没跑起来的话，
          下面这段保证内容照常可见 —— 官网上一块永远看不见的正文是最糟的失败。 */}
      <noscript>
        <style>{`.site .rev{opacity:1;transform:none}`}</style>
      </noscript>

      <SiteNav />

      {/* ── Hero ── */}
      <header className="hero" id="top">
        <div className="wrap hero-grid">
          <div>
            <div className="tag">
              <i />
              内测中 · 注册送 3 份材料解析
            </div>
            <h1 className="h1">
              一份档案，
              <br />
              投遍所有方向
            </h1>
            <p className="hero-sub">
              把你的简历、项目材料和零散笔记整理成一份完整的职业档案。
              之后每一份定制简历、每一次岗位匹配、每一轮面试准备，都从这里生成。
            </p>
            <div className="hero-cta">
              <a href="#join" className="btn big">
                免费加入内测
              </a>
              <a href="#features" className="btn big ghost">
                看看它能做什么
              </a>
            </div>
            <p className="hero-fine">经历录一次，简历生成无数次。</p>
          </div>

          <div>
            <HeroDiagram />
          </div>
        </div>
      </header>

      {/* ── 三步条。只承担「上手成本很低」这一个任务，完整流程交给下面五个功能讲。 ── */}
      <section className="steps" aria-label="使用流程">
        <div className="steps-in">
          <div className="step">
            <b>01</b>
            <div>
              <div className="step-t">倒进来</div>
              <div className="step-d">旧简历、项目文档、随手写的两句话，什么都行</div>
            </div>
          </div>
          <div className="step">
            <b>02</b>
            <div>
              <div className="step-t">确认一遍</div>
              <div className="step-d">AI 整理成结构化经历，每一条你点头才入库</div>
            </div>
          </div>
          <div className="step">
            <b>03</b>
            <div>
              <div className="step-t">按需生成</div>
              <div className="step-d">简历、匹配分析、评分、面试题，都从这份档案出</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 痛点 ── */}
      <section className="sec">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">你可能正在经历</p>
            <h2 className="h2">求职最累的部分，从来不是投简历。</h2>
            <p className="lede">
              而是每投一个新方向，就要把自己重新讲一遍。讲完还不确定讲对没有。
            </p>

            <div className="pains">
              <div className="pain">
                <div className="pain-i" aria-hidden="true">
                  <PainIconStack />
                </div>
                <div className="pain-t">同一段经历，写了三遍</div>
                <p className="pain-d">
                  投三个方向就维护三份简历。项目有了新进展，三份都要改，改一处漏两处。时间全花在同步上。
                </p>
              </div>
              <div className="pain">
                <div className="pain-i" aria-hidden="true">
                  <PainIconUnsure />
                </div>
                <div className="pain-t">不知道该突出什么</div>
                <p className="pain-d">
                  面对一份 JD，凭感觉挑几段经历往前放。挑得对不对、还差哪一条，没有依据，只能投出去等结果。
                </p>
              </div>
              <div className="pain">
                <div className="pain-i" aria-hidden="true">
                  <PainIconWarn />
                </div>
                <div className="pain-t">简历上的话，面试接不住</div>
                <p className="pain-d">
                  为了好看写下的漂亮句子，面试官追问两轮就空了。写的时候爽，坐进会议室才发现给自己挖了坑。
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 五个功能 ── */}
      <section className="sec" id="features">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">核心功能</p>
            <h2 className="h2">从建档到面试，一条完整链路。</h2>
            <p className="lede">
              五个环节是有顺序的：先有档案，才谈得上生成；先看清差距，才知道改哪里。
            </p>

            <div className="feats">
              {FEATURES.map((f) => (
                <article className="feat" key={f.n}>
                  <div className="feat-n">
                    <span>{f.n}</span>
                  </div>
                  <div className="feat-txt">
                    <h3 className="feat-h">{f.title}</h3>
                    <p className="feat-p">{f.lead}</p>
                    <ul className="feat-list">
                      {f.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="feat-media">{f.diagram}</div>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── AI 不编造。全页唯一的深色反白块。 ── */}
      <section className="sec" id="trust">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">为什么和别的工具不一样</p>

            <div className="claim">
              <h3>
                AI 帮你整理，<span className="hl">但不会替你编</span>。
              </h3>
              <p>
                多数简历工具让模型自由发挥，替你写出一句听起来很合理的成绩。
                写的时候确实好看，但那句话在面试第二轮会崩，而你当场没有退路。
              </p>
              <p>
                Proofly 里的 AI 只能从你确认过的事实中挑选、排序、调整措辞。
                它没有新增事实的权限。生成之后还有一道复查——超出证据范围的表述会被直接拦下。
              </p>
            </div>

            <div className="gradebox">
              <p>做法是给每条结果标上证据强度，不同强度对应不同的措辞权限：</p>
              {GRADES.map((g) => (
                <div className="grade" key={g.en}>
                  <div className="g-n">
                    <span className={`pd ${g.dot}`} />
                    <span>
                      {g.name}
                      <small>{g.en}</small>
                    </span>
                  </div>
                  <div className="g-c">
                    <em>可以写</em>
                    <span className="g-ok">{g.can}</span>
                  </div>
                  <div className="g-c">
                    <em>限制</em>
                    <span className="g-no">{g.limit}</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 适合谁 ── */}
      <section className="sec">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">先说清楚</p>
            <h2 className="h2">它适合谁，不适合谁。</h2>
            <p className="lede">与其让你试完才发现不对路，不如现在就讲明白。</p>

            <div className="fit">
              <div className="fit-c">
                <div className="fit-h">
                  <i />
                  适合你，如果
                </div>
                <ul>
                  <li>你同时在投两个以上方向，要维护多份材料</li>
                  <li>你经历不少，但每次都要重新想怎么讲</li>
                  <li>你在转行，需要把旧经历重新组织成新叙事</li>
                  <li>你被面试追问过，从此不敢随便写</li>
                  <li>你打算长期求职，希望经历能一直累积下去</li>
                </ul>
              </div>
              <div className="fit-c no">
                <div className="fit-h">
                  <i />
                  不适合你，如果
                </div>
                <ul>
                  <li>你想要视觉花哨的简历模板</li>
                  <li>你希望 AI 直接帮你编出漂亮的成绩</li>
                  <li>你只投一个岗位，改一次就完事</li>
                  <li>你需要现在立刻用上——内测名额按顺序发放</li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 定价 ──
          四层的顺序是说服顺序，不能调换：先给观点，再给机制，
          然后才给商品，最后消除顾虑。用户没先理解「按动作计费」，
          看到 200 分只会问这是什么单位。 ── */}
      <section className="sec" id="pricing">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">定价</p>
            {/* ① 论点。标题给的是观点不是价格 —— 观点会被记住，价格表不会。 */}
            <h2 className="h2">不是订阅。你只在用的时候花钱。</h2>
            <p className="lede">
              找工作是有窗口的，通常两到四个月。为一整年付费、拿到 offer
              就退订，这笔账对谁都不划算。所以 Proofly
              按动作计费：用一次扣一次，没用完的一直留着。空窗期不花一分钱，档案照样能维护。
            </p>

            {/* ② 分界。全页第二处可以讲机制的地方（第一处是证明度）。 */}
            <div className="split">
              <div className="sp free">
                <h3 className="sp-h" id="pricing-free">
                  <i />
                  永久免费
                </h3>
                <p className="sp-s">这些功能由代码算出来，不调用大模型，所以不向你收费。</p>
                <ul aria-labelledby="pricing-free">
                  {FREE_ITEMS.map((it) => (
                    <li key={it.name}>
                      <span>{it.name}</span>
                      <em>{it.quota}</em>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="sp paid">
                <h3 className="sp-h" id="pricing-paid">
                  <i />
                  消耗积分
                </h3>
                <p className="sp-s">
                  需要大模型工作的动作。每个动作明码标价，不按 token 浮动计费。
                </p>
                <ul aria-labelledby="pricing-paid">
                  {PAID_ITEMS.map((it) => (
                    <li key={it.name}>
                      <span>{it.name}</span>
                      <em>{it.quota}</em>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ③ 积分包。内测期不放禁用态按钮 —— 没有按钮就没有失败的点击。
                卡片也不是链接不是按钮，屏幕阅读器不该提示它可交互。 */}
            <div className="packs">
              {PACKS.map((pk) => (
                <div className={`pk${pk.hot ? " hot" : ""}`} key={pk.name}>
                  {pk.hot && <span className="pk-tag">最常用</span>}
                  <div className="pk-n">{pk.name}</div>
                  <div className="pk-c">
                    {pk.credits}
                    <small>积分</small>
                  </div>
                  <p className="pk-d">{pk.desc}</p>
                  <p className="pk-p">{PRICE_SLOT[PRICING_STAGE]}</p>
                </div>
              ))}
            </div>

            {/* ④ 承诺。 */}
            <div className="vows">
              {VOWS.map((v) => (
                <div className="vow" key={v.t}>
                  <b>{v.t}</b>
                  {v.d}
                </div>
              ))}
            </div>

            <p className="note">
              内测期不收费，也不开放购买——全部功能可用，注册即送 3
              份材料解析额度。积分单价会在正式版上线前公布。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="sec" id="faq">
        <div className="mid">
          <Reveal>
            <p className="eyebrow">常见问题</p>
            <h2 className="h2">你可能想先问清楚的。</h2>

            <div className="faq">
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <div className="a">{f.a}</div>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta" id="join">
        <div className="cta-deco" aria-hidden="true">
          {DECO.map((c) => (
            <i
              key={c.d}
              style={{ width: c.d, height: c.d, left: c.left, top: c.top, opacity: Number(c.opacity) }}
            />
          ))}
        </div>
        <div className="mid cta-in">
          <h2>
            先把旧简历交给它，
            <br />
            看看你的经历到底有多少。
          </h2>
          <p className="cta-lede">
            内测期不收费，注册即送 3 份材料解析额度。留个邮箱就行。
          </p>

          <JoinForm />

          <p className="fine">随时回一封信就能删除你的邮箱。</p>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-in">
          <LogoWordmark height={18} />
          <span>把经历做成资产，让每一次努力都不被浪费</span>
        </div>
      </footer>
    </div>
  );
}
