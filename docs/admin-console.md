# 兑换码后台 · 运维笔记

`/admin`。上游是《兑换码管理后台施工方案 v1.0》，这份只记那些看代码
看不出来、但你半年后会需要的东西。

## 加一个管理员

没有界面，只能 SQL。方案 6.2 要求三：不做「第一个注册的人是管理员」
这类自举逻辑。

```sql
insert into admin_users (user_id, email, note)
select id, email, '为什么给他' from auth.users where email = 'xxx@example.com';
```

撤销就是 `delete from admin_users where email = '...'`。当前名单：
`569440662@qq.com`（A0 手工插入）。

**换个账号登录 Proofly 时 `/admin` 会返回 404，那不是坏了** —— 是它对
非管理员本来就应该不存在。

## 发码

日常走 `/admin/new`。命令行兜底：

```bash
SUPABASE_SERVICE_ROLE_KEY=xxx pnpm gen-code --package job --note "微信 张三 2026-09-05 付款 68"
```

service role key 从命令行传，不写进 `.env.local`。脚本会自己开一个
`purpose=purchase` 的批次 —— 「额度只有兑换一个入口」不给任何工具开
例外，包括它自己。

## 三层鉴权，各管一件事

| 层 | 位置 | 管什么 |
|---|---|---|
| 一 | `src/lib/supabase/middleware.ts` | 响应形状。非管理员访问 `/admin*` 直接 rewrite 成 404，那棵树根本不开始渲染 |
| 二 | `src/app/admin/layout.tsx` 的 `requireAdmin()` | matcher 配错时的兜底 |
| 三 | 每个 `admin_*` 函数的 `admin_assert()` | 数据本身 |

第一层不是可选的。只在 layout 里 `notFound()` 试过：页面与 layout 并行
渲染，页面那边的 RSC 负载会跟着 404 响应一起发出去，layout 的 metadata
还会变成 404 页的标题 —— 数据没漏，但「这个路径存在」还是说出去了。

## 与方案的三处偏离

**一 · 不引入 service role key。** 方案 2.1 要求接口内用 `service_role`
查询。本项目的既定约束是这把钥匙不进 Next，改用 `security definer` 函数
自检 `admin_users`。得到的性质更强：客户端同样零权限，而那把能读全库的
钥匙在这套系统里根本不存在。

**二 · `purpose` 多一档 `purchase`。** C3 的微信付款发码流程也要挂在
批次上。

**三 · 积分有效期只有「永久 / N 天」，没有「当月有效」。** 「当月有效」
是免费赠送的规则，而免费赠送不从兑换码来；兑换发出去的分要么是内测的
（方案待确认 #2 定为永久），要么是买的（对外承诺永不过期）。为一个
没人用的选项加一列，是负资产。

## 异常四项的判定

全部只报不动作。**没有「标记已处理」** —— 四项都是当下算出来的条件，
不是待办：失败集中一小时后自己过期，其余三项修好就归零。加一个 ack
状态，唯一的效果是把一个还成立的条件藏起来。

| 项 | 判定 |
|---|---|
| 兑换失败集中 | 单账号或 IP 1 小时内失败 ≥5 次 |
| 孤儿额度 | `entitlements` 增量找不到核销记录，**或存在任何一行 `source='adjust'`** |
| 批次临期未领完 | 剩余 >30% 且 7 天内到期 |
| 单账号异常兑换 | 单账号累计兑换 >3 张 |

孤儿额度比方案严一档：手工调整不是漏洞，它就是这套设计要删掉的那个
动作。「额度只有兑换一个入口」如果成立，`source='adjust'` 一行都不该有。
所以看板上只要它不为零，优先级高于其余三项之和。

## 成本折算

`CREDIT_COST_CNY = 0.093`（`src/config/plan.ts`），来自商业化方案 9.3
的篮子实测。**标注为估算**，9.4 已说明样本量不足。

它的作用不是算账，是让「发码就是发钱」有痛感。积分这个单位没有痛感，
¥ 有 —— 即使粗估，它也挡得住「手滑发了 500 张 500 分」（¥23,250）。

等失败率与三家单价表补齐后回填这个系数。

## 跑验收

```bash
pnpm redeem:test          # 码格式与归一化，8 条
pnpm redeem:concurrency   # 并发与限流，26 条（要一个测试库，不要对生产库）
psql -f supabase/tests/billing_acceptance.sql   # 计费 + 后台，129 条
```

`redeem-concurrency.sh` 会清空兑换相关的表，**只对测试库跑**。
