// =============================================================
// Proofly · 基本信息字段登记表
//
// key 的定义放在代码里，不入库。单人产品下这是一份有限枚举，开放用户
// 自定义会让下游的简历模板永远收不敛 —— 模板得知道「这一项该印在哪」，
// 而一个用户临时造出来的 key 没人知道该印在哪。
//
// exportable 是这张表最要紧的一列：它决定一个字段会不会被原样印在简历
// 上。期望城市、期望薪资只用来筛方向和算匹配，印上去等于把自己的底牌
// 交给对面。默认值一律取「不导出」，要导出必须在这里显式写出来。
// =============================================================

export const FACT_KEYS = [
  "name",
  "phone",
  "email",
  "wechat",
  "location",
  "expected_city",
  "job_status",
  "expected_salary",
  "years_of_experience",
  "headline",
  "entity_disclosure",
] as const;

export type FactKey = (typeof FACT_KEYS)[number];

export type FactType = "text" | "tel" | "email" | "select";

export type FactSpec = {
  label: string;
  type: FactType;
  /** 计入档案完整度的必填项。缺了会影响简历第一屏或 JD 匹配。 */
  required: boolean;
  /** 会不会原样印在简历上。false 的项在界面上标「仅匹配」。 */
  exportable: boolean;
  /** 输入框里的提示。空着表示不需要额外解释。 */
  hint?: string;
  /** select 型的可选值。 */
  options?: string[];
  /** 返回错误文案，null 表示通过。只做格式提醒，不做拦截。 */
  validate?: (v: string) => string | null;
};

const digits = (v: string) => v.replace(/[\s()+-]/g, "");

export const FACT_REGISTRY: Record<FactKey, FactSpec> = {
  name: {
    label: "姓名",
    type: "text",
    required: true,
    exportable: true,
    hint: "简历上印的就是这个，跟账户里的显示名是两回事",
  },
  phone: {
    label: "手机",
    type: "tel",
    required: true,
    exportable: true,
    validate: (v) => (/^\d{7,15}$/.test(digits(v)) ? null : "看着不像手机号，确认一下"),
  },
  email: {
    label: "邮箱",
    type: "email",
    required: true,
    exportable: true,
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "邮箱格式不对"),
  },
  wechat: {
    label: "微信号",
    type: "text",
    required: false,
    // 默认不进简历：微信号一旦印在投出去的简历上就收不回来了，
    // 而它并不比邮箱和手机多提供什么。要放开在这里改一个字即可。
    exportable: false,
    hint: "只用于自己留档，默认不导出到简历",
  },
  location: {
    label: "常驻地",
    type: "text",
    required: true,
    exportable: true,
    hint: "现在人在哪。简历抬头会印",
  },
  expected_city: {
    label: "期望城市",
    type: "text",
    required: false,
    exportable: false,
    hint: "与常驻地不同才需要填。只影响 JD 匹配，不进简历",
  },
  job_status: {
    label: "求职状态",
    type: "select",
    required: false,
    exportable: false,
    options: ["在职看机会", "在职不看", "离职找工作", "在读"],
  },
  expected_salary: {
    label: "期望薪资",
    type: "text",
    required: false,
    exportable: false,
    hint: "只用来筛方向，不进简历",
  },
  years_of_experience: {
    label: "工作年限",
    type: "text",
    required: true,
    exportable: true,
    validate: (v) => (/\d/.test(v) ? null : "写个数字，比如「10 年」"),
  },
  headline: {
    label: "一句话定位",
    type: "text",
    required: false,
    exportable: true,
    hint: "简历抬头下面那一行",
  },
  entity_disclosure: {
    label: "主体披露口径",
    type: "text",
    required: false,
    exportable: false,
    hint: "公司主体与对外品牌不一致时，怎么对外说。它是规则，不是事实本身",
  },
};

export const FACT_LABEL: Record<FactKey, string> = Object.fromEntries(
  FACT_KEYS.map((k) => [k, FACT_REGISTRY[k].label]),
) as Record<FactKey, string>;

export const REQUIRED_FACT_KEYS: FactKey[] = FACT_KEYS.filter((k) => FACT_REGISTRY[k].required);

export function isFactKey(k: string): k is FactKey {
  return (FACT_KEYS as readonly string[]).includes(k);
}

/**
 * 明确不采集：性别、出生日期、婚育状况、照片。
 *
 * 这几项在 JD 匹配里提供不了正向价值，采集了反而制造一个必须处理的
 * 合规面。真遇到写了年龄硬门槛的岗位，再单加 birth_year 且默认
 * exportable = false，不要顺手把一整组人口统计字段都收进来。
 */
export const NEVER_COLLECT = ["gender", "birth_date", "marital_status", "photo"] as const;
