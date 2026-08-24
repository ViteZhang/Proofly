-- =============================================================
-- Proofly · 04 行级安全 (RLS)
-- 全部 23 张表开启 RLS，每表统一 4 条策略：own_select/insert/update/delete。
-- 用 DO 块循环生成，不手写 23 遍。
-- =============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profile_facts','atoms','metrics','guards','skills','atom_skills',
    'source_docs','atom_sources','ingest_jobs','drafts','targets',
    'atom_target_strategy','jds','requirements','assessments','gaps',
    'tasks','task_targets','resume_baselines','resume_versions',
    'resume_blocks','interview_kits','check_results'
  ]
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists own_select on %I;', t);
    execute format('drop policy if exists own_insert on %I;', t);
    execute format('drop policy if exists own_update on %I;', t);
    execute format('drop policy if exists own_delete on %I;', t);

    execute format(
      'create policy own_select on %I for select using (user_id = auth.uid());', t);
    execute format(
      'create policy own_insert on %I for insert with check (user_id = auth.uid());', t);
    execute format(
      'create policy own_update on %I for update using (user_id = auth.uid())
         with check (user_id = auth.uid());', t);
    execute format(
      'create policy own_delete on %I for delete using (user_id = auth.uid());', t);
  end loop;
end $$;

-- task_priority 视图必须以调用者身份执行，否则会绕过底层表的 RLS。
alter view task_priority set (security_invoker = true);
