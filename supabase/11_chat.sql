-- =============================================================
-- Proofly · 11 随手记的两张表 (Step 3 新增)
--
-- 对话摄入复用 ingest_jobs(input_type='chat') 与 drafts，
-- 不新建平行结构。这里只补两样 Step 2 没有的东西：
--   chat_messages —— 对话流本身，刷新页面后要能原样恢复
--   undo_log      —— 每次入库的反向操作，6 秒内可整体回滚
--
-- 表、触发器、RLS 都写在本文件内，不去改 02/03/04 的循环数组，
-- 否则从头执行 01..11 时那两个 DO 块会先于建表引用到不存在的表。
-- =============================================================

-- -------------------------------------------------------------
-- 对话消息
-- -------------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  kind text not null default 'text'
    check (kind in ('text','image','confirm_card','query_answer','clarify')),
  content text,
  image_path text,                              -- Storage 路径
  payload jsonb default '{}'::jsonb,            -- confirm_card 时存 unit + diff + ripple
  ingest_job_id uuid references ingest_jobs on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------
-- 撤销日志。记录每次入库的反向操作
--
-- expires_at 的口径是「created_at + 6 秒」。给它一个默认值，
-- 是为了让这个口径长在库里而不是长在某一处调用代码里 ——
-- 少写一次就是一条永不过期的撤销记录。
-- -------------------------------------------------------------
create table if not exists undo_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chat_message_id uuid references chat_messages on delete cascade,
  draft_id uuid references drafts on delete set null,
  inverse_ops jsonb not null,                   -- [{op:'delete'|'restore', table, id, data}]
  expires_at timestamptz not null default (now() + interval '6 seconds'),
  undone_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists chat_messages_user_created_idx
  on chat_messages (user_id, created_at desc);
create index if not exists undo_log_user_expires_idx
  on undo_log (user_id, expires_at);

-- -------------------------------------------------------------
-- updated_at：与其余 23 张表同一个 set_updated_at()
-- -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['chat_messages','undo_log']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- -------------------------------------------------------------
-- RLS：规则与 04 完全一致，每表 own_select/insert/update/delete
-- -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['chat_messages','undo_log']
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
