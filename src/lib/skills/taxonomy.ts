// =============================================================
// Proofly · 技能分类与归并
//
// 技能栏是策略层的产物,不是事实层的转储。
//
// 库里那 82 条是「他会什么」,那是事实;简历上该印的是「这个岗位关心的
// 能力域 + 他的证据」,那是判断。把事实层原样倒出来,读的人得到的是
// 「产品设计 / 产品定义 / 产品规划 / 产品架构设计 / 产品系统设计 /
// 产品战略规划 / 产品方案与文档设计」—— 七个近义词,零信息。
//
// 分类与归并写在代码里,不写进库:
//   · 它们是产品判断,不是用户的职业事实,放进 skills 表会污染事实层;
//   · 也不该让用户去填 82 行 category —— 那是一次纯体力劳动。
// 库里的 category 列保留,作为用户显式覆盖的通道,优先级高于这张表。
//
// 纯函数,不连库、不 import Next。
// =============================================================

/** 一个能力域。keywords 有序,先匹配上的先算 —— 分类结果必须是确定的。 */
export type SkillCategory = {
  name: string;
  keywords: string[];
};

/** 没归到任何域的落在这里。它被单独限得更紧,见 OTHER_LIMIT。 */
export const OTHER_CATEGORY = "其他";

/**
 * 六个能力域,顺序即简历上的输出顺序。
 *
 * 域名沿用人工版那六行。关键词比域名宽一些 —— 域名是给读的人看的,
 * 关键词是拿来分类的,两者不必字面对应。
 */
export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    name: "AI 对话产品",
    keywords: [
      "对话系统", "对话产品", "Multi-Agent", "多智能体", "智能体", "Agent",
      "意图识别", "意图体系", "上下文管理", "上下文", "记忆系统", "冷启动策略",
      "推荐系统", "个性化学习系统", "语义检索", "向量检索", "RAG",
      "AI 产品", "AI产品", "AI 系统", "AI系统", "LLM 应用", "LLM应用",
    ],
  },
  {
    name: "提示词工程",
    keywords: [
      "提示词", "Prompt", "prompt", "Few-shot", "few-shot", "结构化输出",
      "System Prompt", "置信度分级",
    ],
  },
  {
    name: "AI 内容安全与质量",
    keywords: [
      "幻觉", "拒答", "内容安全", "风险识别", "Human-in-the-loop",
      "人机协作", "证据等级", "安全边界", "合规",
    ],
  },
  {
    name: "模型能力与成本",
    keywords: [
      "模型横评", "模型选型", "模型分级", "模型可替换", "适配层",
      "大模型 API", "大模型API", "token", "Token", "成本实测", "单位经济模型",
      "成本",
    ],
  },
  {
    name: "数据与增长",
    keywords: [
      "数据分析", "数据建模", "数据闭环", "漏斗", "cohort", "留存", "粘性",
      "指标体系", "北极星", "埋点", "转化", "用户行为", "流量运营", "社群运营",
      "内容变现", "商业化", "商业模式", "评分模式", "业务验证", "竞品分析",
      "用户需求分析", "用户转化",
    ],
  },
  {
    name: "设计与交付",
    keywords: [
      "产品定义与架构设计", "产品设计", "产品定位", "产品规划", "产品架构",
      "产品系统", "产品战略", "信息架构", "对象模型", "模块化", "中台化",
      "配置化", "平台产品", "后台产品", "移动端产品", "交互设计", "新手引导",
      "设计系统", "全栈", "AI 辅助开发", "AI辅助开发", "独立交付",
      "Next.js", "React", "Supabase", "Java", "TypeScript", "Python",
    ],
  },
];

/**
 * 近义词归并。左边是要合掉的写法,右边是留在简历上的那一个。
 *
 * 只归并「说的是同一件事」的。「产品规划」与「产品架构设计」在职位说明里
 * 常常是两回事,但在一份简历的技能栏里并排出现时,它们只是同一个能力被
 * 拆成了两个词 —— 读的人不会因为多看一个词而多知道一件事。
 */
export const SKILL_MERGE: { canonical: string; aliases: string[] }[] = [
  {
    canonical: "产品定义与架构设计",
    aliases: [
      "产品设计", "产品定义", "产品规划", "产品架构设计", "产品系统设计",
      "产品战略规划", "产品方案与文档设计", "产品定位设计", "平台产品规划",
    ],
  },
  { canonical: "提示词工程", aliases: ["Prompt Engineering", "prompt engineering", "提示词架构"] },
  { canonical: "AI 幻觉治理", aliases: ["幻觉治理", "幻觉防治"] },
  { canonical: "社群运营", aliases: ["社群运营协同"] },
  { canonical: "转化率优化", aliases: ["用户转化优化"] },
  { canonical: "全栈开发", aliases: ["独立全栈交付", "全栈交付"] },
  { canonical: "用户需求分析", aliases: ["需求分析"] },
  { canonical: "数据分析", aliases: ["用户行为数据分析"] },
  { canonical: "业务流程数字化", aliases: ["业务流程梳理"] },
];

/** 每个域最多几条。多于这个数就不是「能力域」,是又一次倾倒。 */
export const GROUP_LIMIT = 6;
/** 技能栏总条数上限。 */
export const TOTAL_LIMIT = 24;
/** 「其他」组限得更紧 —— 它本来就是没归好类的那些。 */
export const OTHER_LIMIT = 4;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const m of SKILL_MERGE) {
  for (const a of m.aliases) ALIAS_TO_CANONICAL.set(norm(a), m.canonical);
}

/** 归一到规范词。不在归并表里的原样返回。 */
export function mergeSkillLabel(label: string): string {
  const t = label.trim();
  return ALIAS_TO_CANONICAL.get(norm(t)) ?? t;
}

/**
 * 这个技能归哪个域。
 *
 * 命中多个域时取第一个 —— SKILL_CATEGORIES 与其中的 keywords 都是有序的,
 * 所以同一个词每次都会落到同一个域,不会因为查询顺序变了就换个位置。
 */
export function categoryOf(label: string, override?: string | null): string {
  const explicit = (override ?? "").trim();
  // 用户显式填过 category 就听用户的,哪怕它不在六个域里 —— 那是他的判断。
  if (explicit !== "") return explicit;

  const t = norm(label);
  for (const c of SKILL_CATEGORIES) {
    for (const k of c.keywords) {
      if (t.includes(norm(k))) return c.name;
    }
  }
  return OTHER_CATEGORY;
}

export type SkillGroup = { category: string; items: string[] };

export type CurateOptions = {
  /** 库里的 category 覆盖,按原始 label 索引。 */
  overrides?: Map<string, string | null>;
  groupLimit?: number;
  totalLimit?: number;
};

/**
 * 归并 → 分类 → 限量。
 *
 * 输入顺序即优先级:调用方已经把「与这个岗位相关的」排在前面,这里只
 * 负责在每个域里从前往后取,取满为止。
 *
 * 幂等:对已经整理过的列表再跑一次,结果不变。存量简历里那 66 条平铺
 * 标签因此不用重新生成也能收敛。
 */
export function curateSkills(labels: string[], opts: CurateOptions = {}): SkillGroup[] {
  const groupLimit = opts.groupLimit ?? GROUP_LIMIT;
  const totalLimit = opts.totalLimit ?? TOTAL_LIMIT;

  const order: string[] = [];
  const buckets = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const raw of labels) {
    const label = mergeSkillLabel(raw);
    if (label === "") continue;
    const key = norm(label);
    if (seen.has(key)) continue;
    seen.add(key);

    const category = categoryOf(label, opts.overrides?.get(raw));
    if (!buckets.has(category)) {
      buckets.set(category, []);
      order.push(category);
    }
    buckets.get(category)!.push(label);
  }

  // 输出顺序:六个域按 SKILL_CATEGORIES 的固定次序,用户自定义的域按它们
  // 第一次出现的先后接在后面,「其他」永远最后。
  const known = SKILL_CATEGORIES.map((c) => c.name);
  const custom = order.filter((c) => !known.includes(c) && c !== OTHER_CATEGORY);
  const sorted = [...known, ...custom, OTHER_CATEGORY].filter((c) => buckets.has(c));

  const out: SkillGroup[] = [];
  let total = 0;
  for (const category of sorted) {
    const cap = category === OTHER_CATEGORY ? Math.min(OTHER_LIMIT, groupLimit) : groupLimit;
    const room = Math.max(0, Math.min(cap, totalLimit - total));
    if (room === 0) continue;
    const items = buckets.get(category)!.slice(0, room);
    if (items.length === 0) continue;
    out.push({ category, items });
    total += items.length;
  }
  return out;
}

/** 渲染层入口。存量简历走的也是这一条,所以它必须能吃下没整理过的列表。 */
export function groupSkills(labels: string[]): SkillGroup[] {
  return curateSkills(labels);
}

/** 整理后的扁平列表。入库存的是它,门禁 G5 查的也是它。 */
export function flattenSkills(groups: SkillGroup[]): string[] {
  return groups.flatMap((g) => g.items);
}
