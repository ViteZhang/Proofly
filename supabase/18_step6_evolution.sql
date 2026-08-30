-- =============================================================
-- Proofly · 18 Step 6.6 基线演进日志
--
-- 同一个改动在多份投递版本里反复出现，说明基线漏了东西，而不是
-- 这些 JD 特殊。检测到之后提示一次，用户做完选择就记在这里，
-- 不再重复问 —— 一条被拒绝过的建议每次生成都弹一遍，比不提示更烦。
-- =============================================================

create table if not exists baseline_evolution_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  baseline_id uuid not null references resume_baselines on delete cascade,
  -- 同一个改动的稳定标识。形如 add:<atom_id>:<归一化的来源引用>
  -- / drop:<block_id>:<归一化的原文> / align:<原词>><新词>
  signature text not null,
  decision text not null check (decision in ('accepted','rejected')),
  decided_at timestamptz not null default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (baseline_id, signature)
);

create index if not exists baseline_evolution_baseline_idx
  on baseline_evolution_log (baseline_id);

alter table baseline_evolution_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'baseline_evolution_log' and policyname = 'owner_all'
  ) then
    create policy owner_all on baseline_evolution_log
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

drop trigger if exists set_updated_at on baseline_evolution_log;
create trigger set_updated_at before update on baseline_evolution_log
  for each row execute function set_updated_at();
