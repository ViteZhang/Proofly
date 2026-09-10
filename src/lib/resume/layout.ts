// =============================================================
// Proofly · 简历版面
//
// 「哪些块合成一段任职、公司名印几遍」是版面问题，不是措辞问题，
// 所以它在代码里，不在提示词里。
//
// 这一片必须是纯函数:导出的 Markdown、屏幕上的打印视图、rendered_md
// 三处走同一个 layoutResume。三处只要有一处自己算一遍分组,用户就会
// 发现下载下来的那份和屏幕上的不一样,而那是这个产品最不能出的错。
//
// 不 import Next、不连库。
// =============================================================

/** 一段任职。分组的依据是 id,不是公司名 —— 离职再入职是两段。 */
export type LayoutEmployment = {
  id: string;
  org: string;
  role: string;
  /** 已经渲染好的「2022.02 – 至今」。时间格式由上游统一,这里不再算。 */
  period: string;
};

export type LayoutBlock = {
  section: string;
  title: string;
  meta: string;
  summary: string;
  bullets: string[];
  /**
   * 挂靠的任职。个人项目、教育背景是 null。
   *
   * 可选:手工改块、投递增量这些路径上没有这一层信息,它们照旧一块一个标题。
   * 缺省即「不分组」,而不是报错 —— 分组是加分项,不是渲染的前提。
   */
  employment?: LayoutEmployment | null;
  /**
   * 用于剥离标题里重复的公司名。优先取任职的 org,任职丢了就退回经历自己的
   * org。个人项目两处都是 null,于是什么都不剥 —— 这正是想要的。
   */
  org?: string | null;
};

/** 一个雇主标题下的一个项目。title 为空表示这一组只有它,标题已经并进雇主行。 */
export type LayoutItem<T extends LayoutBlock = LayoutBlock> = {
  /** 这一项是从哪个块来的。交互式渲染要靠它拿回块 id。 */
  source: T;
  title: string;
  meta: string;
  summary: string;
  bullets: string[];
};

export type LayoutGroup<T extends LayoutBlock = LayoutBlock> = {
  section: string;
  /** null 表示这一组不共用雇主标题,items 一定只有一条。 */
  employment: LayoutEmployment | null;
  items: LayoutItem<T>[];
};

/** 公司名与后面那半之间可能出现的分隔符。全角半角都收。 */
const SEPARATOR = /^[\s·・\-–—|｜:：/、,，]+/;

/**
 * 简称至少要这么长才敢当成公司名剥掉。
 *
 * 「信华信」之于「信华信技术股份有限公司」应该剥,但两个字的前缀太容易
 * 误伤 —— 「知识」之于「知识产权服务公司」剥掉就把标题毁了。
 */
const MIN_ABBREV = 3;

/**
 * 把标题开头重复的公司名剥掉。
 *
 * 只处理开头。公司名出现在标题中间(「为润泽园设计的…」)一律放过 ——
 * 那种位置上它是句子的一部分,剥掉会把话说断。
 */
export function stripOrgPrefix(title: string, org: string | null): string {
  const t = title.trim();
  const o = (org ?? "").trim();
  if (t === "" || o === "") return t;

  const cut = (n: number): string | null => {
    const rest = t.slice(n);
    // 后面必须跟分隔符或者什么都不跟。否则「润泽园教育」被「润泽园」切一刀
    // 会剩下「教育」,那不是标题,是碎片。
    if (rest === "") return "";
    const m = rest.match(SEPARATOR);
    return m ? rest.slice(m[0].length).trim() : null;
  };

  if (t.startsWith(o)) {
    const rest = cut(o.length);
    if (rest !== null) return rest;
  }

  // 简称:标题开头与公司名共有的前缀足够长就算。
  let common = 0;
  while (common < t.length && common < o.length && t[common] === o[common]) common++;
  if (common >= MIN_ABBREV) {
    const rest = cut(common);
    if (rest !== null) return rest;
  }

  return t;
}

/**
 * 剥完之后这个标题还值不值得单独印一行。
 *
 * 剥空了、或者剥完只剩职位名(雇主行上已经有了),都不值得。
 */
export function titleWorthPrinting(title: string, role: string): boolean {
  const t = title.trim();
  if (t === "") return false;
  return t !== role.trim();
}

/**
 * 把块排成版面。
 *
 * 两级分组:先 section(按第一次出现的先后),再 employment。
 * 组的位置由组内第一个块决定 —— 模型给出的整体顺序不被重排,
 * 只是把散落在同一段任职下的块收拢到一起。
 */
export function layoutResume<T extends LayoutBlock>(blocks: T[]): LayoutGroup<T>[] {
  const sectionOrder: string[] = [];
  const bySection = new Map<string, T[]>();
  for (const b of blocks) {
    if (!bySection.has(b.section)) {
      bySection.set(b.section, []);
      sectionOrder.push(b.section);
    }
    bySection.get(b.section)!.push(b);
  }

  const out: LayoutGroup<T>[] = [];
  for (const section of sectionOrder) {
    const list = bySection.get(section)!;
    const order: string[] = [];
    const groups = new Map<string, LayoutGroup<T>>();

    for (const b of list) {
      const emp = b.employment ?? null;
      // 没有任职的块各自独立。用块自己的位置当 key,保证它们不会互相合并。
      const key = emp ? `e:${emp.id}` : `s:${order.length}`;
      let g = groups.get(key);
      if (!g) {
        g = { section, employment: emp, items: [] };
        groups.set(key, g);
        order.push(key);
      }
      g.items.push({
        source: b,
        title: stripOrgPrefix(b.title, b.org ?? null),
        meta: b.meta,
        summary: b.summary,
        bullets: b.bullets,
      });
    }

    for (const key of order) {
      const g = groups.get(key)!;
      // 一个雇主下只有一个项目时,项目标题并进雇主行 —— 印两行说同一件事
      // 只是把版面撑长,信息没多。
      if (g.employment && g.items.length === 1) {
        const only = g.items[0];
        if (!titleWorthPrinting(only.title, g.employment.role)) only.title = "";
      }
      out.push(g);
    }
  }
  return out;
}

/** 雇主标题行:「公司 ｜ 职位 ｜ 起止」。三段都可能缺,缺了就不占位。 */
export function employmentHeading(e: LayoutEmployment): string {
  return [e.org, e.role, e.period].map((s) => s.trim()).filter((s) => s !== "").join(" ｜ ");
}

/**
 * 这条 meta 在雇主标题下面还有没有信息量。
 *
 * S8 之后,挂了履历的块把整行「公司 · 职位　起止」存进了 meta。那时候没有
 * 雇主标题,这么存是对的;现在有了,再印一遍就是同一句话说两次。
 *
 * 只按内容判断,不按「是不是我们生成的」判断 —— 用户手工改过的 meta 只要
 * 不再提公司名,就照常印出来,不该因为它长在一个挂了履历的块上就被吞掉。
 */
export function metaRedundant(meta: string, e: LayoutEmployment): boolean {
  const m = meta.trim();
  if (m === "") return true;
  const org = e.org.trim();
  if (org !== "" && m.includes(org)) return true;
  return m === e.period.trim();
}

/** 项目子标题:「名字（时间）」。年份雇主行上已经有了,这里只是定位到具体项目。 */
export function itemHeading(item: LayoutItem<LayoutBlock>, employment: LayoutEmployment | null): string {
  const title = item.title.trim();
  const meta = item.meta.trim();
  if (title === "") return "";
  if (!employment) return [title, meta].filter((s) => s !== "").join("　");
  if (meta === "" || metaRedundant(meta, employment)) return title;
  return `${title}（${meta}）`;
}

/** 排好版之后的一块,带上「这里要不要先印一行标题」的判断。 */
export type FlatBlock<T extends LayoutBlock> = {
  source: T;
  section: string;
  /** 这一块前面要不要印 section 标题。 */
  newSection: boolean;
  /** 非 null 表示这一块前面要先印一行雇主标题。 */
  employmentHead: LayoutEmployment | null;
  employment: LayoutEmployment | null;
  /**
   * 剥掉重复公司名之后的标题,不含时间。空串表示它已经并进雇主行,不单独印。
   * 交互式渲染（纸面）要它:标题与时间在那里是分列排的,不是拼成一行。
   */
  title: string;
  /** 标题与时间拼好的一行,给 Markdown 与打印视图用。空串同上。 */
  heading: string;
  /** 这一块自己的时间。已经并进雇主行时是空串。 */
  meta: string;
};

/**
 * 分组结果摊平成一条一条的块。
 *
 * 交互式的纸面渲染需要它:每个块仍然要能单独选中、拖拽,不能被并进一个组
 * 对象里。摊平之后 Markdown 与屏幕走的仍是同一次 layoutResume ——
 * 「三处渲染必须一致」这条约束靠的是共用算法,不是共用形状。
 */
export function layoutFlat<T extends LayoutBlock>(blocks: T[]): FlatBlock<T>[] {
  const out: FlatBlock<T>[] = [];
  let section = "";
  for (const g of layoutResume(blocks)) {
    const newSection = g.section !== section;
    section = g.section;
    g.items.forEach((item, i) => {
      const redundant =
        g.employment !== null && (item.meta.trim() === "" || metaRedundant(item.meta, g.employment));
      out.push({
        source: item.source,
        section: g.section,
        newSection: newSection && i === 0,
        employmentHead: g.employment && i === 0 ? g.employment : null,
        employment: g.employment,
        title: item.title,
        heading: itemHeading(item, g.employment),
        meta: redundant ? "" : item.meta,
      });
    });
  }
  return out;
}
