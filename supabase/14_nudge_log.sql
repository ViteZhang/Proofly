-- =============================================================
-- Proofly · 14 主动追问的发送记录 (Step 3 新增)
--
-- 这张表存在的唯一理由是频次控制。追问这件事，多一次就是骚扰，
-- 所以「今天发过没有」「这条经历这个规则最近问过没有」「上次问了人家没理」
-- 三件事都得有据可查。
--
-- 「每天最多 1 次」做成唯一索引而不是查一遍再插：
-- 查完再插中间隔着一次往返，两个标签页同时打开随手记就会发两条。
-- 让数据库来保证，代码里撞了就当今天已经发过。
-- =============================================================

create table if not exists nudge_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  rule text not null check (rule in ('R1','R2','R3')),
  atom_id uuid references atoms on delete set null,
  chat_message_id uuid references chat_messages on delete set null,
  sent_at timestamptz not null default now(),
  -- 「每天」按东八区算，不按 UTC —— UTC 的一天从北京时间早上八点开始，
  -- 早上七点和九点各发一条，在用户眼里是同一个上午问了两次。
  -- 用普通列 + 默认值而不是生成列：at time zone 是 STABLE，进不了索引表达式。
  sent_on date not null default ((now() at time zone 'Asia/Shanghai')::date),
  responded boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists nudge_log_one_per_day
  on nudge_log (user_id, sent_on);
create index if not exists nudge_log_user_rule_idx
  on nudge_log (user_id, rule, sent_at desc);
create index if not exists nudge_log_atom_idx
  on nudge_log (atom_id, rule, sent_at desc);

drop trigger if exists set_updated_at on nudge_log;
create trigger set_updated_at before update on nudge_log
  for each row execute function set_updated_at();

alter table nudge_log enable row level security;
drop policy if exists own_select on nudge_log;
drop policy if exists own_insert on nudge_log;
drop policy if exists own_update on nudge_log;
drop policy if exists own_delete on nudge_log;
create policy own_select on nudge_log for select using (user_id = auth.uid());
create policy own_insert on nudge_log for insert with check (user_id = auth.uid());
create policy own_update on nudge_log for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy own_delete on nudge_log for delete using (user_id = auth.uid());
