-- =============================================================
-- Proofly · 46 基本信息四表
--
-- 起因：profile_facts 的 key 里没有学历。JD 写「本科及以上」时，评估
-- 在事实层找不到任何可对应的东西，只能判成缺口，再排一条「获得本科学历
-- · 1440 小时」的任务 —— 一条永远关不掉的任务，还顺手压低了这个方向
-- 的分。这不是体验问题，是一个所有候选人都有答案的维度上的必然错答。
--
-- 为什么学历不塞进 profile_facts：它天然多条、有起止时间、要独立的证据
-- 等级。KV 表存多条得靠 key 后缀（education_1 / education_2），那样既
-- 查不了也约束不住。
--
-- 证据等级在这三张表里只允许 measured | absent 两档。学历没有中间态 ——
-- 要么可验证要么不可。硬套四档会让 estimated / designed_only 在这里语义
-- 落空，反过来污染四档框架本身。
-- =============================================================

-- ---------------- 教育经历 ----------------
create table if not exists educations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  school text not null,
  major text,
  degree text
    check (degree is null or degree in ('doctor','master','bachelor','associate','vocational','other')),
  is_full_time boolean not null default true,
  period_start date,
  period_end date,                              -- null = 在读
  status text not null default 'graduated'
    check (status in ('graduated','in_progress','withdrawn')),
  evidence_level text not null default 'absent'
    check (evidence_level in ('measured','absent')),
  credential_note text,                         -- 「学信网可查」「海外学历认证编号 …」
  highlights jsonb default '[]'::jsonb,         -- 主修课程 / 奖项 / 排名。Phase 1 只存，不参与任何计算
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------- 任职履历 ----------------
--
-- 现在公司起止只能由该公司名下所有 atom 的 period 聚合得出。但「在职却
-- 没有可写项目」的那几个月会被整段吞掉，导出的简历日期因此偏窄 ——
-- 那是一份错的简历。这张表把「哪家公司、什么职位、几月到几月」独立存住。
create table if not exists employments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  org text not null,
  title text,
  city text,
  employment_type text not null default 'fulltime'
    check (employment_type in ('fulltime','intern','contract','freelance')),
  period_start date not null,
  period_end date,                              -- null = 至今
  entity_note text,                             -- 对外披露口径：主体与对外品牌不一致时怎么说
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------- 证书 / 语言 / 作品 ----------------
create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'certificate'
    check (kind in ('certificate','language','award','publication','link')),
  name text not null,
  issuer text,
  level text,
  issued_at date,
  expires_at date,
  identifier text,                              -- 证书编号
  url text,
  evidence_level text not null default 'absent'
    check (evidence_level in ('measured','absent')),
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------- 账户层 ----------------
--
-- user_profiles 在 24_billing 里已经建过了，这里只补两列，不重建。
--
-- 账户展示名直接用现成的 nickname，不另开 display_name：两个都叫「显示
-- 名」的列必然漂移，而这份文档要治的正是这类漂移。它与档案姓名
-- （profile_facts.key='name'）是两码事 —— 共用一个字段的下场是一份印着
-- 网名的简历，对一个主张「不编造」的产品，这是最难看的一种失败。
--
-- 写权限沿用 24 的做法：RLS 管不到列，靠列级 GRANT 兜。多放开两列，
-- signup_grant_issued 这类列客户端仍然改不了。
alter table user_profiles add column if not exists avatar_kind text not null default 'initial';
alter table user_profiles add column if not exists avatar_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_avatar_kind_check'
  ) then
    alter table user_profiles add constraint user_profiles_avatar_kind_check
      check (avatar_kind in ('initial','color','upload'));   -- upload 预留，本期不实现
  end if;
end $$;

grant update (nickname, avatar_kind, avatar_color) on user_profiles to authenticated;

-- ---------------- 索引 ----------------
create index if not exists educations_user_idx  on educations (user_id, sort_order, period_start desc);
create index if not exists employments_user_idx on employments (user_id, period_start desc);
create index if not exists credentials_user_idx on credentials (user_id, kind, sort_order);

-- ---------------- updated_at 触发器 ----------------
do $$
declare t text;
begin
  foreach t in array array['educations','employments','credentials']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------- RLS ----------------
do $$
declare t text;
begin
  foreach t in array array['educations','employments','credentials']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_select on %I;', t);
    execute format('drop policy if exists own_insert on %I;', t);
    execute format('drop policy if exists own_update on %I;', t);
    execute format('drop policy if exists own_delete on %I;', t);
    execute format('create policy own_select on %I for select using (user_id = auth.uid());', t);
    execute format('create policy own_insert on %I for insert with check (user_id = auth.uid());', t);
    execute format('create policy own_update on %I for update using (user_id = auth.uid())
                      with check (user_id = auth.uid());', t);
    execute format('create policy own_delete on %I for delete using (user_id = auth.uid());', t);
  end loop;
end $$;

-- 账户表只该有 select + 受限的 update。这里显式再删一遍 insert / delete
-- 策略：删掉自己那行 user_profiles 就等于把 signup_grant_issued 清零，
-- 注册赠送可以反复领。
drop policy if exists own_insert on user_profiles;
drop policy if exists own_delete on user_profiles;
revoke insert, delete on user_profiles from anon, authenticated;

-- 账户设置的唯一写入口。
--
-- 不给客户端 insert 权限（那样能删了再建，等于把 signup_grant_issued
-- 清零），但历史账号可能压根没有 user_profiles 那一行 —— 一个只能
-- update 的路径会让这些人存不下自己的名字，且看不到任何解释。
-- 用 SECURITY DEFINER 收口：只认 auth.uid()，只写这三列。
create or replace function set_account_profile(
  p_display_name text,
  p_avatar_color text
) returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未登录';
  end if;
  if length(coalesce(p_display_name, '')) > 40 then
    raise exception '显示名最多 40 字';
  end if;

  insert into user_profiles (user_id, nickname, avatar_kind, avatar_color)
  values (v_user, nullif(btrim(coalesce(p_display_name, '')), ''), 'color', p_avatar_color)
  on conflict (user_id) do update
    set nickname = excluded.nickname,
        avatar_kind = excluded.avatar_kind,
        avatar_color = excluded.avatar_color;
end $$;

revoke all on function set_account_profile(text, text) from public, anon;
grant execute on function set_account_profile(text, text) to authenticated;
