# Proofly

> 让你的经历真正产生价值

把散落在多份文档里的职业经历，收敛为**唯一、可溯源的事实库**；在此之上为每个求职方向、每一份 JD 生成可信的投递材料。

本仓库当前为 **Step 0** 交付物：可登录、可部署、数据库结构完整的空壳应用（不含任何业务功能与 AI）。

---

## 技术栈与依赖版本

安装时已固定精确版本（不用 `^` / `latest`）。

| 项 | 选择 | 版本 |
|---|---|---|
| 运行时 | Node.js | 22 |
| 包管理 | pnpm | 10.33.0 |
| 框架 | Next.js（App Router） | 16.3.2 |
| UI 库 | React / React DOM | 19.2.8 |
| 语言 | TypeScript（`strict`） | 5.9.3 |
| 样式 | Tailwind CSS（v4，`@theme`） | 4.3.3 |
| PostCSS 插件 | @tailwindcss/postcss | 4.3.3 |
| 后端 SDK | @supabase/supabase-js | 2.112.3 |
| SSR/Cookie | @supabase/ssr | 0.12.4 |
| Lint | eslint / eslint-config-next | 9.39.5 / 16.3.2 |
| 类型 | @types/node · @types/react · @types/react-dom | 20.19.43 · 19.2.18 · 19.2.5 |

> Next 16 已把中间件约定 `middleware.ts` 更名为 **`proxy`**，本项目的 session 刷新与登录重定向在 `src/proxy.ts`。
> `next.config.ts` 设 `agentRules:false`，关闭 Next 自动生成 `AGENTS.md` / `CLAUDE.md`。

---

## 环境变量

客户端零密钥，只用 Supabase 的 publishable/anon key（受 RLS 保护，可公开）。
**Service Role Key 不要放进本项目。**

`.env.local`（本地，已 gitignore）与 Vercel 环境变量都需要：

```
NEXT_PUBLIC_SUPABASE_URL=https://vsbwlxxrjwgkhsdxdxgl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_6nhOPw1nEWeMc0xJtdI2bA_-DJnhKwX
```

模板见 `.env.example`。

---

## 本地启动

```bash
pnpm install
cp .env.example .env.local   # 填入上面的两个值
pnpm dev                     # http://localhost:3000
```

其他脚本：`pnpm build`（生产构建）、`pnpm start`（生产启动）、`pnpm lint`。

---

## 数据库：SQL 执行顺序

在 Supabase 控制台 **SQL Editor** 中，按顺序执行 `supabase/` 下四个文件：

1. `01_extensions_and_helpers.sql` — 扩展（pgcrypto、vector）+ 通用/触发器函数
2. `02_tables.sql` — 全部 23 张表 + `task_priority` 视图 + 索引
3. `03_triggers.sql` — `updated_at` 与派生字段（证明度 / 技能证据强度）触发器
4. `04_rls.sql` — 23 张表 RLS + 每表 4 条策略 + 视图 `security_invoker`

> 执行 02 时出现 `NOTICE: ivfflat index created with little data` 属正常（空表建向量索引），可忽略。
> 类型定义在 `src/types/database.ts`（手工按 DDL 写出，Step 2 可用 `supabase gen types typescript` 重生成）。

---

## Supabase Auth 配置清单

登录方式为**邮箱 + 密码**（登录 / 注册双态）。Dashboard → **Authentication**，以下为本项目所需值：

| 项 | 位置 | 值 |
|---|---|---|
| Email provider | Providers → Email | **开启**（已默认开启）|
| Confirm email | Providers → Email | **关闭**（关闭后「注册即登录」，不依赖邮件到达；已默认关闭）|
| Site URL | URL Configuration | `https://proofly.top` |
| Redirect URLs | URL Configuration | 见下 |

> 若把 Confirm email 改为**开启**：注册后不会立即登录，而是发一封确认邮件，用户点链接落到 `/auth/callback` 完成注册再登录。此时务必确保邮件能送达（默认 Supabase SMTP 到达率有限，建议自配 SMTP）。

Redirect URLs（逐条加入，允许通配）：

```
http://localhost:3000/**
https://proofly.top/**
https://*.vercel.app/**
```

> 当前项目 Site URL 仍是 `http://localhost:3000`、Redirect URLs 为空——**需你手动补上上面两项**（Email provider 与 Confirm email 已是正确状态）。
> 也可用 Management API 一次写入（把 `$TOKEN` 换成你的 access token）：
>
> ```bash
> curl -X PATCH \
>   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
>   -d '{"site_url":"https://proofly.top","uri_allow_list":"http://localhost:3000/**,https://proofly.top/**,https://*.vercel.app/**"}' \
>   https://api.supabase.com/v1/projects/vsbwlxxrjwgkhsdxdxgl/config/auth
> ```

---

## 部署（Vercel）

1. Vercel → New Project → 导入 GitHub 仓库 `ViteZhang/Proofly`。
2. Framework 自动识别 Next.js；Build/Install 用默认（pnpm）。
3. **Settings → Environment Variables** 添加上面两个 `NEXT_PUBLIC_*`（Production + Preview 都加）。
4. Deploy。首个生产域名形如 `https://proofly-xxxx.vercel.app`。
5. 回到 Supabase，确认 Redirect URLs 已含 `https://*.vercel.app/**`（上面清单已覆盖）。

Git push 到 `main` 会自动触发生产部署；其他分支为 Preview 部署。

---

## 绑定自有域名 proofly.top（阿里云注册）

1. **Vercel** → 项目 → Settings → Domains → 添加 `proofly.top`（可再加 `www.proofly.top`）。Vercel 会给出需要配置的 DNS 记录。
2. **阿里云** → 域名控制台 → `proofly.top` → 解析设置（云解析 DNS），添加：

   | 记录类型 | 主机记录 | 记录值 |
   |---|---|---|
   | A | `@` | `76.76.21.21`（Vercel 的 apex IP，以 Vercel 面板显示为准）|
   | CNAME | `www` | `cname.vercel-dns.com`（以 Vercel 面板显示为准）|

3. 等待 DNS 生效（通常几分钟到几十分钟），Vercel 自动签发 SSL 证书。
4. 域名生效后，把 Supabase 的 **Site URL** 设为 `https://proofly.top`（Redirect URLs 已含 `https://proofly.top/**`）。

> 提示：Vercel 面板会显示当前该用哪条记录/IP，**以面板实际值为准**；上表为常见默认值。
> 阿里云注册的域名解析到海外 Vercel 无需 ICP 备案即可解析；但中国大陆访问 Vercel 稳定性一般，如需大陆优化可后续再议（Step 0 不处理）。

---

## 目录结构（要点）

```
src/
  app/
    (auth)/login/          登录页（登录 / 注册 双态，邮箱 + 密码）
    auth/callback/route.ts 邮箱确认链接 code 交换（开启 Confirm email 时用）
    (app)/                 应用外壳内的九个页面
    design-check/          设计令牌校验页（临时，Step 1 结束删除）
    icon.png               站点图标（从品牌字标裁出的 P 标记）
    globals.css            设计令牌（§5）+ Tailwind v4 @theme
  components/
    layout/                Sidebar · Topbar · Logo（字标两个色版）
    ui/Button.tsx          按钮四形态
  lib/
    supabase/              client · server · middleware(session)
    nav.ts                 导航结构 + 全局/方向判定
  types/database.ts        Supabase 数据库类型
  proxy.ts                 session 刷新 + 登录重定向（Next 16 proxy 约定）
supabase/                  01~04 SQL
```

> `src/app/design-check/` 是临时视觉校验页，**Step 1 结束时删除**。
