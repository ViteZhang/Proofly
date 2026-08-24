-- =============================================================
-- Proofly · 01 扩展与通用函数 / 触发器函数
-- 执行顺序：01 → 02 → 03 → 04
-- 说明：plpgsql 函数体在创建时不校验表是否存在（延迟到运行时解析），
--       因此本文件可以先于 02_tables.sql 创建这些函数。
-- =============================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- -------------------------------------------------------------
-- 通用：updated_at 自动维护（挂在所有表的 BEFORE UPDATE）
-- -------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -------------------------------------------------------------
-- 约束：只允许两层嵌套 —— 父原子必须是 project
-- 挂在 atoms 的 BEFORE INSERT/UPDATE OF parent_id
-- -------------------------------------------------------------
create or replace function check_atom_depth() returns trigger
language plpgsql as $$
declare p_level text;
begin
  if new.parent_id is null then return new; end if;
  select level into p_level from atoms where id = new.parent_id;
  if p_level <> 'project' then
    raise exception '只允许两层嵌套：能力点不能再挂子级';
  end if;
  return new;
end $$;

-- -------------------------------------------------------------
-- 派生：证明度推导
--   1. 有 outcome 指标 → 取最高等级(measured > estimated > designed_only)
--   2. 无 outcome 指标，但状态为 design_done / in_dev → designed_only
--   3. 其余 → absent
-- 注意：kind='output' 的指标不参与推导（交付物不等于效果）。
-- 防递归：UPDATE 带 is distinct from，值未变不写库。
-- -------------------------------------------------------------
create or replace function recompute_atom_evidence(p_atom uuid) returns void
language plpgsql as $$
declare best text; st text;
begin
  select status into st from atoms where id = p_atom;
  if st is null then return; end if;

  select case
           when bool_or(evidence_level='measured')      then 'measured'
           when bool_or(evidence_level='estimated')     then 'estimated'
           when bool_or(evidence_level='designed_only') then 'designed_only'
           else null
         end
    into best
  from metrics where atom_id = p_atom and kind = 'outcome';

  if best is null then
    best := case when st in ('design_done','in_dev') then 'designed_only' else 'absent' end;
  end if;

  update atoms set evidence_level = best, updated_at = now()
  where id = p_atom and evidence_level is distinct from best;
end $$;

-- -------------------------------------------------------------
-- 派生：技能证据强度推导
--   关联到任一 measured 经历 → strong
--   有关联但都不是 measured → weak
--   无关联 → none
-- -------------------------------------------------------------
create or replace function recompute_skill_evidence(p_skill uuid) returns void
language plpgsql as $$
declare v text;
begin
  select case
           when count(*) = 0 then 'none'
           when bool_or(a.evidence_level = 'measured') then 'strong'
           else 'weak'
         end
    into v
  from atom_skills s join atoms a on a.id = s.atom_id
  where s.skill_id = p_skill;

  update skills set evidence_strength = v, updated_at = now()
  where id = p_skill and evidence_strength is distinct from v;
end $$;

-- =============================================================
-- 触发器包装函数（CREATE TRIGGER 语句在 03_triggers.sql）
-- =============================================================

-- metrics 变更 → 重算所属 atom 的证明度
create or replace function trg_metrics_recompute() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_atom_evidence(old.atom_id);
  else
    perform recompute_atom_evidence(new.atom_id);
    if tg_op = 'UPDATE' and old.atom_id is distinct from new.atom_id then
      perform recompute_atom_evidence(old.atom_id);
    end if;
  end if;
  return null;
end $$;

-- atom 插入 / status 变更 → 重算该 atom 的证明度
create or replace function trg_atom_recompute_evidence() returns trigger
language plpgsql as $$
begin
  perform recompute_atom_evidence(new.id);
  return null;
end $$;

-- atom 的 evidence_level 变更 → 重算其关联的每个 skill 的证据强度
-- 必须挂在 AFTER UPDATE OF evidence_level（而非 AFTER UPDATE），避免自身循环。
create or replace function trg_atom_evidence_to_skills() returns trigger
language plpgsql as $$
declare s uuid;
begin
  for s in select skill_id from atom_skills where atom_id = new.id loop
    perform recompute_skill_evidence(s);
  end loop;
  return null;
end $$;

-- atom_skills 关联增删改 → 重算相关 skill 的证据强度
create or replace function trg_atom_skills_recompute() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_skill_evidence(old.skill_id);
  else
    perform recompute_skill_evidence(new.skill_id);
    if tg_op = 'UPDATE' and old.skill_id is distinct from new.skill_id then
      perform recompute_skill_evidence(old.skill_id);
    end if;
  end if;
  return null;
end $$;
