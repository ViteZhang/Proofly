-- =============================================================
-- Proofly · 41 兑换码后台 A3：生成批次
--
-- 上游：《兑换码管理后台施工方案 v1.0》7.1、7.3、切片 A3
--
-- 码在 Node 侧生成（src/lib/redeem/code.ts），这里只负责落库。
-- 不在 SQL 里再实现一遍字母表与拒绝采样 —— 两份实现迟早会分叉，而
-- 分叉的那一天你不会知道，因为两边都「能跑」。
--
-- 单批上限 200 张写死在这里，不只写在表单上：表单挡的是手滑，这里挡
-- 的是绕过表单的调用。
-- =============================================================

create or replace function admin_create_batch(
  p_name              text,
  p_purpose           text,
  p_reason            text,
  p_credits_each      int,
  p_max_uses_each     int,
  p_code_expires_at   timestamptz,
  p_credit_valid_days int,
  p_bound_email       text,
  p_codes             text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := admin_assert();
  v_n     int  := coalesce(array_length(p_codes, 1), 0);
  v_batch uuid;
begin
  if v_n < 1 or v_n > 200 then
    raise exception 'BAD_COUNT' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'BAD_NAME' using errcode = '22023';
  end if;
  -- 发放理由是溯源链最上游的一环。不给默认值，也不允许空 ——
  -- 三个月后要靠这段话回答「这批分为什么发」。
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'BAD_REASON' using errcode = '22023';
  end if;
  if p_credits_each is null or p_credits_each < 1 then
    raise exception 'BAD_CREDITS' using errcode = '22023';
  end if;

  insert into redeem_batches
    (name, purpose, reason, credits_each, max_uses_each, code_expires_at,
     credit_valid_days, bound_email, code_count, created_by)
  values
    (btrim(p_name), p_purpose, btrim(p_reason), p_credits_each, p_max_uses_each,
     p_code_expires_at, p_credit_valid_days, nullif(btrim(coalesce(p_bound_email, '')), ''),
     v_n, v_admin)
  returning id into v_batch;

  -- 面额、次数、有效期、定向邮箱全部冗余到码上，生成即冻结。
  -- 之后改批次不影响已经发出去的码（方案 3.3）。
  insert into redeem_codes
    (batch_id, code, credits, max_uses, code_expires_at, bound_email)
  select v_batch, c, p_credits_each, p_max_uses_each, p_code_expires_at,
         nullif(btrim(coalesce(p_bound_email, '')), '')
    from unnest(p_codes) as c;

  return jsonb_build_object('batch_id', v_batch, 'count', v_n);
end $$;

revoke all on function admin_create_batch(text, text, text, int, int, timestamptz, int, text, text[])
  from public, anon, authenticated;
grant execute on function admin_create_batch(text, text, text, int, int, timestamptz, int, text, text[])
  to authenticated;

-- -------------------------------------------------------------
-- 导出用：一个批次里还没被兑换的明文码
--
-- 已核销的不在里面。后台里它们是打码显示的，导出如果把明文带出去，
-- 那道行为设计就等于没有。
-- -------------------------------------------------------------
create or replace function admin_batch_codes(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform admin_assert();
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', c.code, 'credits', c.credits,
           'status', code_display_status(c.status, c.used_count, c.max_uses, c.code_expires_at),
           'expires_at', c.code_expires_at)
         order by c.created_at, c.code), '[]'::jsonb) into v
    from redeem_codes c
   where c.batch_id = p_id
     and not exists (select 1 from redeem_redemptions r where r.code_id = c.id);
  return v;
end $$;

revoke all on function admin_batch_codes(uuid) from public, anon, authenticated;
grant execute on function admin_batch_codes(uuid) to authenticated;
