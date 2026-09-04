-- =============================================================
-- Proofly · 28 悬挂清理
--
-- 上游：《商业化技术方案 v1.0》3.4 ·《商业化 C1》切片 C1.7
--
-- 进程崩溃、部署重启、Serverless 函数被掐，都会留下 status='held'
-- 但活早就没在跑的记录。用户那边的表现是：钱扣了，东西没有，
-- 而且永远不会回来 —— 这是计费系统最不能出的一种错。
--
-- 所以每笔预扣都带 expires_at（同步 5 分钟、异步 25 分钟），
-- 定时扫过去把过期的放掉。
-- =============================================================

-- -------------------------------------------------------------
-- 释放过期预扣
--
-- 只碰 expires_at 已过且仍是 held 的记录，所以授权给 anon 也无所谓：
-- 它能做的事情正是我们希望自动发生的事情。定时任务那一层还有
-- CRON_SECRET 挡着。
-- -------------------------------------------------------------
create or replace function sweep_expired_holds(p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from credit_holds
     where status = 'held' and expires_at < now()
     order by expires_at asc
     limit p_limit
  loop
    -- 逐条调 release_hold，而不是在这里直接改表：退款的正确写法只该
    -- 有一份。绕过它就等于多一条不写 usage_logs 的退款路径。
    -- p_release_token 传 null：定时任务没有 JWT，auth.uid() 为空，
    -- release_hold 里那道 token 校验对服务端不生效。
    begin
      perform release_hold(r.id, 'expired', null, '{}'::jsonb);
      n := n + 1;
    exception when others then
      raise notice 'sweep_expired_holds: % 释放失败 %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

-- -------------------------------------------------------------
-- 过期赠送出账
--
-- 赠送积分过期后余额要跟着降下来。快照不会自己变 —— reconcile_quota
-- 才是那个把 entitlements 的真相搬到快照上的人。这里只挑「手上有
-- 刚过期的赠送、且快照还没跟上」的用户去对账，不是全表扫。
-- -------------------------------------------------------------
-- 已出账标记。不动 credits_used —— 「发了 45、用了 30、剩 15 过期作废」
-- 是一条要留住的历史事实，把 credits_used 抹成 45 等于篡改账本。
alter table entitlements
  add column if not exists expired_settled_at timestamptz;

create or replace function sweep_expired_entitlements(p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct e.user_id
      from entitlements e
     where e.expires_at is not null
       and e.expires_at < now()
       and e.credits_used < e.credits_total
       and e.expired_settled_at is null
     limit p_limit
  loop
    perform reconcile_quota(r.user_id);
    -- 打标而不是改账：下次扫描不会再把同一批人捞出来，
    -- 而「过期时还剩多少没用」原样留在 credits_used 里。
    update entitlements
       set expired_settled_at = now(), updated_at = now()
     where user_id = r.user_id
       and expires_at is not null and expires_at < now()
       and expired_settled_at is null;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function sweep_expired_holds(int) from public, anon, authenticated;
revoke all on function sweep_expired_entitlements(int) from public, anon, authenticated;
grant execute on function sweep_expired_holds(int) to anon, authenticated;
grant execute on function sweep_expired_entitlements(int) to anon, authenticated;
