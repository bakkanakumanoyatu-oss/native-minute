insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'script-audios',
  'script-audios',
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

drop policy if exists "script-audios_select_own" on storage.objects;
create policy "script-audios_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'script-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "script-audios_insert_own" on storage.objects;
create policy "script-audios_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'script-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "script-audios_update_own" on storage.objects;
create policy "script-audios_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'script-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'script-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "script-audios_delete_own" on storage.objects;
create policy "script-audios_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'script-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.script_audios
add column if not exists stored_asset jsonb not null default '{}'::jsonb;
