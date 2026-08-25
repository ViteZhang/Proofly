-- =============================================================
-- Proofly · 05 模型调用日志 (Step 2 新增)
-- 执行顺序：01 → 02 → 03 → 04 → 05
-- 说明：每次 callLLM() 落一行。没有这张表，就不知道钱花在哪。
--       这是追加型日志，不做 UPDATE，因此不带 updated_at 触发器。
-- =============================================================

create table if not exists llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tier text not null check (tier in ('light','strong','vision','embedding')),
  purpose text not null,                        -- 哪个环节：pass1_segment / pass2_extract / ...
  prompt_tokens int,
  completion_tokens int,
  duration_ms int,
  created_at timestamptz default now()
);

-- 按用户 + 时间倒查一份文档的花销
create index if not exists llm_calls_user_created_idx
  on llm_calls (user_id, created_at desc);

alter table llm_calls enable row level security;

drop policy if exists own_select on llm_calls;
drop policy if exists own_insert on llm_calls;
drop policy if exists own_update on llm_calls;
drop policy if exists own_delete on llm_calls;

create policy own_select on llm_calls for select using (user_id = auth.uid());
create policy own_insert on llm_calls for insert with check (user_id = auth.uid());
create policy own_update on llm_calls for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy own_delete on llm_calls for delete using (user_id = auth.uid());
