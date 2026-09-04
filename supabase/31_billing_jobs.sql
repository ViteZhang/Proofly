-- =============================================================
-- Proofly · 31 长任务的计费原语
--
-- 上游：《商业化技术方案 v1.0》3.3 ·《商业化 C2》2.1、2.2
--
-- 同步动作的账在一个函数调用里就结清了。长任务不行：文档解析跑在
-- after() 里，面试题包要跑十分钟 —— 预扣发生在「用户点确认」那一刻，
-- 结算发生在几分钟后的另一个进程里。
--
-- 中间那段时间，release_token 得有地方放。放在作业表上不行：作业表
-- 客户端读得到，token 一旦泄露，用户就能在长任务跑到一半时自己把钱
-- 退了、结果照拿（见 25 的 release_hold）。
--
-- 所以单开一张服务端专用表。客户端碰不到，函数按 job_ref 找账。
-- =============================================================

create table if not exists job_holds (
  -- 作业 id。ingest_jobs / async_jobs 都往这里挂，所以不设外键。
  job_ref uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  hold_id uuid not null references credit_holds on delete cascade,
  release_token uuid not null,
  created_at timestamptz not null default now()
);

alter table job_holds disable row level security;
revoke all on job_holds from anon, authenticated, public;

-- -------------------------------------------------------------
-- 预扣（不结算）
--
-- 返回形状与 hold_credits 一致，但不回 release_token —— 调用方拿不到
-- 也不需要，结算与释放都按 job_ref 走下面两个函数。
-- -------------------------------------------------------------
create or replace function hold_for_job(
  p_user uuid,
  p_job_ref uuid,
  p_action text,
  p_credits int,
  p_key text,
  p_fingerprint text default null,
  p_ttl_min int default 25
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hold jsonb;
begin
  perform billing_assert_owner(p_user);

  -- 同一个作业重复预扣直接返回原来那笔。断点续跑就靠这条：
  -- 重试时复用同一个 hold，不重复扣分。
  if exists (select 1 from job_holds where job_ref = p_job_ref) then
    select jsonb_build_object(
             'hold_id', jh.hold_id,
             'balance_after', q.credits_available,
             'reused', true)
      into v_hold
      from job_holds jh join quota_counters q on q.user_id = jh.user_id
     where jh.job_ref = p_job_ref;
    return v_hold;
  end if;

  v_hold := hold_credits(p_user, p_action, p_credits, p_key, p_fingerprint,
                         p_ttl_min, p_job_ref);

  insert into job_holds (job_ref, user_id, hold_id, release_token)
  values (p_job_ref, p_user, (v_hold->>'hold_id')::uuid,
          (v_hold->>'release_token')::uuid)
  on conflict (job_ref) do nothing;

  return jsonb_build_object(
    'hold_id', v_hold->>'hold_id',
    'balance_after', (v_hold->>'balance_after')::int,
    'reused', false);
end $$;

-- -------------------------------------------------------------
-- 结算（可少收）
--
-- p_actual_credits 小于预扣值时，差额退回。文档解析就是这么用的：
-- 段数要抽完才知道，预估多了的部分不收费（C2 2.1）。
-- 大于预扣值时按预扣值收 —— 预估偏差是我们的问题，不该用户买单。
-- -------------------------------------------------------------
create or replace function settle_job(
  p_job_ref uuid,
  p_actual_credits int default null,
  p_usage_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  jh     job_holds%rowtype;
  h      credit_holds%rowtype;
  v_keep int;
  v_back int;
begin
  select * into jh from job_holds where job_ref = p_job_ref;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NO_HOLD');
  end if;
  perform billing_assert_owner(jh.user_id);

  select * into h from credit_holds where id = jh.hold_id for update;
  if h.status <> 'held' then
    return jsonb_build_object('ok', false, 'reason', 'HOLD_NOT_HELD', 'status', h.status);
  end if;

  v_keep := least(coalesce(p_actual_credits, h.credits), h.credits);
  if v_keep < 0 then v_keep := 0; end if;
  v_back := h.credits - v_keep;

  if v_back > 0 then
    -- 先把差额退回可用余额，再把 hold 改成只值 v_keep，
    -- 这样 settle_hold 结算的就是真实消耗。
    update quota_counters
       set credits_available = credits_available + v_back,
           credits_held      = greatest(credits_held - v_back, 0),
           updated_at = now()
     where user_id = jh.user_id;
    update credit_holds set credits = v_keep where id = jh.hold_id;
  end if;

  perform settle_hold(jh.hold_id, p_usage_meta);

  return jsonb_build_object('ok', true, 'charged', v_keep, 'refunded', v_back);
end $$;

-- -------------------------------------------------------------
-- 释放
--
-- token 从 job_holds 里取，调用方不经手。
-- -------------------------------------------------------------
create or replace function release_job(
  p_job_ref uuid,
  p_reason text,
  p_usage_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  jh job_holds%rowtype;
  h  credit_holds%rowtype;
begin
  select * into jh from job_holds where job_ref = p_job_ref;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NO_HOLD');
  end if;
  perform billing_assert_owner(jh.user_id);

  select * into h from credit_holds where id = jh.hold_id;
  if h.status <> 'held' then
    return jsonb_build_object('ok', false, 'reason', 'HOLD_NOT_HELD', 'status', h.status);
  end if;

  perform release_hold(jh.hold_id, p_reason, jh.release_token, p_usage_meta);
  return jsonb_build_object('ok', true, 'refunded', h.credits);
end $$;

-- 作业的预扣还在不在。界面要靠它显示「预扣中」。
create or replace function job_hold_status(p_job_ref uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare jh job_holds%rowtype; h credit_holds%rowtype;
begin
  select * into jh from job_holds where job_ref = p_job_ref;
  if not found then return jsonb_build_object('found', false); end if;
  perform billing_assert_owner(jh.user_id);
  select * into h from credit_holds where id = jh.hold_id;
  return jsonb_build_object(
    'found', true, 'status', h.status, 'credits', h.credits,
    'action_code', h.action_code);
end $$;

revoke all on function hold_for_job(uuid, uuid, text, int, text, text, int)
  from public, anon, authenticated;
revoke all on function settle_job(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function release_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function job_hold_status(uuid) from public, anon, authenticated;

grant execute on function hold_for_job(uuid, uuid, text, int, text, text, int) to authenticated;
grant execute on function settle_job(uuid, int, jsonb) to authenticated;
grant execute on function release_job(uuid, text, jsonb) to authenticated;
grant execute on function job_hold_status(uuid) to authenticated;
