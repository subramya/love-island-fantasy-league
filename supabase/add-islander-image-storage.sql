insert into storage.buckets (id, name, public)
values ('islander-images', 'islander-images', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public can view islander images" on storage.objects;
create policy "Public can view islander images"
on storage.objects
for select
using (bucket_id = 'islander-images');

drop policy if exists "Public can upload islander images" on storage.objects;
create policy "Public can upload islander images"
on storage.objects
for insert
with check (bucket_id = 'islander-images');

drop policy if exists "Public can update islander images" on storage.objects;
create policy "Public can update islander images"
on storage.objects
for update
using (bucket_id = 'islander-images')
with check (bucket_id = 'islander-images');
