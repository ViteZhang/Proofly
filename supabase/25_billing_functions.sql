-- =============================================================
-- Proofly · 25 计费函数 · 预扣 / 结算 / 释放 / 发放 / 对账
--
-- 上游：《商业化技术方案 v1.0》第 3 节 ·《商业化 C1》切片 C1.3
--
-- 全部 SECURITY DEFINER。24 里那六张表对客户端只读，余额的每一次
-- 变动都必须从这里过 —— 这是整个计费引擎唯一的写入口。
--
-- 一条贯穿全文的约束：**扣减必须是单条原子 UPDATE**。
-- 先 SELECT 查余额再 UPDATE 扣减的两步写法一律不接受：两个动作
-- 同时发起时，两次 SELECT 都会看到「够」，然后各扣各的，余额扣成负数。
-- 靠的是 `where credits_available >= p_credits` 加 Postgres 的行级锁。
-- =============================================================

-- 24 里建过表的库补上这一列（新装的库在 24 就有了）。
alter table credit_holds
  add column if not exists release_token uuid not null default gen_random_uuid();

-- -------------------------------------------------------------
-- 归属校验
--
-- 这些函数以属主身份跑，绕过 RLS，所以必须自己检查 p_user。
-- auth.uid() 为 null 表示调用方是 service_role 或 SQL 编辑器
-- （定时任务、对账、人工修数据），放行。
-- -------------------------------------------------------------
create or replace function billing_assert_owner(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and p_user is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

-- -------------------------------------------------------------
-- 计数器行
--
-- 首次登录时调一次。事实层的版本号触发器只 UPDATE 不补插（见 24），
-- 所以这一行必须在任何事实写入之前就位。
-- -------------------------------------------------------------
create or replace function ensure_quota_counter(p_user uuid default auth.uid())
returns void language plpgsql security definer set search_path = public as $$
begin
  perform billing_assert_owner(p_user);
  insert into quota_counters (user_id) values (p_user)
  on conflict (user_id) do nothing;
  insert into user_profiles (user_id) values (p_user)
  on conflict (user_id) do nothing;
end $$;

-- -------------------------------------------------------------
-- 发放
--
-- 分笔记账：每次发放一行，因为购买与赠送的过期规则不同。
--
-- **不授权给 anon / authenticated。** 客户端能调它就等于能给自己
-- 充值。对外只暴露 redeem_code() 这类包装 —— 包装本身也是
-- SECURITY DEFINER，以属主身份调用这里，不需要调用方有执行权。
-- -------------------------------------------------------------
create or replace function grant_credits(
  p_user uuid,
  p_source text,
  p_credits int,
  p_expires timestamptz default null,
  p_note text default null,
  p_order_ref text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_credits <= 0 then
    raise exception 'INVALID_CREDITS' using errcode = '22023';
  end if;

  perform ensure_quota_counter(p_user);

  insert into entitlements (user_id, source, credits_total, expires_at, note, order_ref)
  values (p_user, p_source, p_credits, p_expires, p_note, p_order_ref)
  returning id into v_id;

  update quota_counters
     set credits_available = credits_available + p_credits,
         updated_at = now()
   where user_id = p_user;

  return v_id;
end $$;

-- -------------------------------------------------------------
-- ① HOLD 预扣
--
-- 返回 jsonb 而不是裸的 hold_id（施工提示词写的是后者）：还要带回
-- release_token。见下面 release_hold 的说明 —— 那个 token 是
-- 「失败不扣分」不被反向利用的唯一防线。
-- -------------------------------------------------------------
create or replace function hold_credits(
  p_user uuid,
  p_action text,
  p_credits int,
  p_key text,
  p_fingerprint text default null,
  p_ttl_min int default 5,
  p_job_ref uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hold  uuid;
  v_token uuid;
  v_left  int;
begin
  perform billing_assert_owner(p_user);

  if p_credits < 0 then
    raise exception 'INVALID_CREDITS' using errcode = '22023';
  end if;

  -- 幂等：同一个 key 已经预扣过，直接把原来那笔还回去，不重复扣。
  -- 重复点击、客户端重试、Server Action 被 React 重放，都走这条。
  select id, release_token into v_hold, v_token
    from credit_holds
   where user_id = p_user and idempotency_key = p_key;
  if found then
    select credits_available into v_left from quota_counters where user_id = p_user;
    return jsonb_build_object(
      'hold_id', v_hold, 'release_token', v_token,
      'balance_after', v_left, 'idempotent', true);
  end if;

  perform ensure_quota_counter(p_user);

  -- 扣减与插入放在同一个子事务里。
  -- 并发下两个同 key 的调用会双双穿过上面的 select，然后一个先插入成功、
  -- 另一个撞 unique 报错 —— 报错时子事务回滚，把它那次扣减一起带走。
  -- 如果 UPDATE 写在子事务外面，回滚不到它，就会白扣一笔。
  begin
    update quota_counters
       set credits_available = credits_available - p_credits,
           credits_held      = credits_held + p_credits,
           updated_at        = now()
     where user_id = p_user
       and credits_available >= p_credits;

    if not found then
      raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
    end if;

    insert into credit_holds
      (user_id, action_code, credits, idempotency_key, fingerprint, job_ref, expires_at)
    values
      (p_user, p_action, p_credits, p_key, p_fingerprint, p_job_ref,
       now() + make_interval(mins => p_ttl_min))
    returning id, release_token into v_hold, v_token;

  exception when unique_violation then
    select id, release_token into v_hold, v_token
      from credit_holds
     where user_id = p_user and idempotency_key = p_key;
    select credits_available into v_left from quota_counters where user_id = p_user;
    return jsonb_build_object(
      'hold_id', v_hold, 'release_token', v_token,
      'balance_after', v_left, 'idempotent', true);
  end;

  select credits_available into v_left from quota_counters where user_id = p_user;
  return jsonb_build_object(
    'hold_id', v_hold, 'release_token', v_token,
    'balance_after', v_left, 'idempotent', false);
end $$;

-- -------------------------------------------------------------
-- ② SETTLE 结算
--
-- credits_available 在 HOLD 时就已经减过了，这里不再动它 ——
-- 只把 credits_held 放掉，并把消费落到 entitlements 上。
--
-- 扣减优先级：先扣即将过期的，同到期时间下先扣先发放的。
-- 赠送积分当月有效，自然会被优先消耗 —— 既符合直觉，也免得
-- 赠送额度白白过期。
-- -------------------------------------------------------------
create or replace function settle_hold(
  p_hold uuid,
  p_usage_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  h        credit_holds%rowtype;
  r        record;
  v_remain int;
  v_take   int;
begin
  select * into h from credit_holds where id = p_hold for update;
  if not found then
    raise exception 'HOLD_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform billing_assert_owner(h.user_id);

  -- 防重复结算。已 settled 或已 released 的都在这里被挡下。
  if h.status <> 'held' then
    raise exception 'HOLD_NOT_HELD: %', h.status using errcode = 'P0003';
  end if;

  update quota_counters
     set credits_held = greatest(credits_held - h.credits, 0),
         updated_at   = now()
   where user_id = h.user_id;

  v_remain := h.credits;
  for r in
    select id, credits_total - credits_used as avail
      from entitlements
     where user_id = h.user_id
       and credits_total > credits_used
       and (expires_at is null or expires_at > now())
     -- id 是最后的决胜局：同一个事务里发放的两笔 created_at 完全相同，
     -- 没有它扣哪笔就看运气，测试也就测不出东西来。
     order by expires_at asc nulls last, created_at asc, id asc
     for update
  loop
    exit when v_remain <= 0;
    v_take := least(v_remain, r.avail);
    update entitlements
       set credits_used = credits_used + v_take, updated_at = now()
     where id = r.id;
    v_remain := v_remain - v_take;
  end loop;

  -- 记账对不上时不要在这里报错：活已经干完了，报错只会让用户既没拿到
  -- 结果又被扣了分。记下来，交给 reconcile_quota 修快照。
  if v_remain > 0 then
    raise notice 'settle_hold: entitlement 不足 %，差额 %', h.user_id, v_remain;
  end if;

  insert into usage_logs (
    user_id, hold_id, action_code, credits_charged, free_reason,
    llm_call_ids, input_tokens, output_tokens, cost_cents, duration_ms, succeeded)
  values (
    h.user_id, h.id, h.action_code, h.credits, null,
    coalesce(p_usage_meta->'llm_call_ids', '[]'::jsonb),
    (p_usage_meta->>'input_tokens')::int,
    (p_usage_meta->>'output_tokens')::int,
    (p_usage_meta->>'cost_cents')::numeric,
    (p_usage_meta->>'duration_ms')::int,
    true);

  update credit_holds
     set status = 'settled', settled_at = now()
   where id = p_hold;
end $$;

-- -------------------------------------------------------------
-- ③ RELEASE 释放
--
-- release_token 是施工提示词里没有的一道锁，加它的理由：
--
-- 这些函数得授权给 authenticated 才能用（项目里没有 service role
-- key，也不许有），而 anon key 是公开的 —— 也就是说浏览器能直接
-- 调到这里。没有 token 的话，用户完全可以在面试题包跑到第 9 分钟时
-- 自己调一次 release，钱退回来、结果照样拿到手。
--
-- token 在 HOLD 时生成，只回给服务端；credit_holds 的 select 权限
-- 按列授权，客户端读不到这一列。定时清理（超时释放）走 p_reason
-- = 'expired' 的服务端路径，不需要 token。
-- -------------------------------------------------------------
create or replace function release_hold(
  p_hold uuid,
  p_reason text,
  p_release_token uuid default null,
  p_usage_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare h credit_holds%rowtype;
begin
  select * into h from credit_holds where id = p_hold for update;
  if not found then
    raise exception 'HOLD_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform billing_assert_owner(h.user_id);

  -- 带着 JWT 调进来的必须出示 token；service_role 与定时任务不用。
  if auth.uid() is not null and p_release_token is distinct from h.release_token then
    raise exception 'BAD_RELEASE_TOKEN' using errcode = '42501';
  end if;

  if h.status <> 'held' then
    raise exception 'HOLD_NOT_HELD: %', h.status using errcode = 'P0003';
  end if;

  update quota_counters
     set credits_available = credits_available + h.credits,
         credits_held      = greatest(credits_held - h.credits, 0),
         updated_at        = now()
   where user_id = h.user_id;

  -- 失败也写 usage_logs。失败调用烧掉的 token 目前完全没有数据
  -- （商业化方案 9.5 缺口一），这是唯一的补法。
  insert into usage_logs (
    user_id, hold_id, action_code, credits_charged, free_reason,
    llm_call_ids, input_tokens, output_tokens, cost_cents, duration_ms, succeeded)
  values (
    h.user_id, h.id, h.action_code, 0, null,
    coalesce(p_usage_meta->'llm_call_ids', '[]'::jsonb),
    (p_usage_meta->>'input_tokens')::int,
    (p_usage_meta->>'output_tokens')::int,
    (p_usage_meta->>'cost_cents')::numeric,
    (p_usage_meta->>'duration_ms')::int,
    false);

  update credit_holds
     set status = 'released', released_at = now(), release_reason = p_reason
   where id = p_hold;
end $$;

-- -------------------------------------------------------------
-- 对账
--
-- quota_counters 是冗余快照，不是真相；真相是 entitlements 的聚合。
-- 两者不一致时以 entitlements 为准修快照，并留一条日志。
--
-- 赠送积分过期后余额自动变少，也是靠这个函数 —— 过期的笔不计入
-- 真相，一对账快照就跟着降下来。
-- -------------------------------------------------------------
create or replace function reconcile_quota(p_user uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_truth int;
  v_held  int;
  v_snap  int;
  v_fixed boolean := false;
begin
  perform billing_assert_owner(p_user);

  select coalesce(sum(credits_total - credits_used), 0) into v_truth
    from entitlements
   where user_id = p_user
     and (expires_at is null or expires_at > now());

  select credits_available, credits_held into v_snap, v_held
    from quota_counters where user_id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NO_COUNTER');
  end if;

  -- 真相里含着还在预扣中的那部分（HOLD 只挪了快照，没动 entitlements），
  -- 所以可用余额 = 真相 − 预扣中。
  if v_snap <> greatest(v_truth - v_held, 0) then
    update quota_counters
       set credits_available = greatest(v_truth - v_held, 0), updated_at = now()
     where user_id = p_user;
    insert into usage_logs (user_id, action_code, credits_charged, succeeded)
    values (p_user, 'reconcile_quota', 0, true);
    v_fixed := true;
  end if;

  return jsonb_build_object(
    'ok', true, 'fixed', v_fixed,
    'entitlements_available', v_truth,
    'credits_held', v_held,
    'snapshot_before', v_snap,
    'snapshot_after', greatest(v_truth - v_held, 0));
end $$;

-- =============================================================
-- 权限
-- =============================================================

-- release_token 不能让客户端读到，否则上面那道锁形同虚设。
-- Postgres 的 RLS 管不到列，得用列级 GRANT。
revoke select on credit_holds from anon, authenticated;
grant select (
  id, user_id, action_code, credits, status, idempotency_key,
  job_ref, fingerprint, expires_at, settled_at, released_at,
  release_reason, created_at
) on credit_holds to authenticated;

-- 逐个收回执行权再按需授权。
--
-- 必须把 anon / authenticated 显式写出来：Supabase 给 public schema 配了
-- 默认权限，新函数一建出来就已经授给这两个角色了，只 revoke from public
-- 收不掉那两笔独立的授权 —— 本地库上看着是拒绝的，线上照样能调。
revoke all on function billing_assert_owner(uuid) from public, anon, authenticated;
revoke all on function grant_credits(uuid, text, int, timestamptz, text, text)
  from public, anon, authenticated;
revoke all on function ensure_quota_counter(uuid) from public, anon, authenticated;
revoke all on function hold_credits(uuid, text, int, text, text, int, uuid)
  from public, anon, authenticated;
revoke all on function settle_hold(uuid, jsonb) from public, anon, authenticated;
revoke all on function release_hold(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function reconcile_quota(uuid) from public, anon, authenticated;

-- grant_credits 与 billing_assert_owner 只留给 service_role 与属主。
-- 前者能凭空造积分，后者是别的函数的内部件。
grant execute on function ensure_quota_counter(uuid) to authenticated;
grant execute on function hold_credits(uuid, text, int, text, text, int, uuid) to authenticated;
grant execute on function settle_hold(uuid, jsonb) to authenticated;
grant execute on function release_hold(uuid, text, uuid, jsonb) to authenticated;
grant execute on function reconcile_quota(uuid) to authenticated;
