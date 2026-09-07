-- =============================================================
-- Proofly · 随手记入库的回归脚本
--
-- 钉死一件事：**diff 点名一个字段，意思是「它有变化」，不是「把它清掉」。**
--
-- 2026-09-07 的事故就是这个。用户对一条已有经历说「补充一句，我还洽谈了
-- C 端业务合作」，入库后那条经历的七条动作只剩这一句。成因见
-- supabase/44_chat_commit_fix.sql。当时线上两条经历被抹，
-- 靠 undo_log 里的原值接了回来 —— 下一次未必这么走运。
--
-- 这个脚本整段回滚，不留任何数据，**对生产库跑也是安全的**：
--   psql -f supabase/tests/chat_commit_regression.sql
-- 也可以整段贴进 Supabase 的 SQL 编辑器。
-- =============================================================

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user uuid;
  v_atom uuid; v_job uuid; v_draft uuid;
  v_got jsonb;

  -- 造一张与线上同形的载荷：diff 点了四个字段的名，
  -- 但载荷里只有 actions_add，其余要么空串、要么根本没这个键。
  c_atom_nothing jsonb := jsonb_build_object(
    '_diff', '[{"type":"field_change","field":"actions"},
               {"type":"field_change","field":"role"},
               {"type":"field_change","field":"org"},
               {"type":"field_change","field":"situation"}]'::jsonb,
    'status', '', 'situation', '', 'task', '',
    'actions_add', '["新做的这件事"]'::jsonb,
    'metrics', '[]'::jsonb, 'skills', '[]'::jsonb,
    'guards', '{"must_say":[],"never_say":[],"role_framing":"","probes":[]}'::jsonb);

  -- 同样点名，但这次真的带了值 —— 该改的必须照旧改掉。
  c_atom_values jsonb := jsonb_build_object(
    '_diff', '[{"type":"field_change","field":"situation"},
               {"type":"field_change","field":"task"},
               {"type":"status_change","field":"status"}]'::jsonb,
    'status', 'in_dev', 'situation', '新的背景', 'task', '新的任务',
    'actions_add', '[]'::jsonb,
    'metrics', '[]'::jsonb, 'skills', '[]'::jsonb,
    'guards', '{"must_say":[],"never_say":[],"role_framing":"","probes":[]}'::jsonb);
begin
  -- 借一个现成的用户。undo_log.user_id 默认取 auth.uid()，得先冒充成他。
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception '库里一个用户都没有，这个脚本跑不了';
  end if;
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- ---- 第一组：点名但没带值，一个字段都不许动 ----
  insert into atoms (user_id, title, org, role, status, situation, task, actions)
  values (v_user, '回归用·点名不带值', '某公司', '产品经理', 'shipped',
          '原来的背景', '原来的任务', '["原动作一","原动作二","原动作三"]'::jsonb)
  returning id into v_atom;

  insert into ingest_jobs (user_id, input_type, raw_input, status, progress_stage,
                           progress_total, progress_current)
  values (v_user, 'chat', '回归用', 'awaiting_review', 'finishing', 1, 1)
  returning id into v_job;

  insert into drafts (user_id, ingest_job_id, intent, target_atom_id, review_status)
  values (v_user, v_job, 'UPDATE', v_atom, 'pending')
  returning id into v_draft;

  perform commit_chat_draft(v_draft, c_atom_nothing, 'UPDATE', v_atom, null, null);

  select jsonb_build_object('actions', actions, 'situation', situation,
                            'task', task, 'role', role, 'org', org)
    into v_got from atoms where id = v_atom;

  if v_got->'actions' <> '["原动作一","原动作二","原动作三","新做的这件事"]'::jsonb then
    raise exception '✗ 原有动作被抹了 —— 实际 %', v_got->'actions';
  end if;
  if v_got->>'org' is distinct from '某公司'      then raise exception '✗ 公司被清空了'; end if;
  if v_got->>'role' is distinct from '产品经理'   then raise exception '✗ 职位被清空了'; end if;
  if v_got->>'situation' is distinct from '原来的背景' then raise exception '✗ 背景被清空了'; end if;
  if v_got->>'task' is distinct from '原来的任务' then raise exception '✗ 任务被清空了'; end if;
  raise notice '✓ diff 点名但载荷没带值：原有内容一条不少，新动作追加在末尾';

  -- ---- 第二组：带了值，该改的必须改 ----
  insert into atoms (user_id, title, org, role, status, situation, task, actions)
  values (v_user, '回归用·点名带值', '某公司', '产品经理', 'shipped',
          '原来的背景', '原来的任务', '["原动作一"]'::jsonb)
  returning id into v_atom;

  insert into drafts (user_id, ingest_job_id, intent, target_atom_id, review_status)
  values (v_user, v_job, 'UPDATE', v_atom, 'pending')
  returning id into v_draft;

  perform commit_chat_draft(v_draft, c_atom_values, 'UPDATE', v_atom, null, null);

  select jsonb_build_object('status', status, 'situation', situation,
                            'task', task, 'org', org, 'actions', actions)
    into v_got from atoms where id = v_atom;

  if v_got->>'situation' is distinct from '新的背景' then raise exception '✗ 背景没改成 —— 实际 %', v_got->>'situation'; end if;
  if v_got->>'task'      is distinct from '新的任务' then raise exception '✗ 任务没改成 —— 实际 %', v_got->>'task'; end if;
  if v_got->>'status'    is distinct from 'in_dev'   then raise exception '✗ 状态没改成 —— 实际 %', v_got->>'status'; end if;
  if v_got->>'org'       is distinct from '某公司'   then raise exception '✗ 没点名的公司被动了'; end if;
  if v_got->'actions'    <> '["原动作一"]'::jsonb    then raise exception '✗ 没有 actions_add 时动作被动了'; end if;
  raise notice '✓ diff 点名且载荷带值：该改的都改了，没点名的没动';

  raise notice '全部通过。下面整段回滚，库里不留东西。';
end $$;

rollback;
