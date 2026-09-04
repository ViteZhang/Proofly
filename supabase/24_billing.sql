-- =============================================================
-- Proofly · 24 计费基座 · 表 / RLS / 版本号触发器
--
-- 上游：《商业化技术方案 v1.0》第 2 节 ·《商业化 C1》切片 C1.2
--
-- 八张表。与前 23 张的最大不同：**客户端一律只读**。
-- 余额的每一次变动都必须走 25 里的 SECURITY DEFINER 函数，
-- 所以这批表只给 select 策略，不给 insert / update / delete ——
-- 少一条策略，就少一条绕开三态机制直接改余额的路。
--
-- 两张表连 RLS 都不开，改为直接收回权限：
--   redeem_codes            —— 开了 select 用户就能枚举兑换码
--   global_budget_counters  —— 跨用户聚合，RLS 按 user_id 根本表达不了
-- =============================================================

-- ---- 2.2 Entitlement · 积分分笔记账 ----
--
-- 不做「一个用户一个余额数字」，因为购买与赠送的过期规则不同：
-- 购买永不过期，赠送当月有效。合并成一个数字就再也分不出
-- 「过期的该扣哪一笔」。
create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null
    check (source in ('purchase','grant_signup','grant_monthly','redeem','adjust')),
  credits_total int not null check (credits_total >= 0),
  credits_used int not null default 0 check (credits_used >= 0),
  -- null = 永不过期（购买）
  expires_at timestamptz,
  -- 支付订单号。本期不接支付，预留字段，接的时候不用改表。
  order_ref text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credits_used <= credits_total)
);

-- 扣减优先级要按「先扣即将过期的、同到期时间下先扣先发放的」排序，
-- 这个索引就是给那句 order by 用的。
create index if not exists entitlements_spend_order_idx
  on entitlements (user_id, expires_at nulls last, created_at);

-- ---- 2.3 QuotaCounter · 余额快照与免费计数 ----
--
-- 这是冗余快照，不是真相。真相是 entitlements 的聚合。
-- 快照的存在只为两件事：高频读余额、单条 UPDATE 原子扣减。
-- 两者不一致时以 entitlements 为准（见 25 的 reconcile_quota）。
create table if not exists quota_counters (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  -- 可用余额，已扣除 hold
  credits_available int not null default 0 check (credits_available >= 0),
  -- 预扣中
  credits_held int not null default 0 check (credits_held >= 0),
  -- 'YYYY-MM'，惰性重置用，不跑定时任务
  free_chat_month text not null default to_char(now(), 'YYYY-MM'),
  free_chat_used int not null default 0 check (free_chat_used >= 0),
  -- 反滥用：每日对话总轮次。不是计费，不看余额。
  chat_day date not null default current_date,
  chat_day_used int not null default 0 check (chat_day_used >= 0),
  -- 事实层版本号。任何事实写入 +1，用于判定「上次生成到现在事实有没有变」
  fact_revision bigint not null default 0,
  -- 策略层版本号，挂 atom_target_strategy
  strategy_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---- 2.4 CreditHold · 预扣 ----
--
-- 三态机制的载体：HOLD → SETTLE 或 RELEASE。
-- 面试题包要跑十分钟，期间用户可能发起别的动作 —— 「先跑完再扣」
-- 到结算时余额可能已经不够了，「先扣了失败再退」用户会看见余额跳变。
-- 只有预扣能同时避开这两个。
create table if not exists credit_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  action_code text not null,
  credits int not null check (credits >= 0),
  status text not null default 'held'
    check (status in ('held','settled','released')),
  -- 用户 + 动作 + 输入指纹 + 客户端请求 id。防重复点击造成双份预扣。
  idempotency_key text not null,
  -- 关联的异步作业
  job_ref uuid,
  -- 生成指纹，免费重生成判定用
  fingerprint text,
  -- 释放口令。只回给服务端，客户端按列级 GRANT 读不到 —— 见 25 的
  -- release_hold：没有它，用户可以在长任务跑到一半时自己把钱退了。
  release_token uuid not null default gen_random_uuid(),
  -- 超时自动释放：同步动作 5 分钟，异步 25 分钟
  expires_at timestamptz not null,
  settled_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- 悬挂清理的扫描条件就是这两列
create index if not exists credit_holds_sweep_idx
  on credit_holds (status, expires_at) where status = 'held';
create index if not exists credit_holds_user_idx
  on credit_holds (user_id, created_at desc);

-- ---- 2.5 UsageLog · 消费明细 ----
--
-- succeeded = false 的记录也要写，而且必须带 token —— 失败调用的成本
-- 目前是完全未知的（商业化方案 9.5 缺口一），这张表是唯一的补法。
create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  hold_id uuid references credit_holds on delete set null,
  action_code text not null,
  -- 0 表示免费动作
  credits_charged int not null default 0 check (credits_charged >= 0),
  free_reason text
    check (free_reason is null or free_reason in
      ('free_forever','free_quota','regen_window','budget_grace')),
  llm_call_ids jsonb not null default '[]'::jsonb,
  input_tokens int,
  output_tokens int,
  -- 内部核算用，不对外展示
  cost_cents numeric(10,4),
  duration_ms int,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_user_idx
  on usage_logs (user_id, created_at desc);

-- ---- 2.6 兑换码 ----
--
-- 本期不接支付，内测与早期用户走兑换码。
create table if not exists redeem_codes (
  code text primary key,
  credits int not null check (credits > 0),
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists redeem_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  code text not null references redeem_codes,
  entitlement_id uuid references entitlements on delete set null,
  created_at timestamptz not null default now(),
  -- 同一个码同一个人只能兑一次
  unique (user_id, code)
);

-- ---- 0.4 全局预算护栏 ----
--
-- 「全站免费动作的日成本封顶」是跨用户聚合，而所有业务表都按 user_id
-- 开了 RLS —— 普通会话读不到别人的行，也就算不出全站合计。
-- 只能单独开一张不带 user_id 的表，且客户端永远碰不到。
create table if not exists global_budget_counters (
  bucket_date date primary key,
  free_cost_cents numeric(12,4) not null default 0,
  free_action_count int not null default 0,
  signup_grant_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- ---- 7. 用户档案 ----
create table if not exists user_profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  nickname text check (nickname is null or length(nickname) <= 40),
  signup_source text not null default 'site',
  -- 注册赠送是否已发。护栏触顶时会暂停发放，所以「发过没有」要单独记，
  -- 不能拿 entitlements 里有没有 grant_signup 来推 —— 那样触顶期间注册的
  -- 用户会在护栏恢复后被漏掉。
  signup_grant_issued boolean not null default false,
  signup_grant_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================
-- updated_at
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array['entitlements','quota_counters','user_profiles']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- =============================================================
-- RLS · 只读
--
-- 六张带 user_id 的表统一只给 own_select。写入全部走 25 的
-- SECURITY DEFINER 函数 —— 那些函数以属主身份跑，不受 RLS 限制。
-- 客户端拿 anon key 直接 update quota_counters 会被拒，因为压根
-- 没有 update 策略。
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'entitlements','quota_counters','credit_holds',
    'usage_logs','redeem_records','user_profiles'
  ]
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists own_select on %I;', t);
    execute format('drop policy if exists own_insert on %I;', t);
    execute format('drop policy if exists own_update on %I;', t);
    execute format('drop policy if exists own_delete on %I;', t);

    execute format(
      'create policy own_select on %I for select using (user_id = auth.uid());', t);
  end loop;
end $$;

-- user_profiles 是唯一的例外：昵称得让用户自己改。
-- 但只放开 nickname 之外的列也得靠 update 策略，Postgres 的 RLS 管不到列级，
-- 所以这里用列级 GRANT 兜住 —— 只授权 nickname 可写。
drop policy if exists own_update on user_profiles;
create policy own_update on user_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on user_profiles from anon, authenticated;
grant update (nickname) on user_profiles to authenticated;

-- 其余五张表连表级写权限都收回，双保险
revoke insert, update, delete on entitlements from anon, authenticated;
revoke insert, update, delete on quota_counters from anon, authenticated;
revoke insert, update, delete on credit_holds from anon, authenticated;
revoke insert, update, delete on usage_logs from anon, authenticated;
revoke insert, update, delete on redeem_records from anon, authenticated;

-- =============================================================
-- 不开 RLS 的两张表：直接收回全部权限
--
-- 注意别把「不开 RLS」当成「安全」。Supabase 默认给 anon /
-- authenticated 授了表级权限，不开 RLS 反而是全表敞开。
-- 必须显式 revoke，只留 service_role 与 SECURITY DEFINER 函数。
-- =============================================================
alter table redeem_codes disable row level security;
alter table global_budget_counters disable row level security;

revoke all on redeem_codes from anon, authenticated, public;
revoke all on global_budget_counters from anon, authenticated, public;

-- =============================================================
-- 2.7 事实层 / 策略层版本号
--
-- 「24 小时内重生成不扣分」要能回答「事实层从上次生成到现在有没有变」，
-- 靠的就是这个单调递增的计数器。
--
-- 只 UPDATE，不 upsert：注销账号时 auth.users 的级联删除会把
-- 事实表和 quota_counters 一起删，顺序不确定；这里若补插一行，
-- 就可能给一个正在被删的用户插回外键，把注销整个事务弄挂。
-- 计数器行在首次登录时由 ensure_quota_counter() 建（见 25），
-- 那发生在任何事实写入之前。
-- =============================================================
create or replace function bump_fact_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update quota_counters
     set fact_revision = fact_revision + 1
   where user_id = coalesce(new.user_id, old.user_id);
  return coalesce(new, old);
end $$;

create or replace function bump_strategy_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update quota_counters
     set strategy_revision = strategy_revision + 1
   where user_id = coalesce(new.user_id, old.user_id);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'atoms','metrics','guards','skills','atom_skills','profile_facts'
  ]
  loop
    execute format('drop trigger if exists bump_fact_revision on %I;', t);
    execute format(
      'create trigger bump_fact_revision after insert or update or delete on %I
         for each row execute function bump_fact_revision();', t);
  end loop;
end $$;

drop trigger if exists bump_strategy_revision on atom_target_strategy;
create trigger bump_strategy_revision
  after insert or update or delete on atom_target_strategy
  for each row execute function bump_strategy_revision();
