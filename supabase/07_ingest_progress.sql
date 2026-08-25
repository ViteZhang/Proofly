-- =============================================================
-- Proofly · 07 摄入作业的进度字段 (Step 2 新增)
--
-- 进度必须是真实数字：「已抽出 12 / 18 条」而不是转圈。
-- candidates 存 Pass 1 的切分结果，有它才能做到两件事：
--   1. 页面关掉再打开，作业接着跑，进度不丢
--   2. 某一条 Pass 2 失败时单独重试，不牵连其他条
-- =============================================================

alter table ingest_jobs
  add column if not exists progress_stage   text,
  add column if not exists progress_current int  default 0,
  add column if not exists progress_total   int  default 0,
  add column if not exists error_message    text,
  add column if not exists candidates       jsonb default '[]'::jsonb,
  add column if not exists heartbeat_at     timestamptz;

-- 只允许这几种阶段，别让前端猜文案该显示什么
alter table ingest_jobs drop constraint if exists ingest_jobs_progress_stage_check;
alter table ingest_jobs add constraint ingest_jobs_progress_stage_check
  check (progress_stage is null or progress_stage in ('segmenting','extracting','finishing'));

create index if not exists ingest_jobs_user_created_idx
  on ingest_jobs (user_id, created_at desc);
create index if not exists drafts_job_idx
  on drafts (ingest_job_id);
