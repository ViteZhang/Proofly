-- =============================================================
-- Proofly · 43 兑换码后台 A5：限流与异常看板
--
-- 上游：《兑换码管理后台施工方案 v1.0》7.2、8.4、切片 A5
--
-- 不做 IP 自动封禁。内测用户可能同办公室、同 VPN 出口，误伤成本远高
-- 于收益。异常看板报给你，你人工判断 —— 四项判定全部只报不动作。
-- =============================================================

-- -------------------------------------------------------------
-- 每一次兑换尝试都记一笔
--
-- 成功的那些 redeem_redemptions 里已经有了，这张表存在是为了失败的
-- 那些：没有失败记录，「兑换失败集中」这条判定就无从谈起，而那正是
-- 枚举攻击唯一会留下的痕迹。
-- -------------------------------------------------------------
create table if not exists redeem_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  ip_hash text,
  -- 试过的码。归一化之后的，用来回答「他是在猜还是打错了」
  code text,
  ok boolean not null,
  reason text,
  at timestamptz not null default now()
);

create index if not exists redeem_attempts_user_idx on redeem_attempts (user_id, at desc);
create index if not exists redeem_attempts_ip_idx
  on redeem_attempts (ip_hash, at desc) where ip_hash is not null;

alter table redeem_attempts enable row level security;
revoke all on redeem_attempts from anon, authenticated;

-- -------------------------------------------------------------
-- 核销本体挪进 _core，外层只管限流与留痕
--
-- 拆开是因为原来每一条 return 都要顺手写一次日志 —— 七八个出口，漏
-- 一个就少一条记录，而少的偏偏会是失败那条（成功的路径只有一条，最
-- 不容易漏）。
-- -------------------------------------------------------------
create or replace function redeem_code_core(
  p_user uuid, p_code text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c        redeem_codes%rowtype;
  b        redeem_batches%rowtype;
  v_code   text := normalize_redeem_code(p_code);
  v_email  text;
  v_exp    timestamptz;
  v_ent    uuid;
  v_red    uuid;
  v_after  int;
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'UNUSABLE');
  end if;

  -- 先按规范形状找，找不到再按原样找。
  --
  -- 归一化只认 8 位码体，手工用 SQL 插进来的码不一定是那个形状（A0
  -- 验收明说要支持手工插码这条路径）。只按归一化后的串去查，那种码
  -- 会永远返回「这张码用不了」，而且查不出为什么 —— 库里明明有。
  select * into c from redeem_codes where code = v_code;
  if not found then
    select * into c from redeem_codes where code = upper(btrim(p_code));
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'UNUSABLE');
  end if;
  if c.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'UNUSABLE');
  end if;

  select * into b from redeem_batches where id = c.batch_id;
  if b.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'UNUSABLE');
  end if;

  if exists (select 1 from redeem_redemptions
              where code_id = c.id and user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_USED_BY_ME');
  end if;
  if c.code_expires_at is not null and c.code_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  end if;

  if c.bound_email is not null then
    select email into v_email from auth.users where id = p_user;
    if lower(coalesce(v_email, '')) <> lower(c.bound_email) then
      return jsonb_build_object('ok', false, 'reason', 'EMAIL_MISMATCH');
    end if;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'USED_UP');
  end if;

  v_exp := case
             when b.credit_valid_days is null then null
             else now() + make_interval(days => b.credit_valid_days)
           end;

  begin
    insert into redeem_redemptions
      (code_id, user_id, credits, credit_expires_at, ip_hash)
    values (c.id, p_user, c.credits, v_exp, p_ip_hash)
    returning id into v_red;

    update redeem_codes
       set used_count = used_count + 1
     where id = c.id
       and status = 'active'
       and (max_uses is null or used_count < max_uses)
       and (code_expires_at is null or code_expires_at > now());
    if not found then
      raise exception 'USED_UP' using errcode = '45001';
    end if;

    v_ent := grant_credits(p_user, 'redeem', c.credits, v_exp, '兑换码 ' || c.code);

    select credits_available into v_after from quota_counters where user_id = p_user;
    update redeem_redemptions
       set entitlement_id = v_ent, balance_after = v_after
     where id = v_red;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'ALREADY_USED_BY_ME');
    when sqlstate '45001' then
      return jsonb_build_object('ok', false, 'reason', 'USED_UP');
  end;

  return jsonb_build_object(
    'ok', true, 'credits', c.credits, 'balance_after', v_after,
    'expires_at', v_exp, 'code', c.code);
end $$;

-- -------------------------------------------------------------
-- 限流（方案 7.2）
--
--   失败 5 次/小时 → 锁 1 小时
--   成功 10 次/天  → 当天不再受理（正常用户不会超过 2 次）
--
-- 「锁 1 小时」用滚动窗口实现，不落锁定状态：最近一小时内失败满 5 次
-- 就拒，失败记录老化出窗口自然解锁。少一张状态表，也少一处会和事实
-- 对不上的字段。
-- -------------------------------------------------------------
create or replace function redeem_code(
  p_user uuid, p_code text, p_ip_hash text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb; v_fail int; v_ok int;
begin
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  select count(*) into v_fail from redeem_attempts
   where user_id = p_user and not ok and at > now() - interval '1 hour';
  if v_fail >= 5 then
    -- 触顶本身也记一笔，否则看板上只看得到前 5 次，看不出他还在敲
    insert into redeem_attempts (user_id, ip_hash, code, ok, reason)
    values (p_user, p_ip_hash, normalize_redeem_code(p_code), false, 'RATE_LOCKED');
    return jsonb_build_object('ok', false, 'reason', 'RATE_LOCKED');
  end if;

  select count(*) into v_ok from redeem_attempts
   where user_id = p_user and ok and at > now() - interval '1 day';
  if v_ok >= 10 then
    insert into redeem_attempts (user_id, ip_hash, code, ok, reason)
    values (p_user, p_ip_hash, normalize_redeem_code(p_code), false, 'RATE_DAILY');
    return jsonb_build_object('ok', false, 'reason', 'RATE_DAILY');
  end if;

  v_out := redeem_code_core(p_user, p_code, p_ip_hash);

  insert into redeem_attempts (user_id, ip_hash, code, ok, reason)
  values (p_user, p_ip_hash, normalize_redeem_code(p_code),
          coalesce((v_out->>'ok')::boolean, false), v_out->>'reason');

  return v_out;
end $$;

revoke all on function redeem_code_core(uuid, text, text) from public, anon, authenticated;
revoke all on function redeem_code(uuid, text, text) from public, anon, authenticated;
grant execute on function redeem_code(uuid, text, text) to authenticated;

-- -------------------------------------------------------------
-- 异常看板的四项（方案 8.4）
--
-- 三项为零也照样返回，不折叠、不隐藏。异常看板最常见的失败模式是
-- 「平时空白 → 你不知道它还在跑 → 真出事时你以为又是空的」。把判定
-- 规则和当前值一起摆着，这块地方才可信。
--
-- 没有「标记已处理」。四项全是**当下算出来的条件**，不是待办事项：
-- 失败集中一小时后自己过期，其余三项修好就归零。给它加一个 ack 状态，
-- 唯一的效果是把一个还成立的条件藏起来 —— 那正是上面那段话要防的事。
-- -------------------------------------------------------------
create or replace function admin_anomalies()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fail jsonb; v_expiring jsonb; v_orphan jsonb; v_heavy jsonb;
begin
  perform admin_assert();

  -- ① 兑换失败集中：同一账号或 IP 1 小时内失败 ≥5 次
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_fail from (
    select 'user' as scope, mask_email(u.email) as who, count(*) as n,
           min(a.at) as since, max(a.at) as last_at,
           count(*) filter (where a.reason = 'UNUSABLE') as unusable
      from redeem_attempts a left join auth.users u on u.id = a.user_id
     where not a.ok and a.at > now() - interval '1 hour'
     group by a.user_id, u.email having count(*) >= 5
    union all
    select 'ip', left(a.ip_hash, 8) || '…', count(*),
           min(a.at), max(a.at),
           count(*) filter (where a.reason = 'UNUSABLE')
      from redeem_attempts a
     where not a.ok and a.ip_hash is not null and a.at > now() - interval '1 hour'
     group by a.ip_hash having count(*) >= 5
  ) x;

  -- ② 批次临期未领完：剩余 >30% 且 7 天内到期
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_expiring from (
    select b.id, b.name, b.code_expires_at,
           (select count(*) from redeem_codes c
             where c.batch_id = b.id
               and code_display_status(c.status, c.used_count, c.max_uses,
                                       c.code_expires_at) = 'available') as available,
           b.code_count
      from redeem_batches b
     where b.revoked_at is null
       and b.code_expires_at is not null
       and b.code_expires_at between now() and now() + interval '7 days'
       and (select count(*) from redeem_codes c
             where c.batch_id = b.id
               and code_display_status(c.status, c.used_count, c.max_uses,
                                       c.code_expires_at) = 'available')
           > b.code_count * 0.3
  ) x;

  -- ③ 孤儿额度 —— 这套设计的自检项
  --
  -- 两种都算：一是 source='redeem' 但找不到核销记录，二是**任何一行
  -- source='adjust'**。后者不是漏洞，是那个本该被删掉的动作本身 ——
  -- 「额度只有兑换一个入口」如果成立，手工调整就一行都不该有。
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_orphan from (
    select e.id, e.source, e.credits_total, e.note, e.created_at,
           mask_email(u.email) as who
      from entitlements e left join auth.users u on u.id = e.user_id
     where (e.source = 'redeem'
            and not exists (select 1 from redeem_redemptions r
                             where r.entitlement_id = e.id))
        or e.source = 'adjust'
     order by e.created_at desc limit 50
  ) x;

  -- ④ 单账号异常兑换：累计 >3 张
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_heavy from (
    select mask_email(u.email) as who, count(*) as n,
           coalesce(sum(r.credits), 0) as credits
      from redeem_redemptions r left join auth.users u on u.id = r.user_id
     group by r.user_id, u.email having count(*) > 3
  ) x;

  return jsonb_build_object(
    'fail_burst', v_fail,
    'expiring',   v_expiring,
    'orphan',     v_orphan,
    'heavy',      v_heavy,
    'total', jsonb_array_length(v_fail) + jsonb_array_length(v_expiring)
             + jsonb_array_length(v_orphan) + jsonb_array_length(v_heavy));
end $$;

revoke all on function admin_anomalies() from public, anon, authenticated;
grant execute on function admin_anomalies() to authenticated;
