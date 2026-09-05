-- =============================================================
-- Proofly · 38 兑换码后台 A0：四张表 + 管理员白名单
--
-- 上游：《兑换码管理后台施工方案 v1.0》第 3 章、切片 A0
--
-- 这一片把 C1 里的 `RedeemCode` 一格拆成三张表，并新增 admin_users。
--
-- 为什么要拆：C1 的 redeem_codes 只回答「这张码值多少分」，回答不了
-- 「这张码为什么会存在」。方案 0.1 定的硬约束是 —— entitlements 的
-- 任何增量都必须能顺着 redemption → code → batch 一路走到一句人写的
-- 发放理由。中间任何一环缺失都算数据异常。
--
-- 旧表是空的（生产库确认过 0 行），所以直接重建，不做数据迁移。
-- 下面那段 do 块是给「以后有人在别的库上跑这个文件」留的保险。
-- =============================================================

do $$
begin
  if to_regclass('public.redeem_records') is not null
     and exists (select 1 from redeem_records) then
    raise exception '旧 redeem_records 有数据，不能直接重建 —— 先写迁移';
  end if;
  if to_regclass('public.redeem_codes') is not null
     and exists (select 1 from redeem_codes) then
    raise exception '旧 redeem_codes 有数据，不能直接重建 —— 先写迁移';
  end if;
end $$;

drop function if exists redeem_code(uuid, text);
drop table if exists redeem_records;
drop table if exists redeem_codes;

-- -------------------------------------------------------------
-- 3.2 ① 批次 · 一次发放决策的容器
--
-- 批次承载的是「为什么发」。reason 必填且不许空串 —— 这是溯源链最
-- 上游的一环，给了默认值就等于没有。
-- -------------------------------------------------------------
create table redeem_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- purchase 是方案 3.2 之外加的一档：C3 的微信付款发码流程也要挂在
  -- 批次上，否则「额度只有兑换一个入口」就要为它开例外。
  purpose text not null
    check (purpose in ('internal_beta','compensation','invite','self','purchase')),
  reason text not null check (btrim(reason) <> ''),
  credits_each int not null check (credits_each > 0),
  -- null = 不限次
  max_uses_each int check (max_uses_each is null or max_uses_each > 0),
  -- 码本身的有效期。与下面的积分有效期是两件事，见方案第 4 章。
  code_expires_at timestamptz,
  -- 兑换所得积分的有效天数。null = 永久。
  credit_valid_days int check (credit_valid_days is null or credit_valid_days > 0),
  -- 定向码：只有这个邮箱能兑，转发无效
  bound_email text,
  code_count int not null check (code_count > 0),
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  -- 作废必须留理由。不可逆操作没有理由就等于没发生过
  check (revoked_at is null or btrim(coalesce(revoke_reason, '')) <> '')
);

create index redeem_batches_created_idx on redeem_batches (created_at desc);

-- -------------------------------------------------------------
-- 3.2 ② 码 · 持有即生效的凭证
--
-- credits / max_uses / code_expires_at / bound_email 全部从批次冗余
-- 下来，生成后冻结。方案 3.3：凭证类数据要冻结在发生时刻，不能随上游
-- 配置漂移 —— 和简历版本投递后冻结是同一个道理。
-- -------------------------------------------------------------
create table redeem_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references redeem_batches on delete restrict,
  -- 规范化大写带连字符：PF-7K3M-Q2XR
  code text not null unique,
  credits int not null check (credits > 0),
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  -- 只有三个存储态。「已用完」「已过期」是算出来的派生态，不落库 ——
  -- 落库就要定时任务去刷，漏跑一次数据就和事实对不上了（方案 3.4）。
  status text not null default 'active'
    check (status in ('active','disabled','revoked')),
  -- 停用/作废的理由。停用可逆，理由是这次操作留下的唯一痕迹
  status_reason text,
  status_changed_at timestamptz,
  code_expires_at timestamptz,
  bound_email text,
  created_at timestamptz not null default now()
);

create index redeem_codes_batch_idx on redeem_codes (batch_id);
create index redeem_codes_active_idx on redeem_codes (status) where status = 'active';

-- -------------------------------------------------------------
-- 3.2 ③ 核销 · 唯一的额度来源凭据
--
-- unique (code_id, user_id) 是方案约束二的第二道防线：条件 UPDATE 挡
-- 「多人抢穿 max_uses」，唯一索引挡「同一个人并发领两份」。两道都要。
--
-- user_id 走 cascade：账号注销要能删干净（见 37_delete_account）。
-- 代价是注销后这条追溯记录也没了 —— 但保留一条指向已删除用户的核销
-- 记录，既不能用来追溯，又违反「删除即删除」的承诺。
-- -------------------------------------------------------------
create table redeem_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references redeem_codes on delete restrict,
  user_id uuid not null references auth.users on delete cascade,
  -- 实发面额，冗余留证：码被作废后仍要能回答「当时发了多少」
  credits int not null check (credits > 0),
  -- 积分有效期在兑换这一刻算定，之后改批次不影响已发放的
  credit_expires_at timestamptz,
  entitlement_id uuid references entitlements on delete set null,
  redeemed_at timestamptz not null default now(),
  -- 只用于异常识别，不存明文（方案 7.2）
  ip_hash text,
  unique (code_id, user_id)
);

create index redeem_redemptions_user_idx on redeem_redemptions (user_id);
create index redeem_redemptions_at_idx on redeem_redemptions (redeemed_at desc);

-- -------------------------------------------------------------
-- 3.2 ④ 管理员白名单
--
-- 方案 6.2 要求三：首个管理员由 SQL 手工插入，不做「第一个注册的人
-- 是管理员」这类自举逻辑。
-- -------------------------------------------------------------
create table admin_users (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  note text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 权限：四张表客户端一律拒绝
--
-- 两道一起上。Supabase 的默认授权会把新表 grant 给 anon/authenticated，
-- 只开 RLS 不撤 grant 在某些路径下仍可能读到；只撤 grant 不开 RLS 则
-- 以后有人手滑 grant 一下就全开了。C1 在 redeem_codes 上踩过这个坑。
-- -------------------------------------------------------------
alter table redeem_batches      enable row level security;
alter table redeem_codes        enable row level security;
alter table redeem_redemptions  enable row level security;
alter table admin_users         enable row level security;

revoke all on redeem_batches     from anon, authenticated;
revoke all on redeem_codes       from anon, authenticated;
revoke all on redeem_redemptions from anon, authenticated;
revoke all on admin_users        from anon, authenticated;

-- -------------------------------------------------------------
-- 管理员判定
--
-- 方案 2.1 原文要求接口内用 service_role 查询。本项目不把 service role
-- key 放进 Next（既定安全约束），改用 security definer 函数自检 ——
-- 得到的性质更强：客户端同样零权限，而那把能读全库的钥匙在这套系统里
-- 根本不存在，SSRF / 依赖投毒 / 误提交都偷不走它。
--
-- is_admin() 不收参数，只回答「我自己是不是」，所以可以开给 authenticated：
-- 它泄露的信息，调用者本来就知道。收参数的版本会变成一个「查某人是不是
-- 管理员」的探针，那是白送的情报。
-- -------------------------------------------------------------
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- 所有后台函数的第一句。不是管理员就抛，抛出来的话术统一 ——
-- 后台接口不对外区分「你不是管理员」和「这个接口不存在」。
create or replace function admin_assert()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return v_uid;
end $$;

revoke all on function is_admin() from public, anon, authenticated;
revoke all on function admin_assert() from public, anon, authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function admin_assert() to authenticated;
