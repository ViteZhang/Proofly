-- =============================================================
-- Proofly · 47 经历挂到任职履历上
--
-- 现在一家公司的起止时间只能由它名下所有 atom 的 period 聚合得出。
-- 「在职但那几个月没有可写的项目」的空档会被整段吞掉，导出的简历工作
-- 经历日期因此偏窄 —— 那是一份错的简历，不是体验瑕疵。
--
-- atoms.org / role 两个冗余字段一个都不删：现有查询、召回负载、导入
-- 去重全都在读它们，删了会连带炸掉一片跟这次改动无关的地方。回填之后
-- 它们的角色从「唯一真相」降级成「冗余快照」，仅此而已。
-- =============================================================

alter table atoms add column if not exists employment_id uuid references employments on delete set null;

-- on delete set null 而不是 cascade：删掉一段履历不该把那几年的经历
-- 一起删了。经历是资产，履历只是它的归属。
create index if not exists atoms_employment_idx on atoms (employment_id);
