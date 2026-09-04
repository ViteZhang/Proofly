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

-- 切换「当前是谁在调用」。
--
-- 两个设置都写：真 Supabase 的 auth.uid() 先看 request.jwt.claim.sub，
-- 没有再解 request.jwt.claims 这个 JSON；本地测试库的桩只认前者。
-- 只写一个，这套断言就只在其中一边成立。
create or replace function _as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user)::text end, true);
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
        redeem_attempts, redeem_redemptions, redeem_codes, redeem_batches,
        user_profiles restart identity cascade;
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
  e_g2 := grant_credits(u, 'grant_monthly', 20, now() + interval '10 days');
  -- 同一个事务里 now() 是常量，两笔的 created_at 会一模一样。
  -- 这里显式把先发放的那笔往前挪，测的才是「先发放先扣」而不是运气。
  update entitlements set expires_at = date_trunc('day', now() + interval '10 days')
   where id in (e_g1, e_g2);
  update entitlements set created_at = now() - interval '1 minute' where id = e_g1;
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

-- =============================================================
-- 限次免费与反滥用（验收 21–24）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  i int; ok boolean;
begin
  update quota_counters
     set free_chat_month = to_char(now(),'YYYY-MM'), free_chat_used = 0,
         chat_day = current_date, chat_day_used = 0
   where user_id = u;

  -- 21 本月前 20 轮免费
  for i in 1..20 loop
    ok := consume_free_chat(u, 20);
    if not ok then raise exception '✗ 验收 21 · 第 % 轮就不免费了', i; end if;
  end loop;
  perform assert_eq('验收 21 · 本月前 20 轮记录都免费', true, true);
  perform assert_eq('验收 21 · 计数正好 20',
    (select free_chat_used from quota_counters where user_id=u), 20);

  -- 22 第 21 轮开始收费
  perform assert_eq('验收 22 · 第 21 轮不再免费', consume_free_chat(u, 20), false);
  perform assert_eq('验收 22 · 被拒的那轮不加计数',
    (select free_chat_used from quota_counters where user_id=u), 20);

  -- 23 跨月重置
  update quota_counters set free_chat_month = '2020-01' where user_id = u;
  perform assert_eq('验收 23 · 跨月后恢复免费', consume_free_chat(u, 20), true);
  perform assert_eq('验收 23 · 计数从 1 重新起算',
    (select free_chat_used from quota_counters where user_id=u), 1);
  perform assert_eq('验收 23 · 月份跟着更新',
    (select free_chat_month from quota_counters where user_id=u), to_char(now(),'YYYY-MM'));

  -- 24 每日对话总轮次（防刷，与计费无关）
  update quota_counters set chat_day = current_date, chat_day_used = 0 where user_id = u;
  for i in 1..5 loop
    if not bump_chat_day(u, 5) then raise exception '✗ 验收 24 · 第 % 轮就被拦', i; end if;
  end loop;
  perform assert_eq('验收 24 · 撞上日上限被拒', bump_chat_day(u, 5), false);
  perform assert_eq('验收 24 · 被拒不影响余额',
    (select credits_available from quota_counters where user_id=u),
    (select credits_available from quota_counters where user_id=u));
  update quota_counters set chat_day = current_date - 1 where user_id = u;
  perform assert_eq('验收 24 · 跨日后恢复', bump_chat_day(u, 5), true);
  perform assert_eq('验收 24 · 跨日计数重置',
    (select chat_day_used from quota_counters where user_id=u), 1);
end $$;

-- =============================================================
-- 重生成窗口（验收 25、28、29、30）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  fp text := 'core111.v1';
  i int;
begin
  delete from usage_logs where user_id = u;

  -- 没有前一次收费生成 → 不是「重新生成」，照常收费
  perform assert_eq('第一次生成不走窗口',
    check_regen_free(u, 'resume_baseline', fp, 24, 3), false);

  -- 25 窗口内、事实未变 → 免费
  insert into usage_logs (user_id, action_code, credits_charged, succeeded, fingerprint, created_at)
  values (u, 'resume_baseline', 10, true, fp, now() - interval '1 hour');
  perform assert_eq('验收 25 · 24h 内重新生成免费',
    check_regen_free(u, 'resume_baseline', fp, 24, 3), true);

  -- 28 只有提示词版本不同 → 仍算同一个输入
  perform assert_eq('验收 28 · 只改提示词版本仍免费',
    check_regen_free(u, 'resume_baseline', 'core111.v9', 24, 3), true);

  -- 26/27 指纹不同 → 收费
  perform assert_eq('验收 26/27 · 指纹变了就收费',
    check_regen_free(u, 'resume_baseline', 'core222.v1', 24, 3), false);

  -- 30 窗口内免费次数上限
  for i in 1..3 loop
    insert into usage_logs (user_id, action_code, credits_charged, free_reason,
                            succeeded, fingerprint, created_at)
    values (u, 'resume_baseline', 0, 'regen_window', true, fp, now() - interval '10 minutes');
  end loop;
  perform assert_eq('验收 30 · 24h 内第 4 次重新生成开始收费',
    check_regen_free(u, 'resume_baseline', fp, 24, 3), false);

  -- 29 超出窗口
  delete from usage_logs where user_id = u;
  insert into usage_logs (user_id, action_code, credits_charged, succeeded, fingerprint, created_at)
  values (u, 'resume_baseline', 10, true, fp, now() - interval '25 hours');
  perform assert_eq('验收 29 · 25 小时后重新生成收费',
    check_regen_free(u, 'resume_baseline', fp, 24, 3), false);
end $$;

-- =============================================================
-- 预算护栏（验收 35–39）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  r jsonb; h jsonb;
  cap_normal numeric := 20000;   -- ¥200/日
  cap_tiny   numeric := 1;       -- ¥0.01
  est        numeric := 500;
begin
  delete from global_budget_counters;
  update user_profiles set signup_grant_issued = false, signup_grant_issued_at = null
   where user_id = u;
  delete from entitlements where user_id = u and source = 'grant_signup';

  -- 正常上限下发得出去
  r := claim_signup_grant(u, 45, cap_normal, est);
  perform assert_eq('正常上限 · 赠送发得出去', (r->>'granted')::int, 45);
  perform assert_eq('正常上限 · 计入护栏',
    (select signup_grant_count from global_budget_counters where bucket_date=current_date), 1);

  -- 幂等：领过了不给第二份
  r := claim_signup_grant(u, 45, cap_normal, est);
  perform assert_eq('赠送只发一次', (r->>'granted')::int, 0);
  perform assert_eq('第二次的理由是已发放', r->>'reason', 'ALREADY_ISSUED');

  -- 35 日上限调到极小 → 新注册赠送暂停
  update user_profiles set signup_grant_issued = false where user_id = u;
  r := claim_signup_grant(u, 45, cap_tiny, est);
  perform assert_eq('验收 35 · 触顶后暂停发放', (r->>'ok')::boolean, false);
  perform assert_eq('验收 35 · 理由是护栏', r->>'reason', 'BUDGET_CAPPED');
  perform assert_eq('验收 35 · 触顶不写「已发放」，恢复后还能领',
    (select signup_grant_issued from user_profiles where user_id=u), false);

  -- 36 已有用户的限次免费对话照常
  update quota_counters set free_chat_month = to_char(now(),'YYYY-MM'), free_chat_used = 0
   where user_id = u;
  perform assert_eq('验收 36 · 触顶时免费对话照常', consume_free_chat(u, 20), true);

  -- 37 付费动作不受影响
  perform grant_credits(u, 'purchase', 50);
  h := hold_credits(u, 'target_assess', 5, 'budget-1');
  perform settle_hold((h->>'hold_id')::uuid);
  perform assert_eq('验收 37 · 触顶时付费动作照常',
    (select count(*)::int from usage_logs
      where user_id=u and action_code='target_assess' and credits_charged=5), 1);

  -- 38 永久免费的纯代码动作不受影响
  perform log_free_usage(u, 'data_export', 'free_forever');
  perform assert_eq('验收 38 · 触顶时导出照常',
    (select count(*)::int from usage_logs where user_id=u and action_code='data_export'), 1);

  -- 39 跨日后恢复
  --
  -- 这里的上限要设成「刚好还能发一笔」的量：日上限本身低于单笔预估的话，
  -- 跨不跨日都发不出来，测的就不是「计数重置」了。
  delete from global_budget_counters;
  insert into global_budget_counters (bucket_date, free_cost_cents)
  values (current_date, est);
  update user_profiles set signup_grant_issued = false where user_id = u;

  r := claim_signup_grant(u, 45, est + 100, est);
  perform assert_eq('验收 39 · 今日已用满时仍然暂停', (r->>'ok')::boolean, false);

  update global_budget_counters set bucket_date = current_date - 1
   where bucket_date = current_date;
  r := claim_signup_grant(u, 45, est + 100, est);
  perform assert_eq('验收 39 · 跨日后计数重置，赠送恢复', (r->>'granted')::int, 45);
end $$;

-- =============================================================
-- 悬挂清理（验收 40）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  h jsonb; a int; n int;
begin
  delete from usage_logs where user_id = u;
  delete from credit_holds where user_id = u;
  delete from entitlements where user_id = u;
  update quota_counters set credits_available = 0, credits_held = 0 where user_id = u;
  perform grant_credits(u, 'purchase', 100);

  -- 造一个已过期的 held
  h := hold_credits(u, 'interview_kit', 25, 'sweep-1');
  update credit_holds set expires_at = now() - interval '1 minute'
   where id = (h->>'hold_id')::uuid;
  -- 再造一个没过期的，确认扫描不会误伤
  perform hold_credits(u, 'resume_baseline', 10, 'sweep-2');

  select credits_available into a from quota_counters where user_id = u;
  perform assert_eq('两笔预扣后余额 65', a, 65);

  n := sweep_expired_holds(500);
  perform assert_eq('验收 40 · 只释放了过期那一笔', n, 1);
  select credits_available into a from quota_counters where user_id = u;
  perform assert_eq('验收 40 · 过期预扣的钱退回来了', a, 90);
  perform assert_eq('验收 40 · 状态置为 released',
    (select status from credit_holds where id=(h->>'hold_id')::uuid), 'released');
  perform assert_eq('验收 40 · 释放原因是 expired',
    (select release_reason from credit_holds where id=(h->>'hold_id')::uuid), 'expired');
  perform assert_eq('验收 40 · 走的是 release_hold，失败日志照写',
    (select count(*)::int from usage_logs
      where user_id=u and succeeded=false and action_code='interview_kit'), 1);
  perform assert_eq('验收 40 · 没过期的那笔没被动',
    (select status from credit_holds where user_id=u and idempotency_key='sweep-2'), 'held');

  -- 再扫一次不应重复退
  perform assert_eq('重复扫描不重复退', sweep_expired_holds(500), 0);
  select credits_available into a from quota_counters where user_id = u;
  perform assert_eq('余额没有二次变动', a, 90);
end $$;

-- 过期赠送出账
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  e uuid; a int;
begin
  delete from usage_logs where user_id = u;
  delete from credit_holds where user_id = u;
  delete from entitlements where user_id = u;
  update quota_counters set credits_available = 0, credits_held = 0 where user_id = u;

  perform grant_credits(u, 'purchase', 100);
  e := grant_credits(u, 'grant_signup', 45, now() + interval '1 day');
  update entitlements set expires_at = now() - interval '1 hour' where id = e;
  -- 快照此刻还是 145，过期不会自己反映到余额上
  select credits_available into a from quota_counters where user_id = u;
  perform assert_eq('过期前快照仍是 145', a, 145);

  perform assert_eq('扫描认领了一个用户', sweep_expired_entitlements(500), 1);
  select credits_available into a from quota_counters where user_id = u;
  perform assert_eq('过期赠送出账后余额降到 100', a, 100);
  perform assert_eq('打标而不是改账 · credits_used 原样保留',
    (select credits_used from entitlements where id = e), 0);
  perform assert_eq('打标后不再重复捞', sweep_expired_entitlements(500), 0);
end $$;

-- =============================================================
-- 长任务的预扣与按实际结算（C2 验收 13、14、17、22）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  j1 uuid := gen_random_uuid();
  j2 uuid := gen_random_uuid();
  j3 uuid := gen_random_uuid();
  h jsonb; r jsonb; a int;
begin
  delete from job_holds where user_id = u;
  delete from usage_logs where user_id = u;
  delete from credit_holds where user_id = u;
  delete from entitlements where user_id = u;
  update quota_counters set credits_available = 0, credits_held = 0 where user_id = u;
  perform grant_credits(u, 'purchase', 300);

  -- 预估 36（6 段 + 18 扫描页），实际 4 段 → 按 24 结算，退 12
  h := hold_for_job(u, j1, 'doc_parse_base', 36, 'p1');
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('预扣 36 后余额 264', a, 264);
  r := settle_job(j1, 24);
  perform assert_eq('C2 验收 13 · 按真实值结算', (r->>'charged')::int, 24);
  perform assert_eq('C2 验收 13 · 差额退回', (r->>'refunded')::int, 12);
  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('C2 验收 13 · 余额比预估多 12', a, 276);
  perform assert_eq('C2 验收 13 · 消费明细记的是真实值',
    (select credits_charged from usage_logs where hold_id=(h->>'hold_id')::uuid), 24);

  -- 预估 36，实际 48 → 仍按 36 收，超出不加价
  h := hold_for_job(u, j2, 'doc_parse_base', 36, 'p2');
  r := settle_job(j2, 48);
  perform assert_eq('C2 验收 14 · 超出预估仍按预估收', (r->>'charged')::int, 36);
  perform assert_eq('C2 验收 14 · 没有多扣', (r->>'refunded')::int, 0);

  -- 解析失败 → 全额退回
  h := hold_for_job(u, j3, 'doc_parse_base', 36, 'p3');
  select credits_available into a from quota_counters where user_id=u;
  r := release_job(j3, 'failed');
  perform assert_eq('C2 验收 17 · 失败全额退回', (r->>'refunded')::int, 36);
  perform assert_eq('C2 验收 17 · 余额复原',
    (select credits_available from quota_counters where user_id=u), a + 36);
  perform assert_eq('C2 验收 17 · 失败也写消费明细',
    (select count(*)::int from usage_logs
      where hold_id=(h->>'hold_id')::uuid and succeeded=false), 1);

  -- 断点续跑：同一个作业重复预扣不重复扣分
  h := hold_for_job(u, j2, 'interview_kit', 25, 'p4');
  perform assert_eq('C2 验收 22 · 同一作业复用原来那笔', (h->>'reused')::boolean, true);

  -- 重复结算不重复扣
  r := settle_job(j2, 10);
  perform assert_eq('重复结算被挡下', (r->>'ok')::boolean, false);
end $$;

-- =============================================================
-- 异步作业超时（C2 验收 24）
-- =============================================================
do $$
declare
  u uuid := '99999999-9999-9999-9999-999999999999';
  j uuid := gen_random_uuid();
  a int; r jsonb;
begin
  delete from async_jobs where user_id = u;
  delete from job_holds where user_id = u;
  update quota_counters set credits_available = 0, credits_held = 0 where user_id = u;
  delete from entitlements where user_id = u;
  perform grant_credits(u, 'purchase', 100);

  r := hold_for_job(u, j, 'interview_kit', 25, 'job-timeout');
  insert into async_jobs (id, user_id, kind, status, hold_id, expires_at)
  values (j, u, 'interview_kit', 'running', (r->>'hold_id')::uuid, now() - interval '1 minute');

  select credits_available into a from quota_counters where user_id=u;
  perform assert_eq('预扣后余额 75', a, 75);

  perform assert_eq('C2 验收 24 · 扫到一个超时作业', sweep_expired_jobs(100), 1);
  perform assert_eq('C2 验收 24 · 作业标为失败',
    (select status from async_jobs where id=j), 'failed');
  perform assert_eq('C2 验收 24 · 25 分退回',
    (select credits_available from quota_counters where user_id=u), 100);
  perform assert_eq('C2 验收 24 · 预扣归零',
    (select credits_held from quota_counters where user_id=u), 0);
  perform assert_eq('C2 验收 24 · 退回也写消费明细',
    (select count(*)::int from usage_logs
      where user_id=u and action_code='interview_kit' and succeeded=false), 1);

  perform assert_eq('重复扫不重复退', sweep_expired_jobs(100), 0);

  -- 没跑过头的不该被误伤
  delete from async_jobs where user_id = u;
  delete from job_holds where user_id = u;
  r := hold_for_job(u, j, 'interview_kit', 25, 'job-alive');
  insert into async_jobs (id, user_id, kind, status, hold_id, expires_at)
  values (j, u, 'interview_kit', 'running', (r->>'hold_id')::uuid, now() + interval '10 minutes');
  perform assert_eq('还在跑的作业不被扫', sweep_expired_jobs(100), 0);
  perform assert_eq('它的钱还预扣着',
    (select credits_held from quota_counters where user_id=u), 25);

  -- billing_sweep 把作业超时也算进去
  update async_jobs set expires_at = now() - interval '1 minute' where id = j;
  r := billing_sweep(500);
  perform assert_eq('billing_sweep 报告了超时作业数', (r->>'jobs_timed_out')::int, 1);
end $$;

-- =============================================================
-- 兑换码（C3 验收 27–31，随兑换码后台 A0–A5 重写）
--
-- 表结构从 redeem_codes 一张扩成 batches / codes / redemptions 三张，
-- 话术也换了 —— 不存在 / 已停用 / 已作废三种归并成 UNUSABLE，不再
-- 单独报 NOT_FOUND。
-- =============================================================
do $$
declare
  u   uuid := '99999999-9999-9999-9999-999999999999';
  u2  uuid := '88888888-8888-8888-8888-888888888888';
  adm uuid := '77777777-7777-7777-7777-777777777777';
  r jsonb; bid uuid; cid uuid;
begin
  delete from redeem_attempts;
  delete from redeem_redemptions;
  delete from redeem_codes;
  delete from redeem_batches;
  delete from entitlements where user_id in (u, u2);
  update quota_counters set credits_available = 0, credits_held = 0 where user_id in (u, u2);
  insert into auth.users (id, email) values (u2, 'other@test.local')
    on conflict (id) do nothing;
  insert into auth.users (id, email) values (adm, 'admin@test.local')
    on conflict (id) do nothing;
  perform ensure_quota_counter(u2);

  insert into redeem_batches
    (name, purpose, reason, credits_each, max_uses_each, code_count, created_by)
  values ('验收批', 'purchase', '求职包 ¥68 · 微信 someone 2026-09-05', 200, 1, 3, adm)
  returning id into bid;

  insert into redeem_codes (batch_id, code, credits, max_uses, code_expires_at)
  values (bid, 'PF-JOBA-0001', 200, 1, null),
         (bid, 'PF-OLDA-0002',  50, 1, now() - interval '1 day'),
         (bid, 'PF-MANY-0003',  50, 2, null);

  -- 30 不存在的码 —— 现在和「已停用」「已作废」共用一句话
  perform assert_eq('C3 验收 30 · 不存在的码',
    redeem_code(u, 'PF-NOPE-9999')->>'reason', 'UNUSABLE');

  -- 31 过期
  perform assert_eq('C3 验收 31 · 过期的码',
    redeem_code(u, 'PF-OLDA-0002')->>'reason', 'EXPIRED');

  -- 27 正常兑换
  r := redeem_code(u, 'PF-JOBA-0001');
  perform assert_eq('C3 验收 27 · 兑换成功', (r->>'credits')::int, 200);
  perform assert_eq('C3 验收 27 · source 是 redeem',
    (select source from entitlements where user_id=u order by created_at desc limit 1), 'redeem');
  perform assert_eq('C3 验收 27 · 永不过期',
    (select expires_at is null from entitlements where user_id=u order by created_at desc limit 1),
    true);
  perform assert_eq('C3 验收 27 · 余额到账',
    (select credits_available from quota_counters where user_id=u), 200);

  -- 28 同一人二次兑换
  perform assert_eq('C3 验收 28 · 自己再兑一次',
    redeem_code(u, 'PF-JOBA-0001')->>'reason', 'ALREADY_USED_BY_ME');

  -- 29 别人来兑一张已用完的
  perform assert_eq('C3 验收 29 · 被别人用完了',
    redeem_code(u2, 'PF-JOBA-0001')->>'reason', 'USED_UP');

  -- 34 追溯：核销 → 码 → 批次，一路走到一句人写的发放理由
  perform assert_eq('C3 验收 34 · 兑换记录能追溯到发放理由',
    (select count(*)::int
       from redeem_redemptions rr
       join redeem_codes rc   on rc.id = rr.code_id
       join redeem_batches rb on rb.id = rc.batch_id
      where rr.user_id = u and rb.reason like '求职包%'), 1);

  -- 大小写、空格、缺连字符都要兑得动
  perform assert_eq('码不区分大小写与首尾空格',
    (redeem_code(u2, '  pf many 0003  ')->>'ok')::boolean, true);
end $$;

-- =============================================================
-- 兑换码后台（A0–A5）
-- =============================================================
do $$
declare
  u   uuid := '99999999-9999-9999-9999-999999999999';
  adm uuid := '77777777-7777-7777-7777-777777777777';
  bid uuid; cid uuid; r jsonb;
begin
  -- A0 · 四张表对客户端零权限
  perform assert_eq('A0 · redeem_codes 对 authenticated 不可读',
    has_table_privilege('authenticated', 'redeem_codes', 'select'), false);
  perform assert_eq('A0 · redeem_batches 对 anon 不可读',
    has_table_privilege('anon', 'redeem_batches', 'select'), false);
  perform assert_eq('A0 · admin_users 对 authenticated 不可写',
    has_table_privilege('authenticated', 'admin_users', 'insert'), false);
  perform assert_eq('A0 · redeem_attempts 对 authenticated 不可读',
    has_table_privilege('authenticated', 'redeem_attempts', 'select'), false);

  -- A2 · 不是管理员就抛，且和「接口不存在」用同一种失败
  insert into admin_users (user_id, email) values (adm, 'admin@test.local')
    on conflict do nothing;
  perform _as(u);
  perform assert_eq('A2 · 非管理员 is_admin() 为假', is_admin(), false);
  perform assert_raises('A2 · 非管理员调 admin_overview 被拒',
    'select admin_overview()', 'NOT_ADMIN');

  perform _as(adm);
  perform assert_eq('A2 · 管理员 is_admin() 为真', is_admin(), true);

  -- A3 · 生成批次的三道护栏
  perform assert_eq('A3 · 生成成功',
    (admin_create_batch('A 批','internal_beta','验收用', 100, 1, null, null, null,
      array['PF-AAAA-0001','PF-AAAA-0002'])->>'count')::int, 2);
  select id into bid from redeem_batches where name = 'A 批';

  -- A4 · 停用可逆、作废不可逆
  select id into cid from redeem_codes where code = 'PF-AAAA-0001';
  perform assert_eq('A4 · 停用', admin_toggle_code(cid, '发错人了')->>'status', 'disabled');
  perform _as(u);
  perform assert_eq('A4 · 停用的码兑换返回 UNUSABLE',
    redeem_code(u, 'PF-AAAA-0001')->>'reason', 'UNUSABLE');
  perform _as(adm);
  perform assert_eq('A4 · 恢复', admin_toggle_code(cid, null)->>'status', 'active');
  perform assert_eq('A4 · 整批作废',
    (admin_revoke_batch(bid, '验收用，不再发', 'A 批')->>'revoked_codes')::int, 2);

  -- A5 · 孤儿额度是这套设计的自检项
  perform assert_eq('A5 · 没有孤儿额度',
    jsonb_array_length(admin_anomalies() -> 'orphan'), 0);
  -- grant_credits 会走 billing_assert_owner，得以 u 自己的身份调
  perform _as(u);
  perform grant_credits(u, 'adjust', 100, null, '手工改余额');
  perform _as(adm);
  perform assert_eq('A5 · 手工调整会被扫出来',
    jsonb_array_length(admin_anomalies() -> 'orphan'), 1);

  perform _as(null);
end $$;

\echo ''
\echo '全部通过。'
