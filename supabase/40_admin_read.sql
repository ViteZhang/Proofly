-- =============================================================
-- Proofly · 40 兑换码后台 A2：只读接口
--
-- 上游：《兑换码管理后台施工方案 v1.0》第 7、8 章、切片 A2
--
-- 四张表对客户端零权限，所以后台每一行数据都得从这些函数出来。
-- 每个函数第一句都是 admin_assert() —— 方案 6.2 要求二：不依赖中间件，
-- 每个接口独立校验。中间件是第一道，这是第二道；中间件的 matcher 配错
-- 过一次就全开了，那种错误不该是致命的。
-- =============================================================

-- -------------------------------------------------------------
-- 顺带补一列：核销当时的余额
--
-- 原型里核销流水有「当时余额」一列。它是冗余的，但它让你能在不重放
-- 全部流水的情况下，一眼看出某次发放前后对不对得上。
--
-- 只有在兑换发生的那一刻才知道这个数，事后重建不出来（预扣、退回都
-- 会动余额，而它们不在核销记录上）。所以要么当场记下，要么这一列就
-- 只能是猜的 —— 猜出来的数字比不显示更伤。
-- -------------------------------------------------------------
alter table redeem_redemptions add column if not exists balance_after int;

create or replace function redeem_code(
  p_user uuid,
  p_code text,
  p_ip_hash text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'UNUSABLE');
  end if;

  select * into c from redeem_codes where code = v_code;
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

    v_ent := grant_credits(p_user, 'redeem', c.credits, v_exp,
                           '兑换码 ' || c.code);

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
    'ok', true,
    'credits', c.credits,
    'balance_after', v_after,
    'expires_at', v_exp,
    'code', c.code);
end $$;

revoke all on function redeem_code(uuid, text, text) from public, anon, authenticated;
grant execute on function redeem_code(uuid, text, text) to authenticated;

-- -------------------------------------------------------------
-- 五种展示态 = 三个存储态 + 两个派生态（方案 3.4）
--
-- 「已用完」「已过期」不落库。落库就要定时任务去刷，而定时任务漏跑会
-- 让状态和事实对不上 —— 一个讲「不编造」的产品，内部数据也不该有靠猜
-- 维护的字段。
-- -------------------------------------------------------------
create or replace function code_display_status(
  p_status text, p_used int, p_max int, p_expires timestamptz
) returns text language sql stable set search_path = public as $$
  select case
    when p_status = 'revoked'                              then 'revoked'
    when p_status = 'disabled'                             then 'disabled'
    when p_max is not null and p_used >= p_max             then 'used_up'
    when p_expires is not null and p_expires <= now()      then 'expired'
    else 'available'
  end;
$$;

-- 已核销的码与账号在后台里打码显示。
-- 这不是安全措施（库里本来就是明文），是行为设计：让「回来抄一遍」
-- 这件事足够不顺手，你就会在生成那一屏当场把码存到该存的地方。
create or replace function mask_email(p_email text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_email is null then '（账号已注销）'
    when position('@' in p_email) < 2 then '***'
    else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email))
  end;
$$;

-- -------------------------------------------------------------
-- 8.3 概览的四项数字
--
-- 不放「累计发码量」。那是一个只会增长、看了不产生任何动作的数字。
-- 「待处理异常」在 A5 里补，这一片先不给 —— 检测还没上线就先摆一个
-- 「0 条」出来，是最坏的一种假象。
-- -------------------------------------------------------------
create or replace function admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform admin_assert();

  select jsonb_build_object(
    'codes_outstanding', (
      select count(*) from redeem_codes c
       where code_display_status(c.status, c.used_count, c.max_uses,
                                 c.code_expires_at) = 'available'),
    'redeemed_count', (select count(*) from redeem_redemptions),
    'redeemed_users', (select count(distinct user_id) from redeem_redemptions),
    'credits_issued', (select coalesce(sum(credits), 0) from redeem_redemptions),
    'recent', coalesce((
      select jsonb_agg(r order by r.redeemed_at desc)
        from (
          select rr.id, rr.redeemed_at, rr.credits,
                 mask_email(u.email) as email,
                 c.code, b.name as batch_name, b.id as batch_id
            from redeem_redemptions rr
            join redeem_codes c   on c.id = rr.code_id
            join redeem_batches b on b.id = c.batch_id
            left join auth.users u on u.id = rr.user_id
           where rr.redeemed_at > now() - interval '7 days'
           order by rr.redeemed_at desc
           limit 8
        ) r), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- -------------------------------------------------------------
-- 批次列表
-- -------------------------------------------------------------
create or replace function admin_batches(
  p_purpose text default null,
  p_q text default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform admin_assert();

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into v
    from (
      select b.id, b.name, b.purpose, b.reason, b.credits_each, b.max_uses_each,
             b.code_expires_at, b.credit_valid_days, b.bound_email, b.code_count,
             b.created_at, b.revoked_at, b.revoke_reason,
             (select count(*) from redeem_codes c where c.batch_id = b.id) as codes,
             (select count(*) from redeem_codes c
               join redeem_redemptions r on r.code_id = c.id
              where c.batch_id = b.id) as redeemed,
             (select count(*) from redeem_codes c
               where c.batch_id = b.id
                 and code_display_status(c.status, c.used_count, c.max_uses,
                                         c.code_expires_at) = 'available') as available
        from redeem_batches b
       where (p_purpose is null or b.purpose = p_purpose)
         and (p_q is null or btrim(p_q) = '' or b.name ilike '%' || btrim(p_q) || '%'
              or exists (select 1 from redeem_codes c
                          where c.batch_id = b.id
                            and c.code ilike '%' || upper(btrim(p_q)) || '%'))
    ) x;
  return v;
end $$;

-- -------------------------------------------------------------
-- 批次详情 + 码表
-- -------------------------------------------------------------
create or replace function admin_batch(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_b jsonb; v_c jsonb;
begin
  perform admin_assert();

  select to_jsonb(b) || jsonb_build_object(
           'creator', mask_email((select email from auth.users u where u.id = b.created_by)))
    into v_b
    from redeem_batches b where b.id = p_id;
  if v_b is null then
    return null;
  end if;

  select coalesce(jsonb_agg(x order by x.created_at, x.code), '[]'::jsonb) into v_c
    from (
      select c.id, c.code, c.credits, c.max_uses, c.used_count,
             c.status, c.status_reason, c.code_expires_at, c.bound_email, c.created_at,
             code_display_status(c.status, c.used_count, c.max_uses,
                                 c.code_expires_at) as display,
             (select jsonb_agg(jsonb_build_object(
                       'email', mask_email(u.email),
                       'at', r.redeemed_at)
                     order by r.redeemed_at)
                from redeem_redemptions r
                left join auth.users u on u.id = r.user_id
               where r.code_id = c.id) as redemptions
        from redeem_codes c where c.batch_id = p_id
    ) x;

  return jsonb_build_object('batch', v_b, 'codes', v_c);
end $$;

-- -------------------------------------------------------------
-- 核销流水
--
-- 「每一分积分的来源」。这张表如果和 entitlements 的增量对不上，说明
-- 代码里有一条你不知道的写额度路径 —— A5 的孤儿额度检测就是查这个。
-- -------------------------------------------------------------
create or replace function admin_redemptions(
  p_purpose text default null,
  p_q text default null,
  p_limit int default 100
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform admin_assert();

  select coalesce(jsonb_agg(x order by x.redeemed_at desc), '[]'::jsonb) into v
    from (
      select r.id, r.redeemed_at, r.credits, r.credit_expires_at, r.balance_after,
             mask_email(u.email) as email,
             c.code, c.id as code_id,
             b.id as batch_id, b.name as batch_name, b.purpose
        from redeem_redemptions r
        join redeem_codes c   on c.id = r.code_id
        join redeem_batches b on b.id = c.batch_id
        left join auth.users u on u.id = r.user_id
       where (p_purpose is null or b.purpose = p_purpose)
         and (p_q is null or btrim(p_q) = ''
              or c.code ilike '%' || upper(btrim(p_q)) || '%'
              or u.email ilike '%' || btrim(p_q) || '%'
              or b.name ilike '%' || btrim(p_q) || '%')
       order by r.redeemed_at desc
       limit greatest(p_limit, 1)
    ) x;
  return v;
end $$;

revoke all on function code_display_status(text, int, int, timestamptz)
  from public, anon, authenticated;
revoke all on function mask_email(text) from public, anon, authenticated;
revoke all on function admin_overview() from public, anon, authenticated;
revoke all on function admin_batches(text, text) from public, anon, authenticated;
revoke all on function admin_batch(uuid) from public, anon, authenticated;
revoke all on function admin_redemptions(text, text, int) from public, anon, authenticated;

-- 四个 admin_* 开给 authenticated，但它们自己第一句就是 admin_assert()。
-- 不是管理员调用只会拿到 NOT_ADMIN。
grant execute on function admin_overview() to authenticated;
grant execute on function admin_batches(text, text) to authenticated;
grant execute on function admin_batch(uuid) to authenticated;
grant execute on function admin_redemptions(text, text, int) to authenticated;
