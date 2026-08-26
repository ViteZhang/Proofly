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

Step 2 起还需要模型接入。这些都不带 `NEXT_PUBLIC_` 前缀，只在服务端可见。

**一档配一条供应商链**，前一家挂了（连不上、超时、5xx、限流）就换后一家重发整条请求：

| 档 | 1 主用 | 2 | 3 |
|---|---|---|---|
| light（Pass 1 切分） | `gpt-5.6-luna` | `qwen3.8-max` | `deepseek-v4-flash` |
| strong（Pass 2/3） | `gpt-5.6-sol` | `qwen3.8-max` | `deepseek-v4-pro` |
| vision（OCR） | `gpt-5.6-terra` | `qwen3-vl-plus` | `deepseek-v4-flash-vision-exp` |
| embedding | `qwen3.7-text-embedding` | — | — |

向量档只有百炼一家：itokens 和 DeepSeek 都不提供向量模型。

```
OPENAI_BASE_URL=https://itokens.fun/v1
OPENAI_API_KEY=sk-...

BAILIAN_BASE_URL=https://<百炼实例>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
BAILIAN_API_KEY=sk-...

DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-...
```

哪一家没配 key 就自动从链里去掉，一家不配也能跑，只是没有兜底。
`EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` 是向量档的老配法，只在 `BAILIAN_*`
缺席时兜底读取，新配置不用管它。

**接入点换了先 `GET /v1/models` 看清单**，型号写死在 `src/lib/llm/config.ts`
的 `CHAIN`，别处不许出现模型字符串。

切换只认「这家不可用」。key 不对、型号不存在、请求本身有问题，都是就地报错，
不换家——换了结果一样，还会把配置错误盖掉。

一家在 60 秒内连挂两次会被熔断，之后的请求跳过它直接走下一家，不再每次都先撞。
整站宕机时这是七倍的差别（实测 11.8s → 1.2s）。熔断只记在进程内存里，重启即忘。

换向量模型要 `pnpm embed:backfill --all` 全量重算——旧向量的语义空间跟新模型对不上。
**换 key 不用**：同型号不同实例实测余弦 1.000000，是同一个空间。

5. `05_llm_calls.sql` — 模型调用日志 + RLS。没有它就不知道钱花在哪
6. `06_storage.sql` — 私有桶 `source-docs`，路径首段必须等于 `auth.uid()`
7. `07_ingest_progress.sql` — `ingest_jobs` 的进度字段与候选清单
8. `08_similarity.sql` — HNSW 向量索引 + `match_atoms()` 召回函数
9. `09_commit_draft.sql` — 草稿入库，单事务写五张表
10. `10_llm_provider.sql` — `llm_calls` 记下这笔是谁服务的（主用还是兜底）

> 执行 02 时出现 `NOTICE: ivfflat index created with little data` 属正常（空表建向量索引），可忽略。
> 类型定义在 `src/types/database.ts`（手工按 DDL 写出，Step 2 可用 `supabase gen types typescript` 重生成）。

---

## Supabase Auth 配置清单

登录方式：

- **已注册** → 邮箱 + 密码直接登录，不发邮件
- **没注册过** → 注册时先收一封验证码验证邮箱，验完当场设密码，之后都用密码登录
- **忘记密码** → 走同一条验证码通道重设

也就是说**邮件只在注册和重设密码时发**，日常登录不依赖邮件送达。

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
| 密码最小长度 | `8` 位（与登录页一致）|
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
    (auth)/login/          登录页（登录 / 注册 / 重设密码）
    auth/callback/route.ts Magic Link code 交换
    (app)/                 应用外壳内的九个页面
    (app)/library/actions.ts 经历库全部写操作（Server Action + zod）
    (app)/facts/           事实层：全局唯一口径 + 冲突解决
    icon.png               站点图标（从品牌字标裁出的 P 标记）
    globals.css            设计令牌（§5）+ Tailwind v4 @theme
  components/
    home/                  证明环
    facts/                 事实层行编辑 + 冲突解决
    layout/                Sidebar · Topbar · Logo（字标两个色版）
    library/               经历树 · 详情只读/编辑态 · 结果指标 · 待补数据
                           · 叙事护栏 · 技能 combobox · 删除确认
    ui/Button.tsx          按钮四形态
  lib/
    supabase/              client · server · middleware(session)
    queries/               读取层：atoms（树/详情/证明度）· facts（事实层）
    domain.ts              证明度词汇 + jsonb 形状解析 + ActionResult
    evidence.ts            证明度为什么是这一档（与 SQL 触发器逐条对应）
    useSettle.ts           写操作后等新数据落地再收表单，避免闪旧值
    nav.ts                 导航结构 + 全局/方向判定
  types/database.ts        Supabase 数据库类型
  proxy.ts                 session 刷新 + 登录重定向（Next 16 proxy 约定）
supabase/
  01~04*.sql               建库脚本
  email-templates/         登录邮件模板（贴到 Supabase Email Templates）
```

---

## 数据访问约定（Step 1 起）

**读**：Server Component 直接查库，不经 API Route。查询函数放 `src/lib/queries/`，
RLS 已按 `user_id` 隔离，查询里不再手工拼 user 条件。

**写**：全部走 Server Action，放在对应路由的 `actions.ts`。统一约定：

- 入参过 **zod**；校验失败返回 `{ ok: false, error }`，**不抛异常**
- 成功后 `revalidatePath('/library')` 与 `revalidatePath('/')`（首页共用同一份证明度）
- 返回类型统一为 `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`
- 数据库原始报错不外泄，`dbError()` 统一翻成中文
- 不引入表单库：字段少、以就地编辑为主，受控组件 + Server Action 足够

### 经历树怎么分组

**分组管归属，分节管时态。**

- 任职按 `org` 分组，个人项目 / 志愿 / 社区各按 `context` 成组
- 一个 org 组是在职还是过往，**看整组还有没有 `period_end` 为空的顶层经历** ——
  同司的某个项目结束了，它仍然留在这家公司下面，不会被拆到别处去
- 「过往经历」是一条分节线，不是一个分组：它只标记「下面这些是过去的雇主」，
  真正装经历的还是 org 组。做成分组的话左栏要多一层缩进，而数据本身只有两层
- 顺序：在职任职（近的在前）→ 个人项目 / 志愿 / 社区 → 分节线 → 过往任职（近的在前）

因此**公司名填「组织」字段，不要写进标题**——组标题已经带了，写进标题会重复两遍。

**派生字段不写**。`atoms.evidence_level` 与 `skills.evidence_strength` 由
`01_extensions_and_helpers.sql` 里的触发器维护，应用层任何地方都不给它们赋值，
UI 上也不提供修改入口。

---

## 抽取链路怎么走（Step 2 起）

```
上传 → 解析成纯文本 → Pass 1 切分 → Pass 2 结构化（并发 3）→ Pass 3 意图判定 → 草稿 → 你确认 → 入库
```

### 三段提示词是资产，不要顺手改

全文在 `src/lib/llm/prompts.ts`，逐字照抄施工文档第五节。实测效果不好，
先跑 `pnpm eval:extract` 出报告，拿新旧报告对比着谈，不要单方面调。

适配层给 `jsonSchema` 时会在系统提示词末尾追加一句输出约束（见
`src/lib/llm/core.ts` 的 `JSON_SUFFIX`），那是机制，不动提示词本身。

### 所有模型调用走 `callLLM()`

业务代码里不许出现 OpenAI SDK。四个档位：

| 档 | 用途 |
|---|---|
| `light` | Pass 1 切分定位。输入长、任务简单，用最便宜的 |
| `strong` | Pass 2 抽取、Pass 3 意图判定。判错代价高，不省这个钱 |
| `vision` | 扫描件与图片识别 |
| `embedding` | 向量召回。必须 1536 维，与 `atoms.embedding` 的列宽一致 |

每次实际发出的请求落一行 `llm_calls`，**失败和重试也记**——失败也烧钱，
漏记会让「哪个环节贵」这个问题答错。

`src/lib/llm/core.ts` 不依赖 Next，所以评估脚本能脱离服务器直接跑；
`src/lib/llm/index.ts` 只是给它接上 Supabase 记账。

### 作业为什么能在页面关掉后继续

抽取跑在 `after()` 里，响应先回给页面，活在后台接着做。Pass 1 的候选清单
落在 `ingest_jobs.candidates`，带每条的状态，所以：

- 页面关掉再打开，轮询按候选状态把进度捡回来
- 某条 Pass 2 失败，只重试那一条，其他条不动

进度文案必须是真实数字（「已抽出 12 / 18 条」），不许转圈。

### 抽取质量怎么看

```bash
pnpm eval:extract
```

四项指标里**幻觉率必须为 0**，不为 0 脚本以退出码 1 结束。详见 `eval/README.md`。
