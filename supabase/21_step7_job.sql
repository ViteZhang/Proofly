-- =============================================================
-- Proofly · 21 Step 7 出题改成后台作业
--
-- 实测一次出题 10–35 分钟：提示词要「总数 15–20 题」，每道带 3–4 个
-- 应答要点，一次生成 1.3–1.6 万 completion token。让它挂在一个 Server
-- Action 上，等于要求用户开着页面干等半小时 —— 关掉就白跑。
--
-- 所以照 Step 2 抽取作业那套来：活跑在 after() 里，进度落库，页面轮询。
-- 页面关掉作业照样跑完，重新打开把进度捡回来。
--
-- 全部 if not exists，重复执行安全。
-- =============================================================

alter table interview_kits
  add column if not exists job_status text not null default 'idle'
    check (job_status in ('idle', 'running', 'done', 'failed')),
  -- 两次模型调用各是一个阶段，最后一步是落库。别让前端猜文案该显示什么。
  add column if not exists job_stage text
    check (job_stage is null or job_stage in ('probing', 'casing', 'writing')),
  add column if not exists job_started_at timestamptz,
  -- 干活期间每 30 秒报一次「我还活着」。进程没了（热重载、重启、崩溃）
  -- 心跳就停，界面据此判断作业是不是已经没人接了。
  add column if not exists heartbeat_at timestamptz,
  add column if not exists error_message text,
  -- 真实数字，不是转圈：这两个数在各自那次调用回来时就写进去，
  -- 界面能说「项目深挖 18 道已出，正在出案例题」。
  add column if not exists probe_count int not null default 0,
  add column if not exists case_count int not null default 0,
  -- 丢掉的题与提醒。原先只在生成后那一次返回给前端，刷新就没了 ——
  -- 「丢了哪几道题、为什么丢」是用户唯一能据以判断这套题可不可信的东西。
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists rejected jsonb not null default '[]'::jsonb;

create index if not exists interview_kits_running_idx
  on interview_kits (user_id, job_status);
