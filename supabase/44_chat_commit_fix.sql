-- =============================================================
-- Proofly · 44 修：随手记更新会把原有内容抹掉
--
-- 症状：对一条已有经历说「补充一句，我还洽谈了 C 端业务合作」，
-- 入库后那条经历的「我做了什么」只剩这一句，原来写好的七条动作没了。
--
-- 成因在 13 的 commit_chat_draft，UPDATE 分支那份字段白名单：
--
--   when 'actions' then update atoms set actions = coalesce(p_atom->'actions','[]')
--
-- Stage C 给出的 diff 是 {type:'field_change', field:'actions'}，
-- 而载荷里只有 actions_add，没有 actions。于是 p_atom->'actions' 是 NULL，
-- coalesce 成空数组把七条动作全清了，紧接着 actions_add 追加回一条。
-- 下面那段「口语里补的动作是追加，不是覆盖」的注释是对的，只是它上面
-- 这一行先动的手。
--
-- 同一个洞在 situation / task / role / org 上都开着：diff 点名了、
-- 载荷里却没值，就会写成 NULL。role 和 org 甚至根本不在载荷里，
-- 模型一提这两个字段，公司和职位就没了。
--
-- 改法：diff 点名只是「这个字段有变化」，不是「把它清掉」——
-- 每一条都必须带值才写。
--
-- 函数其余部分与 13 逐字一致，只重发一次。
-- =============================================================

create or replace function commit_chat_draft(
  p_draft_id        uuid,
  p_atom            jsonb,
  p_intent          text,      -- CREATE | UPDATE
  p_target          uuid,
  p_parent          uuid,
  p_chat_message_id uuid
) returns jsonb
language plpgsql security invoker as $$
declare
  v_atom uuid;
  v_undo uuid;
  v_ops jsonb := '[]'::jsonb;
  v_old atoms%rowtype;
  v_names text[];
  v_pending jsonb;
  v_id uuid;
  v_guard guards%rowtype;
  v_had_guard boolean;
  d jsonb; m jsonb; s jsonb;
begin
  if p_intent = 'CREATE' then
    v_atom := insert_atom(p_atom, p_parent, null);
    -- 新建的整条删掉即可，指标 / 护栏 / 技能关联 / 子级都挂着级联
    v_ops := v_ops || jsonb_build_object(
      'op', 'delete', 'table', 'atoms', 'id', v_atom, 'data', null);

  elsif p_intent = 'UPDATE' then
    if p_target is null then
      raise exception '更新目标为空，这条不能入库';
    end if;
    v_atom := p_target;

    select * into v_old from atoms where id = v_atom;
    if not found then
      raise exception '要更新的那条经历不在了';
    end if;

    -- 先把老值记下来。只记这个函数会动的列，别的一律不碰，
    -- 免得撤销时把用户在别处的编辑一起回滚掉。
    v_ops := v_ops || jsonb_build_object(
      'op', 'restore', 'table', 'atoms', 'id', v_atom,
      'data', jsonb_build_object(
        'status', v_old.status,
        'situation', v_old.situation,
        'task', v_old.task,
        'role', v_old.role,
        'org', v_old.org,
        'actions', v_old.actions,
        'pending_metrics', v_old.pending_metrics));

    -- 只改 diff 点名的字段（与 09 同一份白名单）。
    --
    -- 每一条都必须带值才写。diff 点名一个字段，说的是「这个字段有变化」，
    -- 不是「把这个字段清掉」—— 随手记里没有「删掉我的背景」这种意图。
    -- 而 p_atom 是从 content_patch 拼出来的，模型没提的字段就是空的，
    -- 甚至根本没有这个键（role / org 从来就不在里面）。不带值也照写，
    -- 结果就是 diff 点到谁谁被清空。
    for d in select * from jsonb_array_elements(coalesce(p_atom->'_diff', '[]'::jsonb)) loop
      if d->>'type' in ('field_change','status_change') then
        case d->>'field'
          when 'status'    then update atoms set status = p_atom->>'status'
                                where id = v_atom and coalesce(p_atom->>'status','') <> '';
          when 'situation' then update atoms set situation = p_atom->>'situation'
                                where id = v_atom and coalesce(p_atom->>'situation','') <> '';
          when 'task'      then update atoms set task = p_atom->>'task'
                                where id = v_atom and coalesce(p_atom->>'task','') <> '';
          when 'role'      then update atoms set role = p_atom->>'role'
                                where id = v_atom and coalesce(p_atom->>'role','') <> '';
          when 'org'       then update atoms set org = p_atom->>'org'
                                where id = v_atom and coalesce(p_atom->>'org','') <> '';
          -- actions 是这个 bug 的重灾区，单独说清楚：
          -- 随手记的一条更新说「改了 动作：X」，意思永远是「我还做了 X」，
          -- 载荷里给的是 actions_add，不是一份完整的 actions。原来这里
          -- 无条件 coalesce(p_atom->'actions','[]')，于是那份 NULL 变成
          -- 空数组，把用户写好的七条动作整个抹掉，再由下面的追加补回一条。
          -- 现在只有调用方真的带了一份非空 actions 才覆盖。
          when 'actions'   then update atoms set actions = p_atom->'actions'
                                where id = v_atom
                                  and jsonb_typeof(p_atom->'actions') = 'array'
                                  and jsonb_array_length(p_atom->'actions') > 0;
          else null;
        end case;
      end if;
    end loop;

    -- status_change 常常不填 field，单独兜一次
    if exists (select 1 from jsonb_array_elements(coalesce(p_atom->'_diff','[]'::jsonb)) e
               where e->>'type' = 'status_change')
       and coalesce(p_atom->>'status','') <> '' then
      update atoms set status = p_atom->>'status' where id = v_atom;
    end if;

    -- 口语里补的动作是追加，不是覆盖 —— 用户说「我还做了 X」，
    -- 不该把原来写好的三条动作换成这一条。
    if jsonb_array_length(coalesce(p_atom->'actions_add','[]'::jsonb)) > 0 then
      update atoms
         set actions = coalesce(actions,'[]'::jsonb) || coalesce(p_atom->'actions_add','[]'::jsonb)
       where id = v_atom;
    end if;

    -- 指标：名字没出现过的才插，逐条记下反向删除
    select coalesce(array_agg(name), '{}') into v_names from metrics where atom_id = v_atom;
    for m in select * from jsonb_array_elements(coalesce(p_atom->'metrics','[]'::jsonb)) loop
      if coalesce(m->>'name','') <> '' and not (m->>'name' = any(v_names)) then
        insert into metrics (atom_id, name, kind, from_value, to_value, delta, evidence_level, method)
        values (v_atom, m->>'name',
                coalesce(nullif(m->>'kind',''), 'outcome'),
                nullif(m->>'from_value',''), nullif(m->>'to_value',''), nullif(m->>'delta',''),
                coalesce(nullif(m->>'evidence_level',''), 'measured'),
                nullif(m->>'method',''))
        returning id into v_id;
        v_names := v_names || (m->>'name');
        v_ops := v_ops || jsonb_build_object(
          'op', 'delete', 'table', 'metrics', 'id', v_id, 'data', null);
      end if;
    end loop;

    -- 待补数据被真实数据填上了就拿掉。老值已经在上面的 restore 里了。
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_pending
    from jsonb_array_elements(coalesce(v_old.pending_metrics, '[]'::jsonb)) e
    where coalesce(e->>'name', e #>> '{}') <> all(v_names);
    update atoms set pending_metrics = coalesce(v_pending, '[]'::jsonb) where id = v_atom;

    -- 技能：新建的关联要能撤掉。skills 那行是同名复用的，不删 ——
    -- 它可能还挂在别的经历上。
    for s in select * from jsonb_array_elements(coalesce(p_atom->'skills','[]'::jsonb)) loop
      if coalesce(s #>> '{}', '') <> '' then
        insert into atom_skills (atom_id, skill_id)
        values (v_atom, upsert_skill(s #>> '{}'))
        on conflict (atom_id, skill_id) do nothing
        returning id into v_id;
        if v_id is not null then
          v_ops := v_ops || jsonb_build_object(
            'op', 'delete', 'table', 'atom_skills', 'id', v_id, 'data', null);
          v_id := null;
        end if;
      end if;
    end loop;

    -- 护栏：口语里说的「这条对外别提 X」也要能落地，也要能撤。
    -- 原来有行就记老值，原来没有就记「撤销时删掉这行」。
    if p_atom ? 'guards' and (
         jsonb_array_length(coalesce(p_atom->'guards'->'must_say','[]'::jsonb)) > 0 or
         jsonb_array_length(coalesce(p_atom->'guards'->'never_say','[]'::jsonb)) > 0 or
         coalesce(p_atom->'guards'->>'role_framing','') <> '') then

      select * into v_guard from guards where atom_id = v_atom;
      v_had_guard := found;
      if v_had_guard then
        v_ops := v_ops || jsonb_build_object(
          'op', 'restore', 'table', 'guards', 'id', v_guard.id,
          'data', jsonb_build_object(
            'must_say', v_guard.must_say,
            'never_say', v_guard.never_say,
            'role_framing', v_guard.role_framing,
            'probes', v_guard.probes));
      end if;

      perform write_atom_extras(
        v_atom, jsonb_build_object('guards', p_atom->'guards'), null);

      if not v_had_guard then
        select id into v_id from guards where atom_id = v_atom;
        v_ops := v_ops || jsonb_build_object(
          'op', 'delete', 'table', 'guards', 'id', v_id, 'data', null);
      end if;
    end if;

  else
    raise exception '不认识的入库意图：%', p_intent;
  end if;

  update drafts set review_status = 'accepted', updated_at = now()
   where id = p_draft_id;

  insert into undo_log (chat_message_id, draft_id, inverse_ops)
  values (p_chat_message_id, p_draft_id, v_ops)
  returning id into v_undo;

  return jsonb_build_object('atom_id', v_atom, 'undo_id', v_undo);
end $$;
