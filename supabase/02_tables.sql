-- =============================================================
-- Proofly · 02 全部 23 张表 + task_priority 视图 + 索引
-- 通用约定：每表 id / user_id(default auth.uid()) / created_at / updated_at；
--          user_id 冗余到每张表；枚举用 text + CHECK；外键 on delete cascade。
-- =============================================================

-- ============== 6.3 事实层 ==============

-- 全局事实：专治跨文件口径漂移
create table profile_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value text,
  status text not null default 'RESOLVED'
    check (status in ('RESOLVED','PENDING','BLOCKING')),
  conflict_log jsonb default '[]'::jsonb,
  disclosure_rule text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, key)
);

-- 经历原子（对外称「经历」）
create table atoms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references atoms on delete cascade,
  level text not null default 'project'
    check (level in ('project','capability_slice')),
  context text not null default 'employment'
    check (context in ('employment','side_project','volunteer','community')),
  org text, role text, title text not null,
  period_start date, period_end date,          -- period_end 为 null 表示至今
  situation text, task text,
  actions jsonb default '[]'::jsonb,
  status text not null default 'concept'
    check (status in ('concept','design_done','in_dev','shipped','sunset')),
  evidence_level text not null default 'absent'
    check (evidence_level in ('measured','estimated','designed_only','absent')),
  pending_metrics jsonb default '[]'::jsonb,
  jd_signals jsonb default '[]'::jsonb,
  embedding vector(1536),
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 结果指标。kind 区分「结果」与「交付物」：只有 outcome 参与证明度推导。
create table metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  atom_id uuid not null references atoms on delete cascade,
  name text not null,
  kind text not null default 'outcome' check (kind in ('outcome','output')),
  from_value text, to_value text, delta text,
  evidence_level text not null default 'measured'
    check (evidence_level in ('measured','estimated','designed_only','absent')),
  method text,                                  -- 口径说明，面试被追问归因时用
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 叙事护栏
create table guards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  atom_id uuid not null unique references atoms on delete cascade,
  must_say jsonb default '[]'::jsonb,
  never_say jsonb default '[]'::jsonb,          -- 生成后正则复查
  role_framing text,
  probes jsonb default '[]'::jsonb,             -- [{q, a_outline}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null,
  category text,
  depth text default 'proficient'
    check (depth in ('familiar','proficient','expert')),
  evidence_strength text not null default 'none'
    check (evidence_strength in ('strong','weak','none')),  -- 派生，禁止手填
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, label)
);

create table atom_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  atom_id uuid not null references atoms on delete cascade,
  skill_id uuid not null references skills on delete cascade,
  weight numeric default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (atom_id, skill_id)
);

create table source_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  filename text not null,
  storage_path text,
  doc_type text,
  parsed_text text,
  ingested_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table atom_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  atom_id uuid not null references atoms on delete cascade,
  source_doc_id uuid not null references source_docs on delete cascade,
  excerpt text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (atom_id, source_doc_id)
);

-- ============== 6.4 摄入层 ==============

create table ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  input_type text not null check (input_type in ('upload','chat')),
  raw_input text,
  source_doc_id uuid references source_docs on delete set null,
  status text not null default 'extracting'
    check (status in ('extracting','awaiting_review','committed','discarded')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AI 抽取结果的暂存区。人工确认前不进事实层。
create table drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ingest_job_id uuid not null references ingest_jobs on delete cascade,
  intent text not null check (intent in ('CREATE','UPDATE','ASK')),
  target_atom_id uuid references atoms on delete set null,
  payload jsonb default '{}'::jsonb,
  diff jsonb default '{}'::jsonb,
  confidence numeric,
  ai_note text,                                 -- 抽取依据，界面上必须展示
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','edited','rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 置信度低于 0.75 一律为 ASK，不允许静默判定
alter table drafts add constraint drafts_confidence_gate
  check (intent = 'ASK' or confidence is null or confidence >= 0.75);

-- ============== 6.5 策略层 ==============

-- 求职方向。方向之间无主次，sort_order 仅影响展示。
create table targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  direction text,
  narrative text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 原子在各方向下的策略。
create table atom_target_strategy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  atom_id uuid not null references atoms on delete cascade,
  target_id uuid not null references targets on delete cascade,
  render_weight text not null default 'brief'
    check (render_weight in ('expand','brief','one_line','omit')),
  custom_phrasing jsonb,
  exclusive_group text,                         -- 同组在该方向下互斥，作用域仅此方向
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (atom_id, target_id)
);

create table jds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_id uuid not null references targets on delete cascade,
  company text, role_title text,
  raw_text text not null,
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  jd_id uuid not null references jds on delete cascade,
  text text not null,
  kind text not null default 'hard'
    check (kind in ('hard','implicit','nice_to_have')),
  weight numeric default 1,
  mapped_skill_id uuid references skills on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_id uuid not null references targets on delete cascade,
  jd_id uuid not null references jds on delete cascade,
  match_score numeric,
  strengths jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 四类缺口解法完全不同，必须分开。
create table gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  assessment_id uuid not null references assessments on delete cascade,
  requirement_id uuid references requirements on delete cascade,
  gap_type text not null
    check (gap_type in ('no_capability','no_evidence','weak_evidence','structural')),
  severity text not null default 'medium'
    check (severity in ('high','medium','low')),
  score_impact numeric,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============== 6.6 计划层（全局） ==============

-- 任务不挂 target_id：用户只有一份时间。
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  rationale text,
  action_type text not null
    check (action_type in ('collect_data','build_evidence','rewrite_narrative','learn')),
  estimated_hours int default 1,
  actual_hours int,
  status text not null default 'todo'
    check (status in ('todo','doing','done','dropped')),
  produces_atom_id uuid references atoms on delete set null,   -- 完成后回流
  deliverable text,
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table task_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references tasks on delete cascade,
  target_id uuid not null references targets on delete cascade,
  gap_id uuid references gaps on delete cascade,
  impact numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (task_id, target_id, gap_id)
);

-- 优先级 = 跨方向影响之和 ÷ 工时。方向不加权重系数。
-- security_invoker 在 04_rls.sql 中设置。
create view task_priority as
select t.id as task_id, t.user_id,
       coalesce(sum(tt.impact),0) as total_impact,
       count(distinct tt.target_id) as target_count,
       coalesce(sum(tt.impact),0) / greatest(t.estimated_hours,1) as priority
from tasks t left join task_targets tt on tt.task_id = t.id
group by t.id, t.user_id, t.estimated_hours;

-- ============== 6.7 输出层 ==============

-- 方向基线：一个方向一份，锁定后才能生成投递版本。
create table resume_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_id uuid not null unique references targets on delete cascade,
  headline text,
  block_order jsonb default '[]'::jsonb,
  rendered_md text,
  locked_at timestamptz,                        -- null 表示未锁定
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 投递版本：一份 JD 一份版本，同方向可有 N 份。
create table resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  baseline_id uuid not null references resume_baselines on delete cascade,
  jd_id uuid not null references jds on delete cascade,
  deltas jsonb default '[]'::jsonb,
  -- delta 类型仅五种：keyword_align / bullet_add / bullet_drop / reorder / headline_tweak
  delta_ratio numeric default 0,
  over_threshold_ack boolean default false,     -- 用户选了「就这样用」后不再提示
  rendered_md text,
  export_path text,
  submitted_at timestamptz,
  locked boolean default false,                 -- 已投递则冻结
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (baseline_id, jd_id)
);

create table resume_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  resume_version_id uuid references resume_versions on delete cascade,
  baseline_id uuid references resume_baselines on delete cascade,
  atom_id uuid references atoms on delete set null,   -- 溯源
  section text,
  rendered_text text,
  template_used text,                           -- 对应 evidence_level 的措辞模板
  order_index int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (resume_version_id is not null or baseline_id is not null)
);

create table interview_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_id uuid not null references targets on delete cascade,
  jd_id uuid references jds on delete cascade,
  kind text not null
    check (kind in ('project_probe','product_case','ai_tech','data_case')),
  items jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table check_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  scope text not null check (scope in ('facts','skills','resume','cross_doc')),
  level text not null check (level in ('blocking','warning','pass')),
  code text,                                    -- C1..C7
  title text not null,
  detail text,
  ref_ids jsonb default '[]'::jsonb,
  ignored_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============== 6.9 索引 ==============

create index on atoms (user_id, parent_id);
create index on atoms (user_id, evidence_level);
create index on metrics (atom_id);
create index on atom_skills (skill_id);
create index on atom_target_strategy (target_id);
create index on task_targets (task_id);
create index on resume_versions (baseline_id);
create index on resume_blocks (resume_version_id);
create index on drafts (ingest_job_id, review_status);

-- 向量索引：本步只建，Step 2 才写数据。
create index on atoms using ivfflat (embedding vector_cosine_ops) with (lists = 100);
