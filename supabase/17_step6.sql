-- =============================================================
-- Proofly · 17 Step 6 补列（简历生成）
-- Step 0 建表时 resume_* 只有骨架，第六步要求的字段补齐。
-- 全部 if not exists，重复执行安全。
-- =============================================================

-- ---- resume_blocks ----

-- 骨架里只有一个 rendered_text。但界面要能单独渲染标题行、右侧时间标注、
-- 一行概述与 bullet 列表，塞在一个字符串里就只能靠切分猜，改一处就崩。
-- rendered_text 保留：导出与全文检索用，它是这几个字段拼出来的结果。
alter table resume_blocks
  add column if not exists title text,
  add column if not exists meta text,                       -- 右侧的时间或角色标注
  add column if not exists summary text,                    -- one_line 权重时只有这个
  add column if not exists bullets jsonb not null default '[]'::jsonb,
  -- 模型自报「这个块体现了哪些 must_say」。它会漏，所以门禁还要自己查一遍，
  -- 但两边对不上的时候，这一列能告诉你是模型没写还是它以为写了。
  add column if not exists must_say_covered jsonb not null default '[]'::jsonb,
  -- 用户手工改过。改过的块重新生成时不覆盖。
  add column if not exists edited boolean not null default false,
  -- 投递版本的块是基线块的副本。指回去，详情页才说得出「这一处改的是哪一块」。
  -- on delete set null：基线块被删掉，已投递版本的内容不受影响，只是失去溯源。
  add column if not exists source_block_id uuid references resume_blocks on delete set null;

create index if not exists resume_blocks_baseline_idx on resume_blocks (baseline_id, order_index);

-- ---- resume_baselines ----

alter table resume_baselines
  -- 本版取舍：因互斥落选的、因 omit 没出现的、被过滤的空技能标签。
  -- [{kind:'exclusive'|'omit'|'skill', atomId, title, detail}]
  add column if not exists tradeoffs jsonb not null default '[]'::jsonb,
  -- 技能栏最终顺序。过滤与排序是代码算的，模型只是照抄，结果存这里。
  add column if not exists skills jsonb not null default '[]'::jsonb,
  add column if not exists generated_at timestamptz;

-- ---- resume_versions ----

alter table resume_versions
  -- 模型报的「这条要求在经历库里找不到对应内容」。如实记录，不补齐。
  add column if not exists unmatched jsonb not null default '[]'::jsonb,
  -- 校验没过被丢弃的 delta。丢了不能不说，否则用户以为模型只给了 4 处。
  add column if not exists warnings jsonb not null default '[]'::jsonb;

create index if not exists resume_versions_jd_idx on resume_versions (jd_id);
