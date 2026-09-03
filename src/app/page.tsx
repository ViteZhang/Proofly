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
    description: "经历录一次，简历生成无数次。AI 只整理，不编造。",
    type: "website",
  },
};

// 五个功能的顺序就是叙事：建档 → 生成 → 匹配 → 提分 → 面试。
// 编号之间那条竖线不是装饰，这五步真的有先后依赖。
//
// 每块第三条 bullet 固定处理一个顾虑（会不会越录越乱 / 格式能不能直接投 /
// 分析完了然后呢 / 会不会又给我编），不是凑数。
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
              内测中 · 内测期完全免费
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

      {/* ── 定价 ── */}
      <section className="sec" id="pricing">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">定价</p>
            <h2 className="h2">内测期完全免费。</h2>
            <p className="lede">
              正式版上线时，内测用户锁定早鸟价，并保留一段免费使用期。不会出现「用着用着突然要付费」的情况。
            </p>

            <div className="price">
              <div className="pc now">
                <div className="pc-lab">现在 · 内测</div>
                <div className="pc-amt">
                  ¥0<small>全部功能</small>
                </div>
                <p className="pc-d">
                  名额有限，按申请顺序发邀请。用得上的功能全部开放，没有次数限制。
                </p>
                <ul>
                  <li>职业档案，容量不设限</li>
                  <li>不限求职方向、不限简历版本</li>
                  <li>岗位匹配、简历评分、面试题全开</li>
                  <li>直接影响产品走向：你的反馈会被采纳</li>
                </ul>
                <a href="#join" className="btn">
                  免费加入内测
                </a>
              </div>
              <div className="pc later">
                <div className="pc-lab">正式版</div>
                <div className="pc-amt">
                  早鸟价<small>上线前公布</small>
                </div>
                <p className="pc-d">
                  具体价格会在上线前提前通知，内测用户享受早鸟折扣。免费额度会保留，轻度使用不必付费。
                </p>
                <ul>
                  <li>内测用户锁定早鸟价</li>
                  <li>提前 30 天告知，不搞突然收费</li>
                  <li>保留免费额度</li>
                  <li>随时导出你的全部数据</li>
                </ul>
                <a href="#join" className="btn ghost">
                  先加入内测锁定价格
                </a>
              </div>
            </div>
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
          <p className="cta-lede">内测期完全免费，留个邮箱就行。</p>

          <JoinForm />

          <p className="fine">随时回一封信就能删除你的邮箱。</p>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-in">
          <LogoWordmark height={18} />
          <span>让你的经历真正产生价值</span>
        </div>
      </footer>
    </div>
  );
}
