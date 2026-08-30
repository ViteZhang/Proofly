-- =============================================================
-- Proofly · 13 随手记的入库与撤销 (Step 3 新增)
--
-- 复用 09 的 insert_atom / write_atom_extras / upsert_skill —— 建一条新经历
-- 该干的事一模一样，没有理由写第二份。
--
-- 但 UPDATE 这条路要多做一件 09 不做的事：把「反向操作」一并记下来。
-- 六秒内可撤销意味着入库时就得知道怎么退回去，事后再猜是猜不出来的
-- （哪条指标是这次插的？待补项原来有几项？）。所以入库和写 undo_log
-- 必须在同一个事务里 —— plpgsql 函数天然就是。
--
-- security invoker：走调用者的 RLS，改不了别人的库。
-- 证明度依旧不在这里算，那是 03 的触发器的事。
-- =============================================================

-- -------------------------------------------------------------
-- 入库。返回 {atom_id, undo_id}
-- -------------------------------------------------------------
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

    -- 只改 diff 点名的字段（与 09 同一份白名单）
    for d in select * from jsonb_array_elements(coalesce(p_atom->'_diff', '[]'::jsonb)) loop
      if d->>'type' in ('field_change','status_change') then
        case d->>'field'
          when 'status'    then update atoms set status = p_atom->>'status' where id = v_atom;
          when 'situation' then update atoms set situation = nullif(p_atom->>'situation','') where id = v_atom;
          when 'task'      then update atoms set task = nullif(p_atom->>'task','') where id = v_atom;
          when 'role'      then update atoms set role = nullif(p_atom->>'role','') where id = v_atom;
          when 'org'       then update atoms set org = nullif(p_atom->>'org','') where id = v_atom;
          when 'actions'   then update atoms set actions = coalesce(p_atom->'actions','[]'::jsonb) where id = v_atom;
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

-- -------------------------------------------------------------
-- 撤销。按 inverse_ops 逆序执行，整体一个事务。
--
-- 过期或已撤销一律拒绝（验收 33/34）：按钮消失只是界面上的事，
-- 接口自己也必须拦，否则手工调一次就绕过去了。
-- -------------------------------------------------------------
create or replace function undo_chat(p_undo_id uuid) returns boolean
language plpgsql security invoker as $$
declare
  v_row undo_log%rowtype;
  op jsonb;
  v_table text;
begin
  select * into v_row from undo_log
   where id = p_undo_id and undone_at is null and expires_at > now()
   for update;
  if not found then return false; end if;

  for op in
    select e from jsonb_array_elements(coalesce(v_row.inverse_ops, '[]'::jsonb))
      with ordinality t(e, i)
    order by t.i desc            -- 逆序
  loop
    v_table := op->>'table';
    -- 白名单。inverse_ops 是一列普通 jsonb，用户改得动它；
    -- 虽然 RLS 保证只能碰自己的行，表名也不该由那一列说了算。
    if v_table not in ('atoms', 'metrics', 'atom_skills', 'guards') then
      raise exception '撤销记录里有不认识的表：%', v_table;
    end if;

    if op->>'op' = 'delete' then
      execute format('delete from %I where id = $1', v_table) using (op->>'id')::uuid;

    elsif op->>'op' = 'restore' and v_table = 'guards' then
      update guards set
        must_say     = coalesce(op->'data'->'must_say', '[]'::jsonb),
        never_say    = coalesce(op->'data'->'never_say', '[]'::jsonb),
        role_framing = op->'data'->>'role_framing',
        probes       = coalesce(op->'data'->'probes', '[]'::jsonb)
      where id = (op->>'id')::uuid;

    elsif op->>'op' = 'restore' then
      if v_table <> 'atoms' then
        raise exception '不支持恢复这张表的字段：%', v_table;
      end if;
      update atoms set
        status          = coalesce(op->'data'->>'status', status),
        situation       = op->'data'->>'situation',
        task            = op->'data'->>'task',
        role            = op->'data'->>'role',
        org             = op->'data'->>'org',
        actions         = coalesce(op->'data'->'actions', '[]'::jsonb),
        pending_metrics = coalesce(op->'data'->'pending_metrics', '[]'::jsonb)
      where id = (op->>'id')::uuid;

    else
      raise exception '撤销记录里有不认识的操作：%', op->>'op';
    end if;
  end loop;

  update undo_log set undone_at = now() where id = p_undo_id;
  -- 撤销之后这条草稿不能再算「已确认」，否则校对队列里它就永远消失了
  update drafts set review_status = 'rejected', updated_at = now()
   where id = v_row.draft_id;

  return true;
end $$;
