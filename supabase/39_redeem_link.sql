-- =============================================================
-- Proofly · 39 兑换码后台 A1：兑换链路
--
-- 上游：《兑换码管理后台施工方案 v1.0》约束二、第 5 章、切片 A1
--
-- 施工顺序上 A1 必须在 A2 之前：后台是操作兑换链路的界面，兑换链路
-- 才是真相。先做后台，得到的是一个能生成一堆码、但没人验证过这些码
-- 能不能正确入账的系统 —— 而并发超发、重复兑换这类问题只有在真实
-- 兑换里才暴露。
--
-- ── 约束二 · 两道防线，缺一不可 ──
--
--   条件 UPDATE   挡「多人同时抢同一张多次码，抢超了」
--   唯一索引      挡「同一个人并发点两次，领了两份」
--
-- 只有条件 UPDATE 时，同一用户并发能领两次（两条 insert 都过，两条
-- update 也都过，因为 used_count 确实还没满）。只有唯一索引时，不同
-- 用户能把 max_uses 抢穿。
--
-- 顺序是先插核销记录再更新码：两种顺序都对（同一事务），但先插能让
-- 「重复兑换」这个最高频的失败场景在第一步就返回，不去动 redeem_codes
-- 的行锁。
-- =============================================================

-- -------------------------------------------------------------
-- 失败话术的取舍（方案 5.2）
--
-- 码是持有即生效的凭证，理论上所有失败都该返回同一句话，免得错误信息
-- 变成「这张码存不存在」的探针。但那会让正常用户在「我明明领过了」时
-- 完全无从判断。
--
-- 取舍：对持有者可自证的状态给明确文案，其余归并。
--   ALREADY_USED_BY_ME  你自己用过 —— 你查余额就能证实
--   EXPIRED / USED_UP   码确实存在，只是不能用了
--   EMAIL_MISMATCH      定向码，持有者知道自己的邮箱
--   UNUSABLE            不存在 / 已停用 / 已作废 —— 三种归并成一句
--
-- 最后一行是关键：攻击者分不出「猜错了」和「猜对了但被停用」。
-- -------------------------------------------------------------
-- -------------------------------------------------------------
-- 输入归一化
--
-- 用户会小写打、会漏连字符、会从聊天记录里连着空格一起复制。这些都
-- 该兑得动 —— 让人重打一遍码，是把系统的宽容度当成用户的义务。
--
-- 前端也做一遍（src/lib/redeem/code.ts）。两边都做不是重复：前端那遍
-- 是为了输入框里就能看见规范形式，这一遍是为了任何绕过前端的调用方
-- 都不会因为少了两个连字符而拿到「这张码用不了」。
--
-- 靠长度判断有没有前缀，不靠 left(raw,2)='PF'：字母表里有 P 也有 F，
-- 码体本身就可能以 PF 开头。带前缀 10 位，不带 8 位。
-- -------------------------------------------------------------
create or replace function normalize_redeem_code(p_code text)
returns text language sql immutable set search_path = public as $$
  select case
           when b.body = ''          then ''
           when length(b.body) = 8   then 'PF-' || substr(b.body, 1, 4) || '-' || substr(b.body, 5, 4)
           else 'PF-' || b.body
         end
    from (select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') as raw) r
    cross join lateral (
      select case when length(r.raw) = 10 and left(r.raw, 2) = 'PF'
                  then substr(r.raw, 3) else r.raw end as body
    ) b;
$$;

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

  -- 这一段 select 只用来分辨话术，不作数。作数的是下面那条 UPDATE。
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

  -- 定向码：只有这个邮箱能兑，转发无效
  if c.bound_email is not null then
    select email into v_email from auth.users where id = p_user;
    if lower(coalesce(v_email, '')) <> lower(c.bound_email) then
      return jsonb_build_object('ok', false, 'reason', 'EMAIL_MISMATCH');
    end if;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'USED_UP');
  end if;

  -- 积分有效期在这一刻算定，之后改批次不影响已发放的（方案 3.3）
  v_exp := case
             when b.credit_valid_days is null then null
             else now() + make_interval(days => b.credit_valid_days)
           end;

  -- ── 这个 begin…exception 块是一个子事务：里面任何一步失败，
  --    上面几步一起回滚。所以「插了核销记录但没扣码」不可能存在。
  begin
    insert into redeem_redemptions
      (code_id, user_id, credits, credit_expires_at, ip_hash)
    values (c.id, p_user, c.credits, v_exp, p_ip_hash)
    returning id into v_red;

    -- 防线一。判断条件全部写进 WHERE，由数据库的行锁定输赢。
    -- 影响行数为 0 即为不可兑换 —— 不需要也不应该再去 SELECT 确认。
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
    update redeem_redemptions set entitlement_id = v_ent where id = v_red;
  exception
    -- 防线二。同一个人并发点两次，第二条 insert 撞唯一索引。
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'ALREADY_USED_BY_ME');
    when sqlstate '45001' then
      return jsonb_build_object('ok', false, 'reason', 'USED_UP');
  end;

  select credits_available into v_after from quota_counters where user_id = p_user;

  return jsonb_build_object(
    'ok', true,
    'credits', c.credits,
    'balance_after', v_after,
    'expires_at', v_exp,
    'code', c.code);
end $$;

revoke all on function normalize_redeem_code(text) from public, anon, authenticated;
revoke all on function redeem_code(uuid, text, text) from public, anon, authenticated;
grant execute on function redeem_code(uuid, text, text) to authenticated;
