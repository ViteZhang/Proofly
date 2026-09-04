-- =============================================================
-- Proofly · 官网内测候补名单 + 产品路径迁移
--
-- 官网落在 /，产品整体挪到 /app 之下。两件事一起处理：
--   1. waitlist：官网 CTA 收到的邮箱要有地方落
--   2. resolve_link：体检写进 check_results 的「去解决」链接是
--      带 query 的完整路径，库里已有的那批还指着老地址
-- =============================================================

-- ---- 1. 候补名单 ----
--
-- 这张表跟其余 23 张不一样：它没有 user_id。留邮箱的人还没有账号，
-- 那正是他要账号的原因。所以 RLS 的写法也不同 —— 见下面。
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  -- 入库前统一转小写去空格（见 joinWaitlist），所以这里可以直接 unique。
  -- 同一个邮箱再提交一次是 on conflict do nothing，不报错也不重复。
  email text not null unique
    check (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  -- 以后可能有别的入口（邀请码、活动页），先留着好归因
  source text not null default 'site',
  -- 发过邀请的打上时间，没发的是 null。批量发邀请时按 created_at 排。
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_pending_idx
  on waitlist (created_at) where invited_at is null;

alter table waitlist enable row level security;

-- 只给 insert，不给 select。
--
-- 匿名访客必须能写，否则官网的 CTA 就是个摆设；但绝不能给 select ——
-- anon key 是公开的，给了 select 等于把整份名单挂在网上随便拉。
-- 名单只能从 SQL 编辑器或 service role 读，产品代码里不读它。
drop policy if exists site_insert on waitlist;
create policy site_insert on waitlist
  for insert to anon, authenticated with check (true);

-- ---- 2. 已有的「去解决」链接跟着搬 ----
--
-- 体检每扫一次是删了重写，所以下次扫描会自己写对；但在那之前
-- 用户点开体检页，每条「去解决」都是 404。这一句把存量补上。
update check_results
   set resolve_link = '/app' || resolve_link
 where resolve_link like '/%'
   and resolve_link not like '/app/%'
   and resolve_link !~ '^/app($|[?#])';
