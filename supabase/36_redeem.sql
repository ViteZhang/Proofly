-- =============================================================
-- Proofly · 36 兑换码核销
--
-- 上游：《商业化 C3》切片 C3.5
--
-- 客户端读不到 redeem_codes（C1 已经把权限全收了），所以校验与核销
-- 只能从这个函数走。
--
-- **核销必须原子。** 用单条
--   UPDATE ... WHERE used_count < max_uses
-- 靠行级锁定输赢。先 SELECT 看看还有没有名额、再 UPDATE 的写法，在
-- 两个人同时兑同一张 max_uses=1 的码时会双双通过检查，然后各拿一份。
--
-- 前面那次 SELECT 只用来分辨错误话术（码不对 / 过期 / 用过了），
-- 不作数 —— 作数的是那条 UPDATE。
--
-- ⚠ 这个文件已被 38–43 取代。兑换码从一张表扩成了 batches / codes /
--   redemptions 三张，这里建的函数在 38 里被 drop 掉。
--   保留它只为让 01→43 顺序重放时不断档，不要照着它改。
-- =============================================================

create or replace function redeem_code(p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c        redeem_codes%rowtype;
  v_code   text := upper(btrim(p_code));
  v_ent    uuid;
  v_after  int;
begin
  perform billing_assert_owner(p_user);
  perform ensure_quota_counter(p_user);

  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  select * into c from redeem_codes where code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  end if;
  if exists (select 1 from redeem_records where user_id = p_user and code = v_code) then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_USED_BY_ME');
  end if;

  -- 这一条才是作数的
  update redeem_codes
     set used_count = used_count + 1
   where code = v_code and used_count < max_uses;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'USED_UP');
  end if;

  -- 兑换视同购买：永不过期。
  v_ent := grant_credits(p_user, 'redeem', c.credits, null, '兑换码 ' || v_code);

  begin
    insert into redeem_records (user_id, code, entitlement_id)
    values (p_user, v_code, v_ent);
  exception when unique_violation then
    -- 同一个人并发兑同一张码：名额已经被自己那条 UPDATE 占掉了，
    -- 这里把它退回去，不能让一个人靠并发拿两份。
    update redeem_codes set used_count = greatest(used_count - 1, 0) where code = v_code;
    delete from entitlements where id = v_ent;
    update quota_counters
       set credits_available = greatest(credits_available - c.credits, 0)
     where user_id = p_user;
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_USED_BY_ME');
  end;

  select credits_available into v_after from quota_counters where user_id = p_user;

  return jsonb_build_object(
    'ok', true, 'credits', c.credits, 'balance_after', v_after, 'code', v_code);
end $$;

revoke all on function redeem_code(uuid, text) from public, anon, authenticated;
grant execute on function redeem_code(uuid, text) to authenticated;

-- 追溯用：这张码发给了谁、对应哪个包、什么时候用的。
-- 三个月后有人说「我付了钱没收到码」，靠 note 与 redeem_records 查。
create index if not exists redeem_records_code_idx on redeem_records (code);
