-- =============================================================
-- Proofly · 12 随手记粘贴的图片 (Step 3 新增)
--
-- 私有桶 chat-images，路径约定 {user_id}/{uuid}-{filename}，
-- 隔离方式与 source-docs 一致：路径第一段必须等于 auth.uid()。
--
-- 单独一个桶而不是塞进 source-docs：那个桶装的是「原始材料」，
-- 有一天要做「这条经历出自哪份文档」的溯源。聊天里随手粘的一张截图
-- 不是那个东西，混在一起会让溯源列表里全是碎图。
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-images', 'chat-images', false, 10485760)   -- 10 MB
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists chat_images_select on storage.objects;
drop policy if exists chat_images_insert on storage.objects;
drop policy if exists chat_images_update on storage.objects;
drop policy if exists chat_images_delete on storage.objects;

create policy chat_images_select on storage.objects for select
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy chat_images_insert on storage.objects for insert
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy chat_images_update on storage.objects for update
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy chat_images_delete on storage.objects for delete
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
