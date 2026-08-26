-- =============================================================
-- Proofly · llm_calls 记下这笔调用是谁服务的
--
-- 加了 DeepSeek 兜底之后，同一个 purpose 可能由不同供应商完成，
-- 计价也不一样。不记 provider，成本表就没法回答「这个月的钱花在哪家」，
-- 也看不出中转站到底挂了多少次。
--
-- 这是对《Step 2 方案 v1》第 4 节字段清单的一处增补，不是改动：
-- 原有字段一个没动，新列可空，历史行保持 null。
-- =============================================================

alter table llm_calls
  add column if not exists provider text;

comment on column llm_calls.provider is
  '这笔调用实际由谁完成：primary（主接入点）/ deepseek（兜底）。历史行为 null。';

-- 「哪家、花了多少、失败多少」是看这张表的主要方式，给它一个索引。
create index if not exists llm_calls_provider_idx
  on llm_calls (user_id, provider, created_at desc);
