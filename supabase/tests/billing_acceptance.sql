-- =============================================================
-- Proofly · 计费基座验收脚本
--
-- 对应《商业化 C1》第五节「Try to break it」1–19、31–34、42–46。
-- 并发三条（9–11）不在这里 —— 单条连接跑不出并发，见
-- scripts/billing-concurrency.sh。
--
-- 用法：对一个**空的测试库**跑。它会 truncate 计费表，并造一个
-- 假用户。**别对生产库跑。**
--   psql -f supabase/tests/billing_acceptance.sql
-- =============================================================

\set ON_ERROR_STOP on
\set U '99999999-9999-9999-9999-999999999999'

create or replace function assert_eq(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception '✗ % — 期望 %，实际 %', p_label, p_want, p_got;
  end if;
  raise notice '✓ %', p_label;
end $$;

create or replace function assert_raises(p_label text, p_sql text, p_match text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception '✗ % — 本该报错却成功了', p_label;
exception when others then
  if sqlerrm like '%' || p_match || '%' then
    raise notice '✓ % （%）', p_label, p_match;
  else
    raise exception '✗ % — 报了别的错：%', p_label, sqlerrm;
  end if;
end $$;

-- ---- 归零 ----
truncate usage_logs, credit_holds, entitlements, quota_counters,
        redeem_records, user_profiles restart identity cascade;
delete from auth.users where id = :'U';
insert into auth.users (id, email) values (:'U', 'acceptance@test.local');

-- =============================================================
-- 三态机制（验收 1–7）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  h jsonb; h2 jsonb;
  a int; d int;
begin
  perform grant_credits(u, 'purchase', 100);
  select credits_available, credits_held into a, d from quota_counters where user_id=u;
  perform assert_eq('发放 100 后余额', a, 100);

  -- 1 HOLD 后可用立即减少、预扣增加
  h := hold_credits(u, 'resume_baseline', 30, 'k-settle');
  select credits_available, credits_held into a, d from quota_counters where user_id=u;
  perform assert_eq('验收 1 · HOLD 后可用余额', a, 70);
  perform assert_eq('验收 1 · HOLD 后预扣', d, 30);

  -- 2 SETTLE 后预扣归零、可用不再变动
  perform settle_hold((h->>'hold_id')::uuid, '{"input_tokens":1200,"output_tokens":800}'::jsonb);
  select credits_available, credits_held into a, d from quota_counters where user_id=u;
  perform assert_eq('验收 2 · SETTLE 后可用余额不动', a, 70);
  perform assert_eq('验收 2 · SETTLE 后预扣归零', d, 0);
  perform assert_eq('验收 2 · entitlement 已消费',
    (select credits_used from entitlements where user_id=u), 30);

  -- 4 重复 SETTLE
  perform assert_raises('验收 4 · 重复 SETTLE 被拒',
    format('select settle_hold(%L)', h->>'hold_id'), 'HOLD_NOT_HELD');
  perform assert_eq('验收 4 · 没有重复扣',
    (select credits_used from entitlements where user_id=u), 30);

  -- 6 已结算的再 RELEASE
  perform assert_raises('验收 6 · 已结算的不能释放',
    format('select release_hold(%L, %L)', h->>'hold_id', 'x'), 'HOLD_NOT_HELD');

  -- 3 RELEASE 后余额复原
  h2 := hold_credits(u, 'interview_kit', 25, 'k-release');
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('HOLD 25 后可用余额', a, 45);
  perform release_hold((h2->>'hold_id')::uuid, 'timeout',
                       (h2->>'release_token')::uuid,
                       '{"input_tokens":3000,"output_tokens":100}'::jsonb);
  select credits_available, credits_held into a, d from quota_counters where user_id=u;
  perform assert_eq('验收 3 · RELEASE 后可用余额复原', a, 70);
  perform assert_eq('验收 3 · RELEASE 后预扣归零', d, 0);

  -- 5 重复 RELEASE
  perform assert_raises('验收 5 · 重复 RELEASE 被拒',
    format('select release_hold(%L, %L)', h2->>'hold_id', 'x'), 'HOLD_NOT_HELD');
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('验收 5 · 没有重复退', a, 70);

  -- 7 RELEASE 也写 usage_logs
  perform assert_eq('验收 7 · RELEASE 写了失败日志',
    (select count(*)::int from usage_logs
      where user_id=u and succeeded=false and credits_charged=0), 1);
  perform assert_eq('验收 7 · 失败日志带着 token 数',
    (select input_tokens from usage_logs where user_id=u and succeeded=false), 3000);
end $$;

-- =============================================================
-- 幂等（验收 8）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  h1 jsonb; h2 jsonb; h3 jsonb; a int;
begin
  h1 := hold_credits(u, 'target_assess', 5, 'k-idem');
  h2 := hold_credits(u, 'target_assess', 5, 'k-idem');
  h3 := hold_credits(u, 'target_assess', 5, 'k-idem');
  perform assert_eq('验收 8 · 三次同 key 返回同一个 hold',
    (h1->>'hold_id' = h2->>'hold_id' and h2->>'hold_id' = h3->>'hold_id'), true);
  perform assert_eq('验收 8 · 只产生一条 hold 记录',
    (select count(*)::int from credit_holds where user_id=u and idempotency_key='k-idem'), 1);
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('验收 8 · 只扣了一次', a, 65);
  perform assert_eq('验收 8 · 第二次起标记为幂等命中', (h2->>'idempotent')::boolean, true);
  perform release_hold((h1->>'hold_id')::uuid, 'cleanup', (h1->>'release_token')::uuid);
end $$;

-- =============================================================
-- 扣减优先级（验收 12–16）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  h jsonb;
  e_buy uuid; e_g1 uuid; e_g2 uuid;
begin
  truncate usage_logs, credit_holds, entitlements cascade;
  update quota_counters set credits_available=0, credits_held=0 where user_id=u;

  -- 购买 100 不过期 + 赠送 50 月底到期
  e_buy := grant_credits(u, 'purchase', 100);
  e_g1  := grant_credits(u, 'grant_signup', 50, now() + interval '20 days');

  -- 12 扣 30 扣的是赠送的
  h := hold_credits(u, 'resume_baseline', 30, 'p-1');
  perform settle_hold((h->>'hold_id')::uuid);
  perform assert_eq('验收 12 · 先扣赠送',
    (select credits_used from entitlements where id=e_g1), 30);
  perform assert_eq('验收 12 · 购买的没动',
    (select credits_used from entitlements where id=e_buy), 0);

  -- 13 赠送用完后开始扣购买的
  h := hold_credits(u, 'resume_baseline', 30, 'p-2');
  perform settle_hold((h->>'hold_id')::uuid);
  perform assert_eq('验收 13 · 赠送扣满 50',
    (select credits_used from entitlements where id=e_g1), 50);
  perform assert_eq('验收 13 · 溢出的 10 分落到购买',
    (select credits_used from entitlements where id=e_buy), 10);

  -- 14 两笔赠送到期不同 → 先扣早到期的
  truncate usage_logs, credit_holds, entitlements cascade;
  update quota_counters set credits_available=0, credits_held=0 where user_id=u;
  e_g1 := grant_credits(u, 'grant_signup', 20, now() + interval '30 days');
  e_g2 := grant_credits(u, 'grant_monthly', 20, now() + interval '3 days');
  h := hold_credits(u, 'target_assess', 5, 'p-3');
  perform settle_hold((h->>'hold_id')::uuid);
  perform assert_eq('验收 14 · 先扣早到期的',
    (select credits_used from entitlements where id=e_g2), 5);
  perform assert_eq('验收 14 · 晚到期的没动',
    (select credits_used from entitlements where id=e_g1), 0);

  -- 15 到期时间相同 → 先扣先发放的
  truncate usage_logs, credit_holds, entitlements cascade;
  update quota_counters set credits_available=0, credits_held=0 where user_id=u;
  e_g1 := grant_credits(u, 'grant_signup', 20, now() + interval '10 days');
  perform pg_sleep(0.01);
  e_g2 := grant_credits(u, 'grant_monthly', 20, now() + interval '10 days');
  update entitlements set expires_at = date_trunc('day', now() + interval '10 days')
   where id in (e_g1, e_g2);
  h := hold_credits(u, 'target_assess', 5, 'p-4');
  perform settle_hold((h->>'hold_id')::uuid);
  perform assert_eq('验收 15 · 同到期时间先扣先发放的',
    (select credits_used from entitlements where id=e_g1), 5);
  perform assert_eq('验收 15 · 后发放的没动',
    (select credits_used from entitlements where id=e_g2), 0);
end $$;

-- =============================================================
-- 过期与对账（验收 16、46）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  r jsonb; a int;
begin
  truncate usage_logs, credit_holds, entitlements cascade;
  update quota_counters set credits_available=0, credits_held=0 where user_id=u;
  perform grant_credits(u, 'purchase', 100);
  perform grant_credits(u, 'grant_signup', 45, now() + interval '1 day');
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('发放后余额 145', a, 145);

  -- 16 赠送过期
  update entitlements set expires_at = now() - interval '1 hour' where source='grant_signup';
  r := reconcile_quota(u);
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('验收 16 · 过期后余额降到 100', a, 100);
  perform assert_eq('验收 16 · 对账报告修正过', (r->>'fixed')::boolean, true);

  -- 46 手工改错快照
  update quota_counters set credits_available = 777 where user_id=u;
  r := reconcile_quota(u);
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('验收 46 · 对账把改错的快照拉回来', a, 100);
  perform assert_eq('验收 46 · 对账留了日志',
    (select count(*)::int from usage_logs where action_code='reconcile_quota'), 2);

  -- 对账要认预扣：HOLD 之后快照与 entitlements 本来就差着一个 held
  perform hold_credits(u, 'interview_kit', 25, 'rec-1');
  r := reconcile_quota(u);
  perform assert_eq('预扣中对账不误判', (r->>'fixed')::boolean, false);
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('预扣中余额仍是 75', a, 75);
end $$;

-- =============================================================
-- 余额不足与非法入参（验收 32 的 SQL 侧）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  a int; d int;
begin
  select credits_available, credits_held into a, d from quota_counters where user_id=u;
  perform assert_raises('验收 32 · 余额不足报 INSUFFICIENT',
    format('select hold_credits(%L, %L, %s, %L)', u, 'interview_kit', a + 1, 'k-broke'),
    'INSUFFICIENT_CREDITS');
  perform assert_eq('验收 32 · 不足时不产生 hold',
    (select count(*)::int from credit_holds where idempotency_key='k-broke'), 0);
  perform assert_eq('验收 32 · 不足时余额没变',
    (select credits_available from quota_counters where user_id=u), a);
  perform assert_eq('验收 32 · 不足时预扣没变',
    (select credits_held from quota_counters where user_id=u), d);

  -- 边界：刚好等于余额要能过。`>=` 写成 `>` 的话这里就挂了。
  perform hold_credits(u, 'interview_kit', a, 'k-allin');
  perform assert_eq('边界 · 刚好花光可以', 
    (select credits_available from quota_counters where user_id=u), 0);
end $$;

\echo ''
\echo '全部通过。'
