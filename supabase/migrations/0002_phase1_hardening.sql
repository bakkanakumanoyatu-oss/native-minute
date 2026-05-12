alter table public.voices
add column if not exists consent_id uuid references public.voice_consents (id) on delete set null;

create index if not exists voices_consent_id_idx on public.voices (consent_id);

alter table public.script_audios
add column if not exists voice_id uuid references public.voices (id) on delete set null;

alter table public.script_audios
drop constraint if exists script_audios_script_id_cache_key_key;

create unique index if not exists script_audios_script_id_voice_id_cache_key_key
on public.script_audios (script_id, voice_id, cache_key);

create index if not exists script_audios_voice_id_idx on public.script_audios (voice_id);

alter table public.takes
add column if not exists transcript_text text;

alter table public.takes
add column if not exists evaluation_payload jsonb not null default '{}'::jsonb;

alter table public.takes
add column if not exists coach_feedback_payload jsonb not null default '{}'::jsonb;

alter table public.takes
add column if not exists reviewed_at timestamptz;
