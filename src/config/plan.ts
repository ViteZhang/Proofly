// =============================================================
// Proofly · 计费方案
//
// 全项目唯一写死「一个动作值多少分」的地方。业务代码一律 import
// 这里的常量，别处不许出现 15 / 25 / 20 这些数字 —— 与
// scoring/config.ts、planning/config.ts 同一条规矩。
//
// 一条硬约束：ACTION_PRICES 里任何一项都只可下调，不可上调。
// 见 plan.guard.ts。对外承诺「每个动作的标价只会降、不会涨」
// 靠的就是那个文件，不是靠自觉。
//
// 上游：《商业化技术方案 v1.0》第 2.1 节 ·《商业化 C1》切片 1
// =============================================================

/** 价目表版本。分值有任何变动都要往前推这个日期。 */
export const PLAN_VERSION = "2026.09.01";

/**
 * 每个付费动作的标价，单位是积分。
 *
 * 命名规则：动作码就是 key，与 usage_logs.action_code、
 * credit_holds.action_code 里存的字符串一字不差。
 *
 * 分值目前仍是初值 —— 样本量不足以算 P90（商业化方案 9.4 警告一）。
 * 在转正式之前不对外承诺「只降不升」，但代码里的守卫从现在就锁住，
 * 免得先涨了一次再想起来还有这条承诺。
 */
export const ACTION_PRICES = {
  /** 文档解析，≤5 段经历 */
  doc_parse_base: 15,
  /** 每多一段经历 */
  doc_parse_extra_seg: 3,
  /** 扫描件每页附加 */
  doc_parse_scan_page: 1,
  /** 随手记·记录轮次，每月前 20 轮免费（见 FREE_QUOTA） */
  chat_record: 0,
  /** 随手记·超出免费额度后的记录轮次 */
  chat_record_overage: 1,
  /** 随手记·闲聊轮次，永久免费，但计入反滥用日上限 */
  chat_smalltalk: 0,
  /** 岗位匹配分析 */
  target_assess: 5,
  /** 缺口 → 行动清单（技术方案 9.1，已确认 3 分） */
  task_plan: 3,
  /** 方向基线简历 */
  resume_baseline: 10,
  /** 按 JD 生成的投递版本 */
  resume_delta: 8,
  /** 单块重写 */
  resume_block: 2,
  /** 面试题包 */
  interview_kit: 25,
  /** 体检深扫 C8（技术方案 9.1，已确认整包 5 分，单次最多 10 条经历） */
  health_deep_scan: 5,
} as const;

/** 动作码。业务代码用它做类型约束，不要自己写字符串字面量。 */
export type ActionCode = keyof typeof ACTION_PRICES;

/**
 * 动作的中文名。
 *
 * 界面文案与消费记录都从这里取 —— 同一个动作在按钮上叫「生成基线简历」、
 * 在流水里叫「基线生成」的话，用户对不上账。
 */
export const ACTION_LABELS: Record<string, string> = {
  doc_parse_base: "解析文档",
  chat_record: "对话式维护",
  chat_record_overage: "对话式维护",
  chat_smalltalk: "对话",
  target_assess: "解析并评估",
  task_plan: "生成行动清单",
  resume_baseline: "生成基线简历",
  resume_delta: "生成投递版本",
  resume_block: "重写这一块",
  interview_kit: "生成面试题包",
  health_deep_scan: "深度扫描",
  health_check_fast: "一致性体检",
  evidence_derive: "证据等级推导",
  skill_strength: "技能证据强度",
  task_priority: "行动排序",
  resume_score_fact: "评分·事实一致性",
  resume_score_evidence: "评分·证据强度",
  resume_score_clarity: "评分·表达清晰度",
  data_export: "数据导出",
};

/** 二次确认的门槛。以下直接执行 —— 5 分以下反复确认会很烦。 */
export const CONFIRM_THRESHOLD = 10;

/** 余额低于这个数变橙并提示一次。 */
export const LOW_BALANCE = 30;

/**
 * 永久免费的动作。
 *
 * 共同点：要么是纯代码算的（不花钱），要么是「让用户知道自己
 * 现在处境」的动作 —— 对这类收费等于收「看一眼自己档案」的钱。
 *
 * 它们不 HOLD、不扣分，但仍然写 usage_logs（credits_charged = 0），
 * 因为免费不等于零成本，成本要看得见。
 */
export const FREE_FOREVER = [
  "health_check_fast", // 体检快扫
  "evidence_derive", // 证据等级推导
  "skill_strength", // 技能证据强度
  "task_priority", // 待办优先级排序
  "resume_score_fact", // 评分·事实一致性
  "resume_score_evidence", // 评分·证据强度
  "resume_score_clarity", // 评分·表达清晰度
  "data_export", // 数据导出（承诺 4：导出不要钱）
] as const;

export type FreeForeverCode = (typeof FREE_FOREVER)[number];

/** 免费额度与新用户赠送。 */
export const FREE_QUOTA = {
  /** 随手记·记录轮次的月度免费次数 */
  chat_record_per_month: 20,
  /** 每日对话总轮次硬上限。这是反滥用，不是计费 —— 不扣分，也不受余额影响。 */
  chat_daily_hard_cap: 200,
  /** 注册赠送。45 分 = 3 份文档解析，与官网首页「注册送 3 份材料解析」对齐。 */
  signup_grant_credits: 45,
};

/**
 * 全站免费动作的预算护栏。
 *
 * 单位是分（与 usage_logs.cost_cents 一致）。¥200/日 大约是 40 个
 * 新用户的赠送额度。
 *
 * 触顶后**只掐获客支出**：新注册赠送暂停发放；已有用户的限次免费
 * 对话照常，永久免费的纯代码功能不受影响，付费动作不受影响。
 * 切断已有用户的免费对话会直接伤害档案沉淀 —— 那是留存支出，
 * 掐它等于为了省钱把产品的地基拆了。
 */
export const BUDGET = {
  /** 日上限 */
  free_daily_cap_cents: 20_000,
  /** 一个新用户的赠送额度按多少成本预估。护栏据此判断还发不发得起。 */
  signup_grant_est_cost_cents: 500,
};

/** 各类阈值。都是「改一个数字就生效」的东西，不要散落到业务代码里。 */
export const LIMITS = {
  /** 同一指纹的免费重生成窗口 */
  regen_free_window_hours: 24,
  /** 窗口内的免费重生成次数上限（滥用防护） */
  regen_free_max_times: 3,
  /** 深扫单次最多扫多少条经历，超出分批 */
  health_deep_scan_max_atoms: 10,
  /** 同步动作的预扣存活时长（分钟） */
  hold_ttl_sync_min: 5,
  /** 异步动作的预扣存活时长（分钟） */
  hold_ttl_async_min: 25,
};

/**
 * 积分包。
 *
 * 本期不接支付（技术方案第 8 节）：零售价未经支付意愿验证，现在接等于
 * 把没验证过的价格固化。这里的 price_cny 只用于展示与后续对接，
 * 购买入口按官网 v3 的阶段配置控制。
 */
export const PACKAGES = [
  {
    id: "trial",
    name: "体验包",
    credits: 50,
    price_cny: 18,
    desc: "够解析 2 份材料 + 生成 1 版基线简历",
  },
  {
    id: "job",
    name: "求职包",
    credits: 200,
    price_cny: 68,
    featured: true,
    desc: "够完整跑通一个方向：解析 5 份材料 + 5 次方向评估 + 8 版简历 + 一套面试题包",
  },
  {
    id: "long",
    name: "长期包",
    credits: 600,
    price_cny: 188,
    desc: "够同时推进 3 个方向，含全部面试准备",
  },
];
