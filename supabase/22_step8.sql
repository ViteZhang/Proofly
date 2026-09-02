-- =============================================================
-- Proofly · Step 8 体检
--
-- check_results 这张表 Step 6 已经在用了：门禁每跑一次，把 G1..G6
-- 的结果按「基线/版本」挂进去。Step 8 的体检要往同一张表里写十项
-- 检查的结果，两拨记录必须能分开——因为体检每次扫描前要清空自己的
-- 旧记录，而 C2..C5 恰恰是从门禁那拨记录里汇总出来的。清错了就是
-- 把自己的数据源删掉。
--
-- 所以加 origin：门禁写的是 'gate'，体检写的是 'health'，
-- 体检只清 'health'。已有记录默认 'gate'，与历史一致。
-- =============================================================

-- ---- 1. check_results 扩容 ----

-- 提示级：C9 C10 不阻断任何事，但应该在视野里。
alter table check_results drop constraint if exists check_results_level_check;
alter table check_results add constraint check_results_level_check
  check (level in ('blocking','warning','info','pass'));

-- atoms：C9 C10 挂在经历上，不属于原有四个作用域。
alter table check_results drop constraint if exists check_results_scope_check;
alter table check_results add constraint check_results_scope_check
  check (scope in ('facts','skills','resume','cross_doc','atoms'));

alter table check_results
  add column if not exists origin text not null default 'gate'
    check (origin in ('gate','health')),
  -- 「去解决」的落点。跳到列表页让用户自己找等于没做，所以这里存的是
  -- 带 query 的完整路径，不是页面名。
  add column if not exists resolve_link text,
  -- 同一个问题在多次扫描之间的身份。忽略记录靠它认人——不能靠 id，
  -- 因为每次扫描都是删了重写，id 每次都变。
  add column if not exists fingerprint text;

create index if not exists check_results_user_origin_idx
  on check_results (user_id, origin);

-- ---- 2. 忽略记录 ----

-- 忽略不能存在 check_results 上：那张表每次扫描都清空重写，
-- 忽略标记会跟着一起没。单独一张表按 fingerprint 认人。
create table if not exists health_ignores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fingerprint text not null,
  code text,
  -- 三个月后你会忘了为什么忽略它，所以留个地方写。可空。
  reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, fingerprint)
);

alter table health_ignores enable row level security;
drop policy if exists owner_all on health_ignores;
create policy owner_all on health_ignores
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- 3. 扫描记录 ----

-- 快扫：进页面就跑，跑完直接写 done，用来显示「上次扫描时间与覆盖范围」。
-- 深扫：调模型，二十到六十秒，要显示「第 N / M 条」，所以进度得落库。
create table if not exists health_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('quick','deep')),
  status text not null default 'running'
    check (status in ('running','done','failed')),
  done_count int not null default 0,
  total_count int not null default 0,
  -- 「24 条经历 · 31 个技能 · 3 份简历 · 6 份源材料」
  coverage jsonb default '{}'::jsonb,
  error_message text,
  started_at timestamptz default now(),
  heartbeat_at timestamptz default now(),
  finished_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists health_scans_user_kind_idx
  on health_scans (user_id, kind, started_at desc);

alter table health_scans enable row level security;
drop policy if exists owner_all on health_scans;
create policy owner_all on health_scans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- updated_at 触发器
do $$
declare t text;
begin
  foreach t in array array['health_ignores','health_scans']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;
