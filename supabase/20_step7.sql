-- =============================================================
-- Proofly · 20 Step 7 面试题包
--
-- Step 0 的 interview_kits 把题目塞在 items jsonb 里。那样练习状态
-- 就没地方挂 —— 「这题答不好」是用户花时间试出来的信息，必须是一行
-- 能单独更新、能被下一次生成继承的记录，不能是一坨 JSON 里的一个键。
-- 所以题目单独建表，interview_kits 退化成「一次生成」的元数据。
--
-- 全部 if not exists，重复执行安全。
-- =============================================================

-- ---- interview_kits 补列 ----

alter table interview_kits
  -- 题包挂在投递版本上而非 JD 上：同一份 JD 的两个简历版本用到的经历不同，
  -- 题目也应该不同。级联删除 —— 版本没了，按它出的题就失去依据。
  add column if not exists resume_version_id uuid references resume_versions on delete cascade,
  add column if not exists generated_at timestamptz default now();

-- kind 原本是「这个题包属于哪一类题」。现在一个题包一次产出四类，
-- 类别下沉到 interview_questions.kind，这一列在新行里没有意义。
-- 不删列（老行还挂着值），只解除非空。
alter table interview_kits alter column kind drop not null;

create index if not exists interview_kits_version_idx
  on interview_kits (resume_version_id);

-- ---- interview_questions ----

create table if not exists interview_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kit_id uuid not null references interview_kits on delete cascade,
  kind text not null
    check (kind in ('project_probe','product_case','ai_tech','data_case')),
  question text not null,
  probe_type text
    check (probe_type in ('effect','attribution','decision','boundary','role','progress')),
  difficulty text
    check (difficulty in ('basic','standard','deep')),
  from_atom_id uuid references atoms on delete set null,
  from_existing_probe boolean default false,
  -- 风险由代码判定，不由模型给。模型输出里的风险标记一律忽略。
  risk_level text not null default 'low'
    check (risk_level in ('high','medium','low')),
  risk_reason text,                            -- 为什么是高风险，界面上要显示
  answer_outline jsonb default '[]'::jsonb,    -- [{label, content}]
  dont_do text,
  data_gap_hint text,
  -- data_gap_hint 指向的那条指标。有它才能让「去补」直接落到具体一行，
  -- 而不是把人丢到经历库门口自己找。
  gap_metric_id uuid references metrics on delete set null,
  related_atom_ids jsonb default '[]'::jsonb,
  why_this_question text,
  practice_status text not null default 'untouched'
    check (practice_status in ('untouched','practiced','struggling')),
  practice_note text,                          -- 用户自己记的备注
  -- 上一版留下来的题：重新生成时没被新题命中，但用户标了「答不好」，
  -- 那条信息比任何生成结果都珍贵，保留并在界面上标明它来自上一版。
  carried_over boolean not null default false,
  sort_order int not null default 0,           -- 模型给出的原始顺序
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists interview_questions_kit_risk_idx
  on interview_questions (kit_id, risk_level);
create index if not exists interview_questions_practice_idx
  on interview_questions (user_id, practice_status);

alter table interview_questions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'interview_questions' and policyname = 'owner_all'
  ) then
    create policy owner_all on interview_questions
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

drop trigger if exists set_updated_at on interview_questions;
create trigger set_updated_at before update on interview_questions
  for each row execute function set_updated_at();
