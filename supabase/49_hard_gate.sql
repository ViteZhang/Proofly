-- =============================================================
-- Proofly · 49 硬门槛：不可通过行动关闭的要求单独成类
--
-- 这是这批改动里价值最高的一条 —— 它把一类必然错误的输出从系统里移除了。
--
-- 任务池成立的前提是「可通过行动关闭」。学历不是。把不可关闭的项塞进
-- 任务池，会让整个清单的优先级排序失去意义：用户第一次看到「获得本科
-- 学历 · 1440 小时」排在第一位，就再也不会信任这个排序了。
-- =============================================================

-- 这条要求对的是什么。学历、证书类要求跟结构化档案比对，不再拿去跟经历
-- 做语义匹配 —— 那是在一个所有候选人都有确切答案的维度上瞎猜。
alter table requirements add column if not exists mapped_kind text not null default 'skill'
  check (mapped_kind in ('skill','education','credential','employment','profile_fact'));

-- 新增 hard_disqualifier。
-- 它不进缺口列表、不生成任务、不计入扣分，只在方向页单独标注一栏。
-- 单独标注而不扣分的理由：一条不可改变的因素持续压低所有方向的分数，
-- 会让分数失去「我这两周有没有进步」这个唯一用途。
alter table gaps drop constraint if exists gaps_gap_type_check;
alter table gaps add constraint gaps_gap_type_check
  check (gap_type in ('no_capability','no_evidence','weak_evidence','structural','hard_disqualifier'));
