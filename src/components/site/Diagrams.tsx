// 官网的六张示意图，全部内联 SVG。
//
// 为什么不用截图：截图会过期，而且截图是在承诺一个具体界面。抽象图传达
// 的是机制，产品改版了也不用重拍。共用语言见 site.css 末尾的 .dg-* 一节。
//
// 颜色一律走 token，不写死十六进制 —— 示意图和产品是同一套色板，
// 哪天 --proof 调了，这六张图跟着变。

/** Hero：一份档案分流出三个方向的简历。全页唯一编排过的动效。 */
export function HeroDiagram() {
  return (
    <svg viewBox="0 0 480 340" role="img" aria-label="一份职业档案分流生成三份定向简历的示意图">
      {/* 档案主体 */}
      <rect x="8" y="72" width="176" height="196" rx="12" className="dg-card" strokeWidth="1" />
      <text x="26" y="98" className="dg-txt" fontSize="11" fill="var(--ink)" fontWeight="600">
        职业档案
      </text>
      <text x="26" y="114" className="dg-txt-s">
        唯一事实来源
      </text>
      <line x1="26" y1="126" x2="166" y2="126" className="dg-line" />
      <g>
        <circle cx="30" cy="146" r="4" className="dg-g" />
        <rect x="42" y="141" width="112" height="9" rx="4.5" className="dg-soft" />
        <circle cx="30" cy="170" r="4" className="dg-g" />
        <rect x="42" y="165" width="92" height="9" rx="4.5" className="dg-soft" />
        <circle cx="30" cy="194" r="4" fill="none" stroke="var(--proof)" strokeWidth="1.5" />
        <rect x="42" y="189" width="122" height="9" rx="4.5" className="dg-soft" />
        <circle cx="30" cy="218" r="4" className="dg-g" />
        <rect x="42" y="213" width="80" height="9" rx="4.5" className="dg-soft" />
        <circle
          cx="30"
          cy="242"
          r="4"
          fill="none"
          stroke="var(--ghost)"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
        <rect x="42" y="237" width="104" height="9" rx="4.5" className="dg-soft" />
      </g>

      {/* 分流线 */}
      <path d="M184 170 C 232 170 232 58 288 58" className="hv-line" />
      <path d="M184 170 C 232 170 232 170 288 170" className="hv-line l2" />
      <path d="M184 170 C 232 170 232 282 288 282" className="hv-line l3" />

      {/* 三份简历 */}
      <g className="hv-card c1">
        <rect x="288" y="22" width="176" height="72" rx="10" className="dg-card" strokeWidth="1" />
        <text x="304" y="44" className="dg-txt" fontSize="10.5" fill="var(--ink)" fontWeight="600">
          AI 产品方向
        </text>
        <rect x="304" y="54" width="132" height="7" rx="3.5" className="dg-soft" />
        <rect x="304" y="66" width="104" height="7" rx="3.5" className="dg-soft" />
        <rect x="304" y="78" width="60" height="7" rx="3.5" fill="var(--proof-soft)" />
      </g>
      <g className="hv-card c2">
        <rect x="288" y="134" width="176" height="72" rx="10" className="dg-card" strokeWidth="1" />
        <text x="304" y="156" className="dg-txt" fontSize="10.5" fill="var(--ink)" fontWeight="600">
          增长方向
        </text>
        <rect x="304" y="166" width="112" height="7" rx="3.5" className="dg-soft" />
        <rect x="304" y="178" width="132" height="7" rx="3.5" className="dg-soft" />
        <rect x="304" y="190" width="76" height="7" rx="3.5" fill="var(--proof-soft)" />
      </g>
      <g className="hv-card c3">
        <rect x="288" y="246" width="176" height="72" rx="10" className="dg-card" strokeWidth="1" />
        <text x="304" y="268" className="dg-txt" fontSize="10.5" fill="var(--ink)" fontWeight="600">
          B 端解决方案
        </text>
        <rect x="304" y="278" width="96" height="7" rx="3.5" className="dg-soft" />
        <rect x="304" y="290" width="124" height="7" rx="3.5" className="dg-soft" />
        <rect x="304" y="302" width="52" height="7" rx="3.5" fill="var(--proof-soft)" />
      </g>
    </svg>
  );
}

/** 01 超级档案：散落材料 → 结构化经历条目 */
export function ArchiveDiagram() {
  return (
    <svg viewBox="0 0 360 190" role="img" aria-label="零散材料被整理为结构化经历条目">
      <text x="0" y="12" className="dg-txt-s">
        散落的材料
      </text>
      <g transform="rotate(-5 60 46)">
        <rect x="4" y="26" width="112" height="40" rx="7" className="dg-card" strokeWidth="1" />
        <rect x="16" y="38" width="66" height="6" rx="3" className="dg-soft" />
        <rect x="16" y="50" width="84" height="6" rx="3" className="dg-soft" />
      </g>
      <g transform="rotate(3 60 96)">
        <rect x="10" y="76" width="112" height="40" rx="7" className="dg-card" strokeWidth="1" />
        <rect x="22" y="88" width="82" height="6" rx="3" className="dg-soft" />
        <rect x="22" y="100" width="54" height="6" rx="3" className="dg-soft" />
      </g>
      <g transform="rotate(-3 60 146)">
        <rect x="2" y="126" width="112" height="40" rx="7" className="dg-card" strokeWidth="1" />
        <rect x="14" y="138" width="70" height="6" rx="3" className="dg-soft" />
        <rect x="14" y="150" width="88" height="6" rx="3" className="dg-soft" />
      </g>

      <path d="M132 96 H 176" className="flow" />
      <path
        d="M170 91 l7 5 -7 5"
        fill="none"
        stroke="var(--ghost)"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <text x="192" y="12" className="dg-txt-s">
        结构化经历
      </text>
      <rect x="192" y="26" width="164" height="140" rx="10" className="dg-card" strokeWidth="1" />
      <g>
        <circle cx="208" cy="48" r="4" className="dg-g" />
        <rect x="220" y="43" width="104" height="8" rx="4" className="dg-soft" />
        <circle cx="208" cy="76" r="4" className="dg-g" />
        <rect x="220" y="71" width="86" height="8" rx="4" className="dg-soft" />
        <circle cx="208" cy="104" r="4" fill="none" stroke="var(--proof)" strokeWidth="1.5" />
        <rect x="220" y="99" width="112" height="8" rx="4" className="dg-soft" />
        <circle cx="208" cy="132" r="4" className="dg-g" />
        <rect x="220" y="127" width="72" height="8" rx="4" className="dg-soft" />
      </g>
    </svg>
  );
}

/** 02 多方向定制简历：基线 → 三个投递版本，各自标注改动数 */
export function ResumeDiagram() {
  return (
    <svg viewBox="0 0 360 190" role="img" aria-label="一份基线简历派生出多个投递版本">
      <rect x="4" y="30" width="120" height="130" rx="10" className="dg-card" strokeWidth="1" />
      <text x="18" y="52" className="dg-txt" fontSize="10" fill="var(--ink)" fontWeight="600">
        基线简历
      </text>
      <rect x="18" y="62" width="88" height="7" rx="3.5" className="dg-soft" />
      <rect x="18" y="76" width="70" height="7" rx="3.5" className="dg-soft" />
      <rect x="18" y="90" width="92" height="7" rx="3.5" className="dg-soft" />
      <rect x="18" y="104" width="60" height="7" rx="3.5" className="dg-soft" />
      <rect x="18" y="118" width="80" height="7" rx="3.5" className="dg-soft" />
      <rect x="18" y="132" width="48" height="7" rx="3.5" className="dg-soft" />

      <path d="M124 95 C 152 95 152 58 176 58" className="flow" />
      <path d="M124 95 H 176" className="flow" />
      <path d="M124 95 C 152 95 152 132 176 132" className="flow" />

      <g>
        <rect x="180" y="30" width="176" height="52" rx="9" className="dg-card" strokeWidth="1" />
        <text x="194" y="49" className="dg-txt-s">
          投 A 公司 · 改了 3 处
        </text>
        <rect x="194" y="58" width="66" height="6" rx="3" fill="var(--proof-soft)" />
        <rect x="266" y="58" width="76" height="6" rx="3" className="dg-soft" />
        <rect x="194" y="70" width="100" height="6" rx="3" className="dg-soft" />
      </g>
      <g>
        <rect x="180" y="90" width="176" height="30" rx="9" className="dg-card" strokeWidth="1" />
        <text x="194" y="109" className="dg-txt-s">
          投 B 公司 · 改了 2 处
        </text>
      </g>
      <g>
        <rect x="180" y="128" width="176" height="30" rx="9" className="dg-card" strokeWidth="1" />
        <text x="194" y="147" className="dg-txt-s">
          投 C 公司 · 改了 4 处
        </text>
      </g>
    </svg>
  );
}

/** 03 岗位匹配：匹配度环 + 四条要求逐条对照 */
export function MatchDiagram() {
  return (
    <svg viewBox="0 0 360 190" role="img" aria-label="岗位要求逐条对照档案经历并给出匹配度">
      <circle cx="52" cy="72" r="38" fill="none" stroke="var(--line-soft)" strokeWidth="9" />
      <circle
        cx="52"
        cy="72"
        r="38"
        fill="none"
        stroke="var(--proof)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray="239"
        strokeDashoffset="72"
        transform="rotate(-90 52 72)"
      />
      <text x="52" y="72" className="dg-num" fontSize="22" textAnchor="middle">
        70
      </text>
      <text x="52" y="88" className="dg-txt-s" textAnchor="middle">
        匹配度
      </text>
      <text x="52" y="130" className="dg-txt-s" textAnchor="middle">
        对照 8 条要求
      </text>

      <g>
        <rect x="122" y="22" width="234" height="30" rx="8" className="dg-card" strokeWidth="1" />
        <circle cx="140" cy="37" r="5" className="dg-g" />
        <rect x="154" y="33" width="112" height="7" rx="3.5" className="dg-soft" />
        <text x="336" y="41" className="dg-txt-s" textAnchor="end">
          已满足
        </text>
      </g>
      <g>
        <rect x="122" y="60" width="234" height="30" rx="8" className="dg-card" strokeWidth="1" />
        <circle cx="140" cy="75" r="5" className="dg-g" />
        <rect x="154" y="71" width="88" height="7" rx="3.5" className="dg-soft" />
        <text x="336" y="79" className="dg-txt-s" textAnchor="end">
          已满足
        </text>
      </g>
      <g>
        <rect x="122" y="98" width="234" height="30" rx="8" className="dg-card" strokeWidth="1" />
        <circle cx="140" cy="113" r="5" fill="none" stroke="var(--proof)" strokeWidth="1.6" />
        <rect x="154" y="109" width="102" height="7" rx="3.5" className="dg-soft" />
        <text x="336" y="117" className="dg-txt-s" textAnchor="end">
          缺证据
        </text>
      </g>
      <g>
        <rect
          x="122"
          y="136"
          width="234"
          height="30"
          rx="8"
          className="dg-card"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle
          cx="140"
          cy="151"
          r="5"
          fill="none"
          stroke="var(--ghost)"
          strokeWidth="1.6"
          strokeDasharray="2 2"
        />
        <rect x="154" y="147" width="76" height="7" rx="3.5" className="dg-soft" />
        <text x="336" y="155" className="dg-txt-s" textAnchor="end">
          空缺
        </text>
      </g>
    </svg>
  );
}

/** 04 简历评分：分数 + 三维度条 + 三处待改 */
export function ScoreDiagram() {
  return (
    <svg viewBox="0 0 360 190" role="img" aria-label="简历评分与薄弱项提示">
      <rect x="4" y="24" width="150" height="142" rx="10" className="dg-card" strokeWidth="1" />
      <text x="79" y="62" className="dg-num" fontSize="40" textAnchor="middle">
        78
      </text>
      <text x="79" y="80" className="dg-txt-s" textAnchor="middle">
        综合得分
      </text>
      <line x1="24" y1="94" x2="134" y2="94" className="dg-line" />
      <g>
        <text x="24" y="112" className="dg-txt-s">
          事实一致
        </text>
        <rect x="86" y="106" width="48" height="6" rx="3" className="dg-gs" />
        <rect x="86" y="106" width="44" height="6" rx="3" className="dg-g" />
        <text x="24" y="132" className="dg-txt-s">
          证据强度
        </text>
        <rect x="86" y="126" width="48" height="6" rx="3" className="dg-gs" />
        <rect x="86" y="126" width="29" height="6" rx="3" className="dg-g" />
        <text x="24" y="152" className="dg-txt-s">
          岗位贴合
        </text>
        <rect x="86" y="146" width="48" height="6" rx="3" className="dg-gs" />
        <rect x="86" y="146" width="38" height="6" rx="3" className="dg-g" />
      </g>

      <text x="170" y="16" className="dg-txt-s">
        最该改的三处
      </text>
      <g>
        <rect x="170" y="24" width="186" height="42" rx="8" className="dg-card" strokeWidth="1" />
        <rect x="182" y="36" width="4" height="18" rx="2" fill="var(--warn)" />
        <rect x="194" y="36" width="118" height="6" rx="3" className="dg-soft" />
        <rect x="194" y="48" width="86" height="6" rx="3" className="dg-soft" />
      </g>
      <g>
        <rect x="170" y="74" width="186" height="42" rx="8" className="dg-card" strokeWidth="1" />
        <rect x="182" y="86" width="4" height="18" rx="2" fill="var(--warn)" />
        <rect x="194" y="86" width="96" height="6" rx="3" className="dg-soft" />
        <rect x="194" y="98" width="124" height="6" rx="3" className="dg-soft" />
      </g>
      <g>
        <rect x="170" y="124" width="186" height="42" rx="8" className="dg-card" strokeWidth="1" />
        <rect x="182" y="136" width="4" height="18" rx="2" fill="var(--ghost)" />
        <rect x="194" y="136" width="108" height="6" rx="3" className="dg-soft" />
        <rect x="194" y="148" width="72" height="6" rx="3" className="dg-soft" />
      </g>
    </svg>
  );
}

/** 05 面试题：题目卡 + 答题骨架 */
export function InterviewDiagram() {
  return (
    <svg viewBox="0 0 360 190" role="img" aria-label="基于简历生成的面试题目与答题骨架">
      <g>
        <rect x="4" y="16" width="352" height="90" rx="10" className="dg-card" strokeWidth="1" />
        <circle cx="26" cy="38" r="7" className="dg-gs" />
        <text
          x="26"
          y="41"
          className="dg-num"
          fontSize="8"
          textAnchor="middle"
          fill="var(--proof-ink)"
        >
          Q
        </text>
        <rect x="42" y="30" width="196" height="8" rx="4" className="dg-soft" />
        <rect x="42" y="44" width="128" height="8" rx="4" className="dg-soft" />
        <line x1="42" y1="62" x2="336" y2="62" className="dg-line" />
        <text x="42" y="78" className="dg-txt-s">
          答题骨架
        </text>
        <circle cx="46" cy="90" r="3" className="dg-g" />
        <rect x="56" y="86" width="104" height="6" rx="3" className="dg-soft" />
        <circle cx="176" cy="90" r="3" className="dg-g" />
        <rect x="186" y="86" width="82" height="6" rx="3" className="dg-soft" />
        <circle cx="284" cy="90" r="3" className="dg-g" />
        <rect x="294" y="86" width="42" height="6" rx="3" className="dg-soft" />
      </g>
      <g opacity=".65">
        <rect x="4" y="116" width="352" height="30" rx="9" className="dg-card" strokeWidth="1" />
        <circle cx="26" cy="131" r="7" className="dg-gs" />
        <text
          x="26"
          y="134"
          className="dg-num"
          fontSize="8"
          textAnchor="middle"
          fill="var(--proof-ink)"
        >
          Q
        </text>
        <rect x="42" y="127" width="168" height="8" rx="4" className="dg-soft" />
      </g>
      <g opacity=".38">
        <rect x="4" y="154" width="352" height="30" rx="9" className="dg-card" strokeWidth="1" />
        <circle cx="26" cy="169" r="7" className="dg-gs" />
        <text
          x="26"
          y="172"
          className="dg-num"
          fontSize="8"
          textAnchor="middle"
          fill="var(--proof-ink)"
        >
          Q
        </text>
        <rect x="42" y="165" width="142" height="8" rx="4" className="dg-soft" />
      </g>
    </svg>
  );
}

/** 痛点三张小图标 */
export function PainIconStack() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="2" width="9" height="12" rx="2" fill="none" stroke="var(--mute)" strokeWidth="1.4" />
      <rect x="5" y="5" width="9" height="12" rx="2" fill="var(--bg)" stroke="var(--mute)" strokeWidth="1.4" />
    </svg>
  );
}

export function PainIconUnsure() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7" fill="none" stroke="var(--mute)" strokeWidth="1.4" />
      <path d="M9 5.5v4" stroke="var(--mute)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="12.4" r=".9" fill="var(--mute)" />
    </svg>
  );
}

export function PainIconWarn() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        d="M3 14 L9 3 L15 14 Z"
        fill="none"
        stroke="var(--mute)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M9 7.5v3" stroke="var(--mute)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="12.2" r=".85" fill="var(--mute)" />
    </svg>
  );
}
