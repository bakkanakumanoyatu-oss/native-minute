insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  15728640,
  array[
    'audio/webm',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/mpeg',
    'audio/ogg'
  ]
)
on conflict (id) do nothing;

drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "recordings_insert_own" on storage.objects;
create policy "recordings_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "recordings_update_own" on storage.objects;
create policy "recordings_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
);
