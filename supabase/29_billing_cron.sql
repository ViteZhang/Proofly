-- =============================================================
-- Proofly · 29 悬挂清理改用 pg_cron
--
-- 上游：《商业化 C1》切片 C1.7 的调度部分
--
-- 原方案是 Vercel Cron 每 10 分钟打一次 /api/cron/billing-sweep。
-- 换掉的原因很实在：Vercel Hobby 的定时任务每天只能跑一次。
-- 同一个崩溃，在分钟级调度下用户等 15 分钟拿回积分，在每天一次的
-- 调度下要等最多 24 小时 —— 那 24 小时里，产品在用户眼里就是
-- 「扣了钱不干活」。
--
-- 顺带少一个会挂的环节：清理逻辑本来就全在 SQL 里，绕开 HTTP、
-- 绕开口令、绕开函数冷启动。Serverless 函数自己失败一次，
-- 预扣就多悬挂一个周期。
-- =============================================================

create extension if not exists pg_cron;

-- -------------------------------------------------------------
-- 一次完整的清理
--
-- 定时任务和手动触发的接口都调它 —— 「一次清理都做了什么」
-- 只该有一份定义。
-- -------------------------------------------------------------
create or replace function billing_sweep(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_released   int;
  v_reconciled int;
begin
  v_released   := sweep_expired_holds(p_limit);
  v_reconciled := sweep_expired_entitlements(p_limit);
  return jsonb_build_object(
    'released', v_released,
    'reconciled', v_reconciled,
    'swept_at', now());
end $$;

revoke all on function billing_sweep(int) from public, anon, authenticated;
grant execute on function billing_sweep(int) to anon, authenticated;

-- -------------------------------------------------------------
-- 每 10 分钟
--
-- 重复执行这个迁移不会排出两个任务：先撤再排。
-- 运行记录在 cron.job_run_details，出问题去那儿看。
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'billing-sweep') then
    perform cron.unschedule('billing-sweep');
  end if;
  perform cron.schedule('billing-sweep', '*/10 * * * *', 'select billing_sweep(500)');
end $$;
