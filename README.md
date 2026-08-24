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

登录方式为**邮箱认证**（Magic Link + 6 位验证码，同一封邮件里两种都给，点链接或填验证码都能进）。

### 1. 为什么必须配自建 SMTP

Supabase **内置邮件服务限速 2 封 / 小时**，且只发给项目成员，仅供开发试用——这正是之前登录邮件收不到的原因。
生产必须接自己的 SMTP。本项目用 **Resend**。

### 2. Resend 侧

1. [resend.com](https://resend.com) → **Domains** → **Add Domain**。
   建议用子域 `mail.proofly.top` 而不是根域，把发信信誉与主域隔离（Resend 官方推荐）。
2. Resend 会列出要加的 DNS 记录。到**阿里云云解析 DNS** → `proofly.top` → 解析设置，逐条添加：

   | 记录类型 | 主机记录 | 记录值 | 说明 |
   |---|---|---|---|
   | MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com`（优先级 10）| 退信处理 |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | SPF |
   | TXT | `resend._domainkey.mail` | Resend 给的 `p=...` 长串 | DKIM |
   | TXT | `_dmarc.mail` | `v=DMARC1; p=none;` | DMARC（可选但建议）|

   **三个必踩的坑：**

   1. **主机记录只填前缀，不带域名。** Resend 显示 `send.mail.proofly.top`，阿里云里只填 `send.mail`
      —— 右边那个 `.proofly.top` 是阿里云自动补上的。
   2. **MX 的区域串要用 Resend 面板上的真实值**，不能填 `<region>` 这种占位符（阿里云会报
      「MX记录的记录值为域名形式」）。Resend 只有四个区域，取决于你添加域名时选的哪个：
      `us-east-1`（默认）、`eu-west-1`、`ap-northeast-1`、`sa-east-1`。
      区域填错 Resend 会报 region mismatch；同一域名的所有 MX 记录必须指向同一区域。
   3. **DKIM 公钥每个域名都不一样**，必须从 Resend 面板复制那串 `p=...`，没有通用值。

   > 若保存后 MX 值被拼成了 `feedback-smtp.us-east-1.amazonses.com.proofly.top`，
   > 在记录值末尾补一个**英文句点**（`...amazonses.com.`），告诉 DNS 这是完整域名、不要再拼。

3. 回 Resend 点 **Verify**（DNS 生效通常几分钟）。
4. **API Keys** → **Create API Key**（权限选 Sending access）→ 复制 `re_...`，**只显示一次**。

### 3. Supabase 侧

Dashboard → **Authentication** → **Emails** → **SMTP Settings** → 打开 *Enable Custom SMTP*：

| 字段 | 值 |
|---|---|
| Sender email | `noreply@mail.proofly.top`（必须在已验证的域名下）|
| Sender name | `Proofly` |
| Host | `smtp.resend.com` |
| Port | `465`（隐式 SSL；也可用 `587` STARTTLS）|
| Username | `resend`（**字面量，不是邮箱**）|
| Password | 上一步的 `re_...` API Key |

接着两处也要改：

- **Authentication → Rate Limits** → *Rate limit for sending emails*：接自建 SMTP 后 Supabase 仍会先卡在 **30 封 / 小时**，按需调高。
- **Authentication → Email Templates** → 邮件正文用 `supabase/email-templates/magic-link.html`。
  同一份内容要贴到 **Magic Link** 和 **Confirm signup** 两个模板里（老用户走前者，新邮箱首次登录走后者），
  两个 Subject 都填 `登录 Proofly`。

  模板里用到两个变量：`{{ .ConfirmationURL }}`（登录链接）和 `{{ .Token }}`（6 位验证码），
  一封邮件同时给出两条路径 —— 链接在别的设备打开、或被邮件安全扫描提前点掉时，验证码是兜底。

  > 邮件客户端普遍不支持 class / flex / grid，所以模板是 `table` 布局 + 全内联样式，且不引用任何外部图片
  > （品牌头用文字加绿色对勾，避免客户端默认屏蔽图片时露出空白）。改样式时请保持这两条约束。

| 项 | 位置 | 值 |
|---|---|---|
| Email provider | Providers → Email | **开启** |
| Confirm email | Providers → Email | 邮箱认证下此项不影响登录 |
| Email OTP Expiration | Providers → Email | `900`（15 分钟，与登录页文案一致）|
| Site URL | URL Configuration | `https://proofly.top` |
| Redirect URLs | URL Configuration | 见下 |

Redirect URLs（逐条加入，允许通配）：

```
http://localhost:3000/**
https://proofly.top/**
https://*.vercel.app/**
```

> Site URL 与 Redirect URLs **已配置完成**（下表值即当前生效值）。如需重写，可用 Management API（把 `$TOKEN` 换成你的 access token）：
>
> ```bash
> curl -X PATCH \
>   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
>   -d '{"site_url":"https://proofly.top","uri_allow_list":"http://localhost:3000/**,https://proofly.top/**,https://*.vercel.app/**","mailer_otp_exp":900}' \
>   https://api.supabase.com/v1/projects/vsbwlxxrjwgkhsdxdxgl/config/auth
> ```

### 4. 当前已生效的配置

以下均已写入项目（无需再动）：

| 项 | 值 |
|---|---|
| Site URL | `https://proofly.top` |
| Redirect URLs | 上面三条 |
| Email provider | 开启 |
| Email OTP Expiration | `900`（15 分钟）|
| OTP 长度 | `6` 位（与登录页「6 位数字」一致）|
| 两封邮件最小间隔 | `60` 秒（与登录页 60 秒重发冷却一致）|
| Custom SMTP | `smtp.resend.com:465`，发件人 `noreply@mail.proofly.top` |
| 发信频率上限 | `30` 封 / 小时 |
| 邮件模板 | Magic Link 与 Confirm signup 均已写入 `supabase/email-templates/magic-link.html` |
| 邮件主题 | `登录 Proofly` |

> **顺序有讲究**：免费版在接上自建 SMTP *之前*，邮件模板是锁死的，API 会直接报
> `Email template modification is not available for free tier projects using the default email provider`。
> 所以必须先配 SMTP，再改模板。本项目两步都已完成。

> ⚠️ **Resend 免费版只能验证 1 个域名**（3,000 封/月、100 封/天）。如果你的 Resend 账号已经把这个名额给了别的项目，三选一：把 `proofly.top` 换上去、升级 Pro（10 个域名）、或者另开一个 Resend 账号。

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
    (auth)/login/          登录页（邮箱认证：发信态 / 验证码态）
    auth/callback/route.ts Magic Link code 交换
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
supabase/
  01~04*.sql               建库脚本
  email-templates/         登录邮件模板（贴到 Supabase Email Templates）
```

> `src/app/design-check/` 是临时视觉校验页，**Step 1 结束时删除**。
