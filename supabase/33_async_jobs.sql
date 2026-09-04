-- =============================================================
-- Proofly · 33 异步作业
--
-- 上游：《商业化技术方案 v1.0》3.3 ·《商业化 C2》2.2
--
-- Step 7 的出题、Step 8 的深扫各自已经有一套「跑在 after() 里 + 进度
-- 落库 + 心跳」的机制，跑得好好的。这张表**不替换它们**，只补三件
-- 它们没有、而计费需要的东西：
--
--   hold_id     这次作业的预扣挂在哪笔账上
--   segments    分了几段、每段跑完没有 —— 断点续跑靠它
--   expires_at  超时保护。定时任务扫到过期的 running 就退分
--
-- 作业 id 直接用业务对象的 id（题包 id、扫描 id），省掉一层映射。
-- =============================================================

create table if not exists async_jobs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('interview_kit', 'health_deep_scan')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  -- 冗余一份，方便排查；真正的账在 job_holds 上
  hold_id uuid references credit_holds on delete set null,
  input_ref jsonb not null default '{}'::jsonb,
  -- [{ name, status: 'pending'|'done'|'failed', note }]
  segments jsonb not null default '[]'::jsonb,
  current_segment int not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  -- 超时保护。20 分钟没跑完就当它死了。
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists async_jobs_user_idx
  on async_jobs (user_id, status, created_at desc);
create index if not exists async_jobs_sweep_idx
  on async_jobs (expires_at) where status in ('queued', 'running');

drop trigger if exists set_updated_at on async_jobs;
create trigger set_updated_at before update on async_jobs
  for each row execute function set_updated_at();

-- 这张表不是钱，按常规 RLS 走：自己的行自己读写。
alter table async_jobs enable row level security;
drop policy if exists own_select on async_jobs;
drop policy if exists own_insert on async_jobs;
drop policy if exists own_update on async_jobs;
drop policy if exists own_delete on async_jobs;
create policy own_select on async_jobs for select using (user_id = auth.uid());
create policy own_insert on async_jobs for insert with check (user_id = auth.uid());
create policy own_update on async_jobs for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy own_delete on async_jobs for delete using (user_id = auth.uid());

-- -------------------------------------------------------------
-- 超时清理
--
-- 跑过头的作业标 failed 并退分。与 C1.7 的悬挂清理合并在同一个
-- billing_sweep() 里（C2 2.2「与 C1.7 的悬挂清理合并到同一个 Cron 端点」）。
--
-- 注意顺序：先退分再改状态。反过来的话，退分失败会留下一个
-- 「已经失败但钱还扣着」的作业，而那正是这套机制要消灭的东西。
-- -------------------------------------------------------------
create or replace function sweep_expired_jobs(p_limit int default 200)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from async_jobs
     where status in ('queued', 'running') and expires_at < now()
     order by expires_at asc
     limit p_limit
  loop
    begin
      perform release_job(r.id, 'expired');
      update async_jobs
         set status = 'failed',
             error_message = '跑了太久没有结果，已经中止，分数退回了',
             finished_at = now()
       where id = r.id;
      n := n + 1;
    exception when others then
      raise notice 'sweep_expired_jobs: % 处理失败 %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

revoke all on function sweep_expired_jobs(int) from public, anon, authenticated;
grant execute on function sweep_expired_jobs(int) to anon, authenticated;

-- billing_sweep 顺带把它扫了
create or replace function billing_sweep(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_released   int;
  v_reconciled int;
  v_jobs       int;
begin
  -- 作业超时排在最前面：它会产生新的待释放预扣，先处理再扫悬挂，
  -- 同一轮里就能把钱退干净，不用等下一个十分钟。
  v_jobs       := sweep_expired_jobs(least(p_limit, 200));
  v_released   := sweep_expired_holds(p_limit);
  v_reconciled := sweep_expired_entitlements(p_limit);
  return jsonb_build_object(
    'released', v_released,
    'reconciled', v_reconciled,
    'jobs_timed_out', v_jobs,
    'swept_at', now());
end $$;
