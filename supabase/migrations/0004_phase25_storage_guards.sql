drop index if exists public.script_audios_script_id_voice_id_cache_key_key;

create unique index if not exists script_audios_script_id_cache_key_null_voice_key
on public.script_audios (script_id, cache_key)
where voice_id is null;

create unique index if not exists script_audios_script_id_voice_id_cache_key_present_key
on public.script_audios (script_id, voice_id, cache_key)
where voice_id is not null;

drop policy if exists "voices_crud_own" on public.voices;

create policy "voices_select_own"
on public.voices
for select
using (auth.uid() = user_id);

create policy "voices_delete_own"
on public.voices
for delete
using (auth.uid() = user_id);

create policy "voices_insert_own"
on public.voices
for insert
with check (
  auth.uid() = user_id
  and (
    consent_id is null
    or exists (
      select 1
      from public.voice_consents
      where voice_consents.id = voices.consent_id
        and voice_consents.user_id = auth.uid()
    )
  )
);

create policy "voices_update_own"
on public.voices
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    consent_id is null
    or exists (
      select 1
      from public.voice_consents
      where voice_consents.id = voices.consent_id
        and voice_consents.user_id = auth.uid()
    )
  )
);

drop policy if exists "script_audios_insert_own" on public.script_audios;
create policy "script_audios_insert_own"
on public.script_audios
for insert
with check (
  exists (
    select 1
    from public.scripts
    where scripts.id = script_audios.script_id
      and scripts.user_id = auth.uid()
  )
  and (
    script_audios.voice_id is null
    or exists (
      select 1
      from public.voices
      where voices.id = script_audios.voice_id
        and voices.user_id = auth.uid()
    )
  )
);

drop policy if exists "script_audios_update_own" on public.script_audios;
create policy "script_audios_update_own"
on public.script_audios
for update
using (
  exists (
    select 1
    from public.scripts
    where scripts.id = script_audios.script_id
      and scripts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.scripts
    where scripts.id = script_audios.script_id
      and scripts.user_id = auth.uid()
  )
  and (
    script_audios.voice_id is null
    or exists (
      select 1
      from public.voices
      where voices.id = script_audios.voice_id
        and voices.user_id = auth.uid()
    )
  )
);
