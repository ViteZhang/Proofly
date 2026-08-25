-- =============================================================
-- Proofly · 09 草稿入库 (Step 2 新增)
--
-- 为什么写成数据库函数：入库必须在单个事务里完成。
-- 一条经历带着指标、护栏、技能、来源四张表，中途失败留半条数据
-- 比不入库糟得多。plpgsql 函数天然就是一个事务。
--
-- security invoker：走调用者的 RLS，写不进别人的库。
-- 证明度不在这里算——那是 03_triggers.sql 的事，重复算一定会算歪。
-- =============================================================

-- 技能同名复用，不新建。并发下靠 unique(user_id,label) 兜底。
create or replace function upsert_skill(p_label text) returns uuid
language plpgsql security invoker as $$
declare v_id uuid;
begin
  select id into v_id from skills where user_id = auth.uid() and label = p_label;
  if v_id is not null then return v_id; end if;
  insert into skills (label) values (p_label)
    on conflict (user_id, label) do update set updated_at = now()
    returning id into v_id;
  return v_id;
end $$;

-- 把 Pass 2 的 pending_metrics（字符串数组）转成 Step 1 的形状
create or replace function to_pending_shape(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    case when jsonb_typeof(e) = 'string'
         then jsonb_build_object('id', e #>> '{}', 'name', e #>> '{}', 'note', null)
         else e end
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e
$$;

-- 写一条经历的附属数据：指标 / 护栏 / 技能 / 来源
create or replace function write_atom_extras(
  p_atom_id uuid, p_atom jsonb, p_source_doc_id uuid
) returns void
language plpgsql security invoker as $$
declare m jsonb; s jsonb; g jsonb;
begin
  for m in select * from jsonb_array_elements(coalesce(p_atom->'metrics', '[]'::jsonb)) loop
    if coalesce(m->>'name', '') <> '' then
      insert into metrics (atom_id, name, kind, from_value, to_value, delta, evidence_level, method)
      values (p_atom_id, m->>'name',
              coalesce(nullif(m->>'kind',''), 'outcome'),
              nullif(m->>'from_value',''), nullif(m->>'to_value',''), nullif(m->>'delta',''),
              coalesce(nullif(m->>'evidence_level',''), 'measured'),
              nullif(m->>'method',''));
    end if;
  end loop;

  g := p_atom->'guards';
  if g is not null and (
       jsonb_array_length(coalesce(g->'must_say','[]'::jsonb)) > 0 or
       jsonb_array_length(coalesce(g->'never_say','[]'::jsonb)) > 0 or
       jsonb_array_length(coalesce(g->'probes','[]'::jsonb)) > 0 or
       coalesce(g->>'role_framing','') <> ''
     ) then
    insert into guards (atom_id, must_say, never_say, role_framing, probes)
    values (p_atom_id,
            coalesce(g->'must_say','[]'::jsonb), coalesce(g->'never_say','[]'::jsonb),
            nullif(g->>'role_framing',''), coalesce(g->'probes','[]'::jsonb))
    on conflict (atom_id) do update set
      must_say = excluded.must_say, never_say = excluded.never_say,
      role_framing = excluded.role_framing, probes = excluded.probes, updated_at = now();
  end if;

  for s in select * from jsonb_array_elements(coalesce(p_atom->'skills', '[]'::jsonb)) loop
    if coalesce(s #>> '{}', '') <> '' then
      insert into atom_skills (atom_id, skill_id)
      values (p_atom_id, upsert_skill(s #>> '{}'))
      on conflict (atom_id, skill_id) do nothing;
    end if;
  end loop;

  if p_source_doc_id is not null then
    insert into atom_sources (atom_id, source_doc_id, excerpt)
    values (p_atom_id, p_source_doc_id, nullif(p_atom->>'source_excerpt',''));
  end if;
end $$;

create or replace function insert_atom(
  p_atom jsonb, p_parent uuid, p_source_doc_id uuid
) returns uuid
language plpgsql security invoker as $$
declare v_id uuid; c jsonb; v_order int;
begin
  select coalesce(max(sort_order), 0) + 1 into v_order
  from atoms where user_id = auth.uid()
    and (parent_id is not distinct from p_parent);

  insert into atoms (parent_id, level, context, org, role, title,
                     period_start, period_end, situation, task, actions,
                     status, pending_metrics, sort_order)
  values (p_parent,
          coalesce(nullif(p_atom->>'level',''), 'project'),
          coalesce(nullif(p_atom->>'context',''), 'employment'),
          nullif(p_atom->>'org',''), nullif(p_atom->>'role',''), p_atom->>'title',
          case when coalesce(p_atom->>'period_start','') = '' then null
               else (p_atom->>'period_start' || '-01')::date end,
          case when coalesce(p_atom->>'period_end','') = '' then null
               else (p_atom->>'period_end' || '-01')::date end,
          nullif(p_atom->>'situation',''), nullif(p_atom->>'task',''),
          coalesce(p_atom->'actions', '[]'::jsonb),
          coalesce(nullif(p_atom->>'status',''), 'design_done'),
          to_pending_shape(p_atom->'pending_metrics'),
          v_order)
  returning id into v_id;

  perform write_atom_extras(v_id, p_atom, p_source_doc_id);

  -- 能力点：只允许两层，子级不再带 children
  for c in select * from jsonb_array_elements(coalesce(p_atom->'children', '[]'::jsonb)) loop
    if coalesce(c->>'title','') <> '' then
      perform insert_atom(
        jsonb_set(c - 'children', '{level}', '"capability_slice"'::jsonb),
        v_id, p_source_doc_id);
    end if;
  end loop;

  return v_id;
end $$;

-- =============================================================
-- 入口：确认一条草稿并写入事实层
-- =============================================================
create or replace function commit_draft(
  p_draft_id      uuid,
  p_atom          jsonb,
  p_intent        text,      -- CREATE | UPDATE
  p_target        uuid,
  p_parent        uuid,
  p_source_doc_id uuid,
  p_diff          jsonb default '[]'::jsonb,
  p_edited        boolean default false
) returns uuid
language plpgsql security invoker as $$
declare
  v_atom uuid; d jsonb; m jsonb; v_names text[]; v_pending jsonb;
begin
  if p_intent = 'CREATE' then
    v_atom := insert_atom(p_atom, p_parent, p_source_doc_id);

  elsif p_intent = 'UPDATE' then
    if p_target is null then
      raise exception '更新目标为空，这条不能入库';
    end if;
    v_atom := p_target;

    -- 只改 diff 点名的字段。白名单之外的一律不动，避免一次确认
    -- 把使用者手写的内容悄悄覆盖掉。
    for d in select * from jsonb_array_elements(coalesce(p_diff, '[]'::jsonb)) loop
      if d->>'type' in ('field_change','status_change') then
        case d->>'field'
          when 'status'     then update atoms set status = p_atom->>'status' where id = v_atom;
          when 'situation'  then update atoms set situation = nullif(p_atom->>'situation','') where id = v_atom;
          when 'task'       then update atoms set task = nullif(p_atom->>'task','') where id = v_atom;
          when 'role'       then update atoms set role = nullif(p_atom->>'role','') where id = v_atom;
          when 'org'        then update atoms set org = nullif(p_atom->>'org','') where id = v_atom;
          when 'actions'    then update atoms set actions = coalesce(p_atom->'actions','[]'::jsonb) where id = v_atom;
          when 'period_end' then update atoms set period_end =
                 case when coalesce(p_atom->>'period_end','') = '' then null
                      else (p_atom->>'period_end' || '-01')::date end
               where id = v_atom;
          else null;
        end case;
      end if;
    end loop;
    -- status_change 有时不填 field，单独兜一次
    if exists (select 1 from jsonb_array_elements(coalesce(p_diff,'[]'::jsonb)) e
               where e->>'type' = 'status_change')
       and coalesce(p_atom->>'status','') <> '' then
      update atoms set status = p_atom->>'status' where id = v_atom;
    end if;

    -- 只插入名字没出现过的指标，不重复堆同一个数
    select coalesce(array_agg(name), '{}') into v_names from metrics where atom_id = v_atom;
    for m in select * from jsonb_array_elements(coalesce(p_atom->'metrics','[]'::jsonb)) loop
      if coalesce(m->>'name','') <> '' and not (m->>'name' = any(v_names)) then
        insert into metrics (atom_id, name, kind, from_value, to_value, delta, evidence_level, method)
        values (v_atom, m->>'name',
                coalesce(nullif(m->>'kind',''), 'outcome'),
                nullif(m->>'from_value',''), nullif(m->>'to_value',''), nullif(m->>'delta',''),
                coalesce(nullif(m->>'evidence_level',''), 'measured'),
                nullif(m->>'method',''));
        v_names := v_names || (m->>'name');
      end if;
    end loop;

    -- 待补数据被真实数据填上了，就从清单里拿掉
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_pending
    from jsonb_array_elements(coalesce((select pending_metrics from atoms where id = v_atom), '[]'::jsonb)) e
    where coalesce(e->>'name', e #>> '{}') <> all(v_names);
    update atoms set pending_metrics = coalesce(v_pending, '[]'::jsonb) where id = v_atom;

    -- 技能与护栏照常合并，来源追加一条
    perform write_atom_extras(v_atom, p_atom - 'metrics', p_source_doc_id);

  else
    raise exception '不认识的入库意图：%', p_intent;
  end if;

  update drafts
     set review_status = case when p_edited then 'edited' else 'accepted' end,
         updated_at = now()
   where id = p_draft_id;

  return v_atom;
end $$;
