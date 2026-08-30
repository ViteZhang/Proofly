-- =============================================================
-- Proofly · 15 Step 4 补列
-- Step 0 建表时 requirements / assessments 只有骨架，第四节要求的字段补齐。
-- 全部 if not exists，重复执行安全。
-- =============================================================

-- ---- requirements ----

alter table requirements
  -- 方案里叫 index，那是 SQL 保留字，列名用 idx；对外仍按 index 展示。
  add column if not exists idx int,
  -- 原文措辞逐字保留。Step 6 生成简历要用 JD 原词做关键词对齐，
  -- 改写过的词对不上，所以这一列不许清洗、不许润色。
  add column if not exists raw_phrase text,
  -- 三个月内补不上的客观事实差距。只有这一项由模型判断。
  add column if not exists is_structural boolean not null default false,
  -- 仅 implicit：这条是从哪句职责反推出来的
  add column if not exists derived_from text;

create index if not exists requirements_jd_idx on requirements (jd_id, idx);

-- ---- assessments ----

-- 每条要求的判定与算分结果，冻结在这一次评估里。
--
-- 为什么不拆表：assessments 是不可变快照，要支撑「两周后看进步」。
-- 要求本身会被编辑、删除，拆成表再 join 回去，历史评估会跟着一起变，
-- 那就不是快照了。这里存的是当时的原样。
--
-- 形状（见 src/lib/scoring/types.ts，那边是唯一的类型定义）：
-- [{ requirementIndex, text, rawPhrase, kind, isStructural, weight,
--    coverage, coverageValue, evidenceMultiplier, requirementScore,
--    scoreLoss, matchedAtomIds, relatedSkillLabels, reason, gapType }]
alter table assessments
  add column if not exists results jsonb not null default '[]'::jsonb;

-- ---- gaps ----

-- 缺口展示要说出「命中了哪几条经历」「技能栏里那个空标签叫什么」，
-- 这些不放进来就得回头 join 一遍已经变了的经历库。
alter table gaps
  add column if not exists requirement_index int,
  add column if not exists detail jsonb not null default '{}'::jsonb;

create index if not exists gaps_assessment_idx on gaps (assessment_id);
