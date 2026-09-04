-- =============================================================
-- Proofly · 37 账号删除
--
-- 上游：《商业化 C3》切片 C3.6
--
-- 删 auth.users 一行，其余全部靠 on delete cascade 走掉 ——
-- 每张表的 user_id 都是 references auth.users on delete cascade，
-- 这是 Step 0 就定下的结构，现在正好兑现。
--
-- 为什么要 SECURITY DEFINER：客户端会话删不了 auth.users，那是
-- 管理接口的活，而这个项目里没有 service role key（也不许有）。
-- 函数以属主身份跑，并且只删 auth.uid() 自己那一行。
--
-- **存储桶里的文件要在调用这个函数之前删。** 数据库级联删得掉
-- storage.objects 的行，删不掉对象存储里的字节。
-- =============================================================

create or replace function delete_my_account(p_confirm_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_mail text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_SIGNED_IN');
  end if;

  select email into v_mail from auth.users where id = v_user;
  -- 二次确认：输入的邮箱必须与账号一致。删除不可恢复，
  -- 多这一步比事后道歉便宜得多。
  if lower(btrim(coalesce(p_confirm_email, ''))) is distinct from lower(coalesce(v_mail, '')) then
    return jsonb_build_object('ok', false, 'reason', 'EMAIL_MISMATCH');
  end if;

  -- 服务端专用的两张表不带 user_id 的外键级联，手动清。
  delete from job_holds where user_id = v_user;

  delete from auth.users where id = v_user;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function delete_my_account(text) from public, anon, authenticated;
grant execute on function delete_my_account(text) to authenticated;
