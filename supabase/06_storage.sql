-- =============================================================
-- Proofly · 06 文件存储 (Step 2 新增)
-- 私有桶 source-docs，路径约定 {user_id}/{uuid}-{filename}
-- 靠路径第一段等于 auth.uid() 做隔离，别人的文件读不到也删不掉。
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('source-docs', 'source-docs', false, 26214400)   -- 25 MB
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists source_docs_select on storage.objects;
drop policy if exists source_docs_insert on storage.objects;
drop policy if exists source_docs_update on storage.objects;
drop policy if exists source_docs_delete on storage.objects;

create policy source_docs_select on storage.objects for select
  using (bucket_id = 'source-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_insert on storage.objects for insert
  with check (bucket_id = 'source-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_update on storage.objects for update
  using (bucket_id = 'source-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'source-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_delete on storage.objects for delete
  using (bucket_id = 'source-docs' and (storage.foldername(name))[1] = auth.uid()::text);
