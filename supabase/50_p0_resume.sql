-- =============================================================
-- Proofly · 50 简历生成 P0
--
-- 两件事:
--   1. render_weight 多一档 lead —— 每个方向的主打经历,5 行。
--      原来最高档 expand 是 5 行,现在降到 4:头两条比其余的更值得多说
--      一句,而总行数是有预算的,主打多一行就得从别处扣。
--   2. atom_target_strategy 多一列 strategy_source。自动分配只写 auto 行,
--      人改过的行永不被覆盖。
--
-- 存量行一律算 manual:它们全都是用户自己点出来的,不该被下一次评估冲掉。
-- =============================================================

alter table atom_target_strategy
  drop constraint if exists atom_target_strategy_render_weight_check;

alter table atom_target_strategy
  add constraint atom_target_strategy_render_weight_check
  check (render_weight in ('lead','expand','brief','one_line','omit'));

alter table atom_target_strategy
  add column if not exists strategy_source text not null default 'manual';

alter table atom_target_strategy
  drop constraint if exists atom_target_strategy_strategy_source_check;

alter table atom_target_strategy
  add constraint atom_target_strategy_strategy_source_check
  check (strategy_source in ('auto','manual'));

-- 自动初始化按 (target_id, strategy_source) 扫一遍自己写过的行,
-- 单独走一个索引比全表扫便宜。
create index if not exists atom_target_strategy_auto_idx
  on atom_target_strategy (target_id, strategy_source);
