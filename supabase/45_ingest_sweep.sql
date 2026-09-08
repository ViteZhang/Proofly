-- =============================================================
-- Proofly · 45 抽取作业的超时清理
--
-- 起因：线上一条 2026-08-26 的上传作业在 extracting 里挂了 13 天。
--
-- async_jobs（面试出题、体检深扫）一直有 sweep_expired_jobs：跑过头就标
-- failed、退分、写一句人话。ingest_jobs（导入 + 随手记）没有对应的东西，
-- 只有它名下的**预扣**会被 sweep_expired_holds 扫走。于是出现最难查的状态：
-- 钱退了，作业还标着「正在抽取」。
--
-- 界面看到的就是一个永远 0/1 的进度条，加一个点了也没用的「再接着抽」。
--
-- 判死看 updated_at，不看 created_at 也不单看 heartbeat_at：
--   · created_at 只会随时间流逝，跟作业死没死没关系
--   · heartbeat_at 会被管道主动往回拨（时间不够、把剩下的留给下一次调用），
--     单看它会把正在正常续跑的作业误杀
-- updated_at 只在真的写了什么的时候才动，最贴近「这个作业还有人管吗」。
-- =============================================================

-- 多久没动静就算死了。
--
-- 要明显大于「一次函数调用 + 界面发现并认领」的时间：
-- 一次调用最多 300 秒，界面判定断线要 6 分钟，认领后又是一轮。
-- 取 30 分钟，宁可晚一点收，也别把还在续跑的作业掐了。
create or replace function sweep_stale_ingest_jobs(p_limit int default 200)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from ingest_jobs
     where status = 'extracting'
       and coalesce(updated_at, created_at) < now() - interval '30 minutes'
     order by coalesce(updated_at, created_at) asc
     limit p_limit
  loop
    begin
      -- 先退分再改状态。反过来的话，退分失败会留下一个
      -- 「已经失败但钱还扣着」的作业，而那正是这套机制要消灭的东西。
      perform release_job(r.id, 'expired');
      update ingest_jobs
         set status = 'discarded',
             progress_stage = 'finishing',
             error_message = '这次抽取跑了太久没有结果，已经中止，分数退回了。'
                             || '文档还在，可以再传一次；内容很长的话拆成几份会顺一些。',
             updated_at = now()
       where id = r.id;
      n := n + 1;
    exception when others then
      raise notice 'sweep_stale_ingest_jobs: % 处理失败 %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

revoke all on function sweep_stale_ingest_jobs(int) from public, anon, authenticated;
grant execute on function sweep_stale_ingest_jobs(int) to anon, authenticated;

-- -------------------------------------------------------------
-- 挂进同一趟清理
--
-- 「一次清理都做了什么」只该有一份定义（见 29_billing_cron.sql）。
-- 每 10 分钟的那个 cron 任务不用动，它调的就是这个函数。
-- -------------------------------------------------------------
create or replace function billing_sweep(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_released   int;
  v_reconciled int;
  v_ingest     int;
begin
  v_released   := sweep_expired_holds(p_limit);
  v_reconciled := sweep_expired_entitlements(p_limit);
  v_ingest     := sweep_stale_ingest_jobs(p_limit);
  return jsonb_build_object(
    'released', v_released,
    'reconciled', v_reconciled,
    'ingest_stale', v_ingest,
    'swept_at', now());
end $$;

revoke all on function billing_sweep(int) from public, anon, authenticated;
grant execute on function billing_sweep(int) to anon, authenticated;
