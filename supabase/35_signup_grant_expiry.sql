-- =============================================================
-- Proofly · 35 注册赠送的到期时间
--
-- 上游：《商业化 C3》切片 C3.1 ·《商业化方案》3.5「赠送积分当月有效」
--
-- C1 里的 claim_signup_grant 发的是永不过期的赠送 —— 那等于把赠送
-- 变成了购买。当月有效这条不是抠门：赠送积分优先被消耗（扣减顺序
-- 先扣快过期的），有到期时间才推得动新用户尽快用起来，而「用起来」
-- 正是这 45 分要买的东西。
-- =============================================================

create or replace function claim_signup_grant(
  p_user uuid,
  p_credits int,
  p_cap_cents numeric,
  p_est_cents numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_issued  boolean;
  v_budget  jsonb;
  v_ent     uuid;
  v_expires timestamptz;
begin
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  select signup_grant_issued into v_issued from user_profiles where user_id = p_user for update;
  if v_issued then
    return jsonb_build_object('ok', true, 'granted', 0, 'reason', 'ALREADY_ISSUED');
  end if;

  v_budget := check_global_budget(p_est_cents, p_cap_cents);
  if not (v_budget->>'ok')::boolean then
    -- 触顶不写「已发放」：这笔只是没发成，不是发过了。
    -- 护栏恢复后用户下次进来还能领到（C3 的补发就靠这个）。
    return jsonb_build_object('ok', false, 'granted', 0, 'reason', 'BUDGET_CAPPED',
                              'budget', v_budget);
  end if;

  -- 当月最后一天 23:59:59。用本月第一天加一个月再减一秒，
  -- 不用写死 28/30/31，闰年也不用管。
  v_expires := date_trunc('month', now()) + interval '1 month' - interval '1 second';

  v_ent := grant_credits(p_user, 'grant_signup', p_credits, v_expires, '注册赠送');

  update user_profiles
     set signup_grant_issued = true, signup_grant_issued_at = now()
   where user_id = p_user;

  insert into global_budget_counters (bucket_date, free_cost_cents, signup_grant_count)
  values (current_date, p_est_cents, 1)
  on conflict (bucket_date) do update
     set free_cost_cents    = global_budget_counters.free_cost_cents + p_est_cents,
         signup_grant_count = global_budget_counters.signup_grant_count + 1,
         updated_at = now();

  return jsonb_build_object(
    'ok', true, 'granted', p_credits,
    'entitlement_id', v_ent, 'expires_at', v_expires);
end $$;

revoke all on function claim_signup_grant(uuid, int, numeric, numeric)
  from public, anon, authenticated;
grant execute on function claim_signup_grant(uuid, int, numeric, numeric) to authenticated;
