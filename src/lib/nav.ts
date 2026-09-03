// 侧栏导航结构 + 方向作用域判定（供 Sidebar / Topbar 共用）。

export type NavItem = { label: string; href: string };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "经历",
    items: [
      { label: "首页", href: "/app" },
      { label: "经历库", href: "/app/library" },
      { label: "导入", href: "/app/import" },
      { label: "随手记", href: "/app/notes" },
    ],
  },
  {
    title: "求职",
    items: [
      { label: "求职方向", href: "/app/targets" },
      { label: "行动清单", href: "/app/actions" },
      { label: "简历", href: "/app/resume" },
      { label: "面试", href: "/app/interview" },
    ],
  },
  {
    title: "质量",
    items: [{ label: "体检", href: "/app/health" }],
  },
];

// 方向作用域页面：求职方向 / 简历 / 面试 —— 方向选择器在这三页生效。
// 其余（首页/经历库/导入/随手记/行动清单/体检）为全局视图，选择器置灰。
const DIRECTION_PATHS = ["/app/targets", "/app/resume", "/app/interview"];

// 按前缀匹配：/targets/strategy 这类子页同样属于方向作用域。
// 全局页面的子路由（/import/review/xxx）不在上面这个清单里，照旧置灰。
export function isGlobalPath(pathname: string): boolean {
  return !DIRECTION_PATHS.some((d) => pathname === d || pathname.startsWith(`${d}/`));
}
