-- =============================================================
-- Proofly · 27 预算护栏
--
-- 上游：《商业化技术方案 v1.0》0.4、4.3 ·《商业化 C1》切片 C1.6
--
-- 「全站免费动作的日成本封顶」是跨用户聚合，业务表按 user_id 开了
-- RLS，普通会话根本算不出全站合计。所以单独一张不带 user_id 的表，
-- 客户端永远碰不到（24 里已经 revoke all），只有这里的
-- SECURITY DEFINER 函数进得去。
--
-- 触顶后只掐获客支出：新注册赠送暂停，已有用户的免费对话照常。
-- 上限一律当参数传，配置在 src/config/plan.ts 的 BUDGET。
-- =============================================================

-- -------------------------------------------------------------
-- 记一笔免费支出
-- -------------------------------------------------------------
create or replace function record_free_spend(p_cost_cents numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into global_budget_counters (bucket_date, free_cost_cents, free_action_count)
  values (current_date, coalesce(p_cost_cents, 0), 1)
  on conflict (bucket_date) do update
     set free_cost_cents   = global_budget_counters.free_cost_cents
                             + coalesce(p_cost_cents, 0),
         free_action_count = global_budget_counters.free_action_count + 1,
         updated_at = now();
end $$;

-- -------------------------------------------------------------
-- 还发得起吗
--
-- 只读。返回 ok=false 时调用方按降级表处理 —— 注意降级表里
-- **只有新注册赠送**会因此暂停。
-- -------------------------------------------------------------
create or replace function check_global_budget(
  p_est_cents numeric,
  p_cap_cents numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_spent numeric := 0;
begin
  select free_cost_cents into v_spent
    from global_budget_counters where bucket_date = current_date;
  v_spent := coalesce(v_spent, 0);

  return jsonb_build_object(
    'ok', v_spent + coalesce(p_est_cents, 0) <= p_cap_cents,
    'spent_cents', v_spent,
    'cap_cents', p_cap_cents,
    'estimate_cents', coalesce(p_est_cents, 0));
end $$;

-- -------------------------------------------------------------
-- 免费动作留痕（替换 26 的版本）
--
-- 免费动作的成本要同时落到两个地方：用户的消费明细，和全站的日预算。
-- 分两次调用意味着可能只写成一半，所以并到一个函数里。
-- -------------------------------------------------------------
create or replace function log_free_usage(
  p_user uuid,
  p_action text,
  p_reason text,
  p_fingerprint text default null,
  p_succeeded boolean default true,
  p_usage_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform billing_assert_owner(p_user);
  insert into usage_logs (
    user_id, action_code, credits_charged, free_reason, fingerprint,
    llm_call_ids, input_tokens, output_tokens, cost_cents, duration_ms, succeeded)
  values (
    p_user, p_action, 0, p_reason, p_fingerprint,
    coalesce(p_usage_meta->'llm_call_ids', '[]'::jsonb),
    (p_usage_meta->>'input_tokens')::int,
    (p_usage_meta->>'output_tokens')::int,
    (p_usage_meta->>'cost_cents')::numeric,
    (p_usage_meta->>'duration_ms')::int,
    p_succeeded);

  perform record_free_spend(coalesce((p_usage_meta->>'cost_cents')::numeric, 0));
end $$;

-- -------------------------------------------------------------
-- 领取注册赠送
--
-- 走护栏的唯一一个地方。
--
-- 触顶时**不**把 signup_grant_issued 置真 —— 这笔赠送只是没发成，
-- 不是发过了。护栏恢复后用户下次进来还能领到，否则触顶那几小时
-- 注册的人就永久少了 45 分，而他们根本不知道发生过什么。
-- -------------------------------------------------------------
create or replace function claim_signup_grant(
  p_user uuid,
  p_credits int,
  p_cap_cents numeric,
  p_est_cents numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_issued boolean;
  v_budget jsonb;
  v_ent    uuid;
begin
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  select signup_grant_issued into v_issued from user_profiles where user_id = p_user for update;
  if v_issued then
    return jsonb_build_object('ok', true, 'granted', 0, 'reason', 'ALREADY_ISSUED');
  end if;

  v_budget := check_global_budget(p_est_cents, p_cap_cents);
  if not (v_budget->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'granted', 0, 'reason', 'BUDGET_CAPPED',
                              'budget', v_budget);
  end if;

  v_ent := grant_credits(p_user, 'grant_signup', p_credits, null, '注册赠送');

  update user_profiles
     set signup_grant_issued = true, signup_grant_issued_at = now()
   where user_id = p_user;

  insert into global_budget_counters (bucket_date, free_cost_cents, signup_grant_count)
  values (current_date, p_est_cents, 1)
  on conflict (bucket_date) do update
     set free_cost_cents    = global_budget_counters.free_cost_cents + p_est_cents,
         signup_grant_count = global_budget_counters.signup_grant_count + 1,
         updated_at = now();

  return jsonb_build_object('ok', true, 'granted', p_credits, 'entitlement_id', v_ent);
end $$;

-- =============================================================
-- 权限
-- =============================================================
revoke all on function record_free_spend(numeric) from public, anon, authenticated;
revoke all on function check_global_budget(numeric, numeric) from public, anon, authenticated;
revoke all on function claim_signup_grant(uuid, int, numeric, numeric)
  from public, anon, authenticated;

-- 领赠送必须由用户自己触发（首次登录的 Server Action），所以要授权；
-- 函数内部自己校验 signup_grant_issued 与护栏，重复调用拿不到第二份。
grant execute on function claim_signup_grant(uuid, int, numeric, numeric) to authenticated;
grant execute on function check_global_budget(numeric, numeric) to authenticated;
