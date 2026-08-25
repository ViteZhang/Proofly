-- =============================================================
-- Proofly · 08 向量召回 (Step 2 新增)
--
-- Pass 3 判定意图前要先找出「使用者已有的相似经历」。
-- 相似度用余弦距离，pgvector 的 <=> 运算符。
-- 函数以调用者身份执行，走 atoms 表自己的 RLS，别人的经历召不出来。
-- =============================================================

create index if not exists atoms_embedding_idx
  on atoms using hnsw (embedding vector_cosine_ops);

create or replace function match_atoms(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  org text,
  role text,
  level text,
  status text,
  period_start date,
  period_end date,
  situation text,
  pending_metrics jsonb,
  similarity float
)
language sql
stable
security invoker
as $$
  select a.id, a.title, a.org, a.role, a.level, a.status,
         a.period_start, a.period_end, a.situation, a.pending_metrics,
         1 - (a.embedding <=> query_embedding) as similarity
  from atoms a
  where a.embedding is not null
  order by a.embedding <=> query_embedding
  limit match_count;
$$;
