-- =============================================================
-- Proofly · 03 触发器（updated_at + 派生字段）
-- 依赖 01 的函数与 02 的表。
-- =============================================================

-- -------------------------------------------------------------
-- updated_at：所有 23 张表 BEFORE UPDATE 调 set_updated_at()
-- 用 DO 块循环生成，避免手写 23 遍。
-- -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profile_facts','atoms','metrics','guards','skills','atom_skills',
    'source_docs','atom_sources','ingest_jobs','drafts','targets',
    'atom_target_strategy','jds','requirements','assessments','gaps',
    'tasks','task_targets','resume_baselines','resume_versions',
    'resume_blocks','interview_kits','check_results'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 派生字段触发器
-- -------------------------------------------------------------

-- 两层嵌套约束
drop trigger if exists atoms_check_depth on atoms;
create trigger atoms_check_depth
  before insert or update of parent_id on atoms
  for each row execute function check_atom_depth();

-- atom 插入 / status 变更 → 重算证明度
-- （插入时也重算，使「in_dev 无指标」立即得到 designed_only）
drop trigger if exists atoms_recompute_evidence on atoms;
create trigger atoms_recompute_evidence
  after insert or update of status on atoms
  for each row execute function trg_atom_recompute_evidence();

-- atom 的 evidence_level 变更 → 级联重算关联 skill 的证据强度
-- 必须是 OF evidence_level，避免与自身循环。
drop trigger if exists atoms_evidence_to_skills on atoms;
create trigger atoms_evidence_to_skills
  after update of evidence_level on atoms
  for each row execute function trg_atom_evidence_to_skills();

-- metrics 增删改 → 重算所属 atom 的证明度
drop trigger if exists metrics_recompute on metrics;
create trigger metrics_recompute
  after insert or update or delete on metrics
  for each row execute function trg_metrics_recompute();

-- atom_skills 增删改 → 重算相关 skill 的证据强度
drop trigger if exists atom_skills_recompute on atom_skills;
create trigger atom_skills_recompute
  after insert or update or delete on atom_skills
  for each row execute function trg_atom_skills_recompute();
