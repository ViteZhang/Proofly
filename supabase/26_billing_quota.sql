-- =============================================================
-- Proofly · 26 免费判定 · 限次免费 / 重生成窗口 / 免费动作留痕
--
-- 上游：《商业化技术方案 v1.0》0.3、4.1–4.2 ·《商业化 C1》切片 C1.4–C1.5
--
-- 免费不等于不记账。usage_logs 对客户端不可写，所以免费分支也得
-- 从 SECURITY DEFINER 函数走一趟 —— 免费动作的真实成本要看得见，
-- 否则预算护栏就是拍脑袋。
--
-- 阈值一律当参数传进来，不写死在 SQL 里：单一事实源在
-- src/config/plan.ts，SQL 只负责原子性。
-- =============================================================

-- 指纹落在消费明细上，重生成窗口靠它比对。
alter table usage_logs add column if not exists fingerprint text;
create index if not exists usage_logs_fingerprint_idx
  on usage_logs (user_id, action_code, created_at desc)
  where fingerprint is not null;

-- -------------------------------------------------------------
-- 免费动作留痕
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
end $$;

-- 结算时把指纹补到那条消费记录上（settle_hold 只认 hold）。
create or replace function tag_usage_fingerprint(p_hold uuid, p_fingerprint text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from credit_holds where id = p_hold;
  if not found then return; end if;
  perform billing_assert_owner(v_user);
  update usage_logs set fingerprint = p_fingerprint where hold_id = p_hold;
end $$;

-- -------------------------------------------------------------
-- 限次免费：随手记的记录轮次
--
-- 月度惰性重置：读的时候发现月份对不上就归零。不跑定时任务 ——
-- 定时任务多一个会挂的地方，而这件事完全可以在读的那一刻做掉。
--
-- 返回 true 表示这一轮走免费额度（计数已 +1），false 表示额度用完，
-- 调用方按 chat_record_overage 收费。
-- -------------------------------------------------------------
create or replace function consume_free_chat(p_user uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_used  int;
begin
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  -- 单条 UPDATE 完成「跨月归零 + 计数 +1」，并发下不会各加各的。
  update quota_counters
     set free_chat_month = v_month,
         free_chat_used  = case when free_chat_month = v_month
                                then free_chat_used + 1 else 1 end,
         updated_at = now()
   where user_id = p_user
     and (free_chat_month <> v_month or free_chat_used < p_limit)
  returning free_chat_used into v_used;

  return found;
end $$;

-- -------------------------------------------------------------
-- 反滥用：每日对话总轮次
--
-- 这不是计费。闲聊永久免费，但每次仍有真实成本，得有个刹车。
-- 不看余额，也不扣分 —— 付费用户撞上这条一样被拦。
-- 返回 true 表示放行。
-- -------------------------------------------------------------
create or replace function bump_chat_day(p_user uuid, p_cap int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  update quota_counters
     set chat_day      = current_date,
         chat_day_used = case when chat_day = current_date
                              then chat_day_used + 1 else 1 end,
         updated_at = now()
   where user_id = p_user
     and (chat_day <> current_date or chat_day_used < p_cap);

  return found;
end $$;

-- -------------------------------------------------------------
-- 重生成窗口
--
-- 指纹形如 `<core>.<prompt_version>`。比对只看 core ——
-- 提示词是我们改的，不该让用户为此买单（技术方案 0.3）。
--
-- 免费的条件：窗口内存在同 core 的**收费**记录（说明这是「重新生成」
-- 而不是第一次），且此后的免费重生成次数没超上限。
-- -------------------------------------------------------------
create or replace function check_regen_free(
  p_user uuid,
  p_action text,
  p_fingerprint text,
  p_window_hours int,
  p_max int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_core  text := split_part(p_fingerprint, '.', 1);
  v_since timestamptz := now() - make_interval(hours => p_window_hours);
  v_paid  timestamptz;
  v_free  int;
begin
  perform billing_assert_owner(p_user);
  if p_fingerprint is null or v_core = '' then return false; end if;

  -- 窗口内最近一次收费生成
  select max(created_at) into v_paid
    from usage_logs
   where user_id = p_user and action_code = p_action
     and succeeded and credits_charged > 0
     and created_at >= v_since
     and split_part(fingerprint, '.', 1) = v_core;

  if v_paid is null then return false; end if;

  -- 那次之后已经免费重生成过几回
  select count(*) into v_free
    from usage_logs
   where user_id = p_user and action_code = p_action
     and succeeded and free_reason = 'regen_window'
     and created_at > v_paid
     and split_part(fingerprint, '.', 1) = v_core;

  return v_free < p_max;
end $$;

-- =============================================================
-- 权限
-- =============================================================
revoke all on function log_free_usage(uuid, text, text, text, boolean, jsonb)
  from public, anon, authenticated;
revoke all on function tag_usage_fingerprint(uuid, text) from public, anon, authenticated;
revoke all on function consume_free_chat(uuid, int) from public, anon, authenticated;
revoke all on function bump_chat_day(uuid, int) from public, anon, authenticated;
revoke all on function check_regen_free(uuid, text, text, int, int)
  from public, anon, authenticated;

grant execute on function log_free_usage(uuid, text, text, text, boolean, jsonb) to authenticated;
grant execute on function tag_usage_fingerprint(uuid, text) to authenticated;
grant execute on function consume_free_chat(uuid, int) to authenticated;
grant execute on function bump_chat_day(uuid, int) to authenticated;
grant execute on function check_regen_free(uuid, text, text, int, int) to authenticated;
