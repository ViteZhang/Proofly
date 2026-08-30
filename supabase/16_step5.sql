-- =============================================================
-- Proofly · 16 Step 5 补列（行动清单）
-- Step 0 建表时 tasks / task_targets 只有骨架，第三节 5.1 要求的字段补齐。
-- 全部 if not exists，重复执行安全。
-- =============================================================

-- ---- tasks ----

alter table tasks
  -- AI 生成 vs 用户手写。手写的任务 impact 可以为空，不该被当成算错了。
  add column if not exists source text not null default 'ai_generated',
  -- 造证据类任务必须挂靠已有项目，不许为了补一个技能去开新项目。
  -- on delete set null：项目原子被删掉，任务本身还在，只是失去了载体。
  add column if not exists anchor_atom_id uuid references atoms on delete set null,
  add column if not exists dismissed_at timestamptz,
  add column if not exists completed_at timestamptz;

-- check 约束不支持 if not exists，用 DO 块兜一层。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_source_check'
  ) then
    alter table tasks add constraint tasks_source_check
      check (source in ('ai_generated','manual'));
  end if;
end $$;

-- 5.4：AI 生成的任务被用户改过之后仍是 ai_generated，但要标出来，
-- 否则重新生成时会把用户的修改覆盖掉。
alter table tasks
  add column if not exists edited boolean not null default false;

-- 5.6：因关联缺口全部解决而自动完成的任务，必须可撤销 —— 撤销要知道
-- 它当初是自动完成的，才能干净地退回 todo（而不是把用户手填的工时抹掉）。
alter table tasks
  add column if not exists auto_completed boolean not null default false;

create index if not exists tasks_user_status_idx on tasks (user_id, status);
create index if not exists tasks_anchor_idx on tasks (anchor_atom_id);

-- ---- task_targets ----

-- impact 的计算依据。排查「这个数字怎么来的」时，这是唯一的手段：
-- {"formula":"collect_data","weight":3,"coverage":0.6,
--  "ev_mult_before":0.6,"ev_mult_after":1.0,"sum_weight":28,"result":2.57}
alter table task_targets
  add column if not exists impact_basis jsonb not null default '{}'::jsonb;

create index if not exists task_targets_gap_idx on task_targets (gap_id);

-- ---- gaps ----

-- 用户判定该缺口不重要。与 resolved_at 分开：一个是补上了，一个是不打算补，
-- 混成一个字段之后就再也分不清「已解决」和「已放弃」了。
alter table gaps
  add column if not exists dismissed_at timestamptz;

-- ---- task_priority 视图重建 ----

-- priority = Σimpact ÷ 工时。方向之间没有任何权重系数 —— 方向平权的直接后果。
-- 5.1 要求排除已忽略与已结束的任务：它们不该出现在主列表，也不该计入概览数字。
drop view if exists task_priority;
create view task_priority as
select t.id as task_id, t.user_id,
       coalesce(sum(tt.impact),0) as total_impact,
       count(distinct tt.target_id) as target_count,
       coalesce(sum(tt.impact),0) / greatest(t.estimated_hours,1) as priority
from tasks t left join task_targets tt on tt.task_id = t.id
where t.dismissed_at is null
  and t.status not in ('done','dropped')
group by t.id, t.user_id, t.estimated_hours;

-- 视图必须以调用者身份执行，否则会绕过底层表的 RLS。
-- drop + create 会丢掉这个设置，必须重设。
alter view task_priority set (security_invoker = true);
