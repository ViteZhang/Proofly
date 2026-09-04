-- =============================================================
-- Proofly · 42 兑换码后台 A4：停用与作废
--
-- 上游：《兑换码管理后台施工方案 v1.0》3.4、8.2 二、切片 A4
--
-- 停用可逆，作废不可逆。这两件事在数据库这一层就要分开 ——
-- 界面上分不开是设计问题，函数上分不开是事故。
--
-- 「A4 不能拖太久」（方案 9 章）：码发出去就收不回，没有作废能力时，
-- 一旦码被转发到不该去的地方，你只能眼看着。
-- =============================================================

-- -------------------------------------------------------------
-- 单码停用 / 恢复
--
-- 理由必填。停用是可逆的，所以理由是这次操作留下的唯一痕迹 ——
-- 恢复之后，如果连「当时为什么停」都没记，这次操作就等于没发生过。
-- 恢复不要求理由：它是撤销，不是决策。
-- -------------------------------------------------------------
create or replace function admin_toggle_code(p_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c redeem_codes%rowtype;
begin
  perform admin_assert();

  select * into c from redeem_codes where id = p_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;

  -- 作废过的码不能靠「恢复」复活。不可逆就是不可逆，留一个后门给
  -- 自己，三个月后就会有人（你）走它。
  if c.status = 'revoked' then
    raise exception 'ALREADY_REVOKED' using errcode = '22023';
  end if;

  if c.status = 'active' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'BAD_REASON' using errcode = '22023';
    end if;
    update redeem_codes
       set status = 'disabled', status_reason = btrim(p_reason), status_changed_at = now()
     where id = p_id;
    return jsonb_build_object('status', 'disabled');
  end if;

  update redeem_codes
     set status = 'active', status_reason = null, status_changed_at = now()
   where id = p_id;
  return jsonb_build_object('status', 'active');
end $$;

-- -------------------------------------------------------------
-- 整批作废
--
-- 打字确认写在这里，不只写在弹窗里。方案 8.2 二把打字确认列为不可逆
-- 操作的硬要求 —— 而只在前端做的硬要求，是一句自我要求。
--
-- 已核销的积分不受影响、不会被追回：那些分已经在别人余额里了，收回
-- 去等于对已经履行的承诺反悔。作废管的是还没发生的事。
-- -------------------------------------------------------------
create or replace function admin_revoke_batch(
  p_id uuid,
  p_reason text,
  p_confirm_name text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare b redeem_batches%rowtype; v_killed int;
begin
  perform admin_assert();

  select * into b from redeem_batches where id = p_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;
  if b.revoked_at is not null then
    raise exception 'ALREADY_REVOKED' using errcode = '22023';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'BAD_REASON' using errcode = '22023';
  end if;
  if btrim(coalesce(p_confirm_name, '')) <> b.name then
    raise exception 'NAME_MISMATCH' using errcode = '22023';
  end if;

  update redeem_batches
     set revoked_at = now(), revoke_reason = btrim(p_reason)
   where id = p_id;

  -- 连同已经被兑过、但还有剩余次数的多次码一起作废：那些次数是「还没
  -- 发生的事」，属于作废该管的范围。已经发出去的分不动。
  with x as (
    update redeem_codes
       set status = 'revoked', status_reason = btrim(p_reason), status_changed_at = now()
     where batch_id = p_id and status <> 'revoked'
    returning 1)
  select count(*) into v_killed from x;

  return jsonb_build_object('revoked_codes', v_killed);
end $$;

revoke all on function admin_toggle_code(uuid, text) from public, anon, authenticated;
revoke all on function admin_revoke_batch(uuid, text, text) from public, anon, authenticated;
grant execute on function admin_toggle_code(uuid, text) to authenticated;
grant execute on function admin_revoke_batch(uuid, text, text) to authenticated;

-- -------------------------------------------------------------
-- 修 A2 留下的一个洞：admin_batch 返回的是裸的批次行
--
-- 列表接口（admin_batches）会算 codes / redeemed / available 三个计数，
-- 详情接口没算，但 TS 那边两处共用同一个类型 —— 于是详情页上是
-- 「undefined 张」和成本敞口「NaN」。类型对了，数据没对。
--
-- 这类洞类型系统抓不到：jsonb 到 TS 之间是一次 as，断言的是我以为的
-- 形状，不是函数真正返回的形状。所以这一层要靠端到端跑一遍看。
-- -------------------------------------------------------------
create or replace function admin_batch(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_b jsonb; v_c jsonb;
begin
  perform admin_assert();

  select to_jsonb(b) || jsonb_build_object(
           'creator', mask_email((select email from auth.users u where u.id = b.created_by)),
           'codes',    (select count(*) from redeem_codes c where c.batch_id = b.id),
           'redeemed', (select count(*) from redeem_codes c
                          join redeem_redemptions r on r.code_id = c.id
                         where c.batch_id = b.id),
           'available',(select count(*) from redeem_codes c
                         where c.batch_id = b.id
                           and code_display_status(c.status, c.used_count, c.max_uses,
                                                   c.code_expires_at) = 'available'))
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

revoke all on function admin_batch(uuid) from public, anon, authenticated;
grant execute on function admin_batch(uuid) to authenticated;
