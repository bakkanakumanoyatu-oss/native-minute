insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-consents',
  'voice-consents',
  false,
  10485760,
  array[
    'audio/webm',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/mpeg',
    'audio/ogg',
    'audio/aac',
    'audio/flac'
  ]
)
on conflict (id) do nothing;

drop policy if exists "voice-consents_select_own" on storage.objects;
create policy "voice-consents_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'voice-consents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "voice-consents_insert_own" on storage.objects;
create policy "voice-consents_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'voice-consents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "voice-consents_update_own" on storage.objects;
create policy "voice-consents_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'voice-consents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'voice-consents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "voice-consents_delete_own" on storage.objects;
create policy "voice-consents_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'voice-consents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
