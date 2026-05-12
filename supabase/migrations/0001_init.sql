create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  consented_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_voice_id text not null,
  label text not null,
  sample_audio_path text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null,
  target_seconds integer not null default 60,
  locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.script_audios (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts (id) on delete cascade,
  provider text not null,
  cache_key text not null,
  storage_path text not null,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  unique (script_id, cache_key)
);

create table if not exists public.takes (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_path text not null,
  duration_seconds integer,
  status text not null default 'pending',
  score numeric,
  total_words integer,
  created_at timestamptz not null default now()
);

create table if not exists public.weak_words (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null references public.takes (id) on delete cascade,
  word text not null,
  score numeric,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_feedback (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null unique references public.takes (id) on delete cascade,
  locale text not null default 'ja',
  summary text not null,
  bullets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_locale_idx on public.profiles (locale);
create index if not exists voice_consents_user_id_idx on public.voice_consents (user_id);
create index if not exists voices_user_id_idx on public.voices (user_id);
create index if not exists scripts_user_id_updated_at_idx on public.scripts (user_id, updated_at desc);
create index if not exists script_audios_script_id_idx on public.script_audios (script_id);
create index if not exists takes_user_id_created_at_idx on public.takes (user_id, created_at desc);
create index if not exists weak_words_take_id_idx on public.weak_words (take_id);

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_scripts on public.scripts;
create trigger set_updated_at_scripts
before update on public.scripts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, locale)
  values (new.id, 'en-US')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.voice_consents enable row level security;
alter table public.voices enable row level security;
alter table public.scripts enable row level security;
alter table public.script_audios enable row level security;
alter table public.takes enable row level security;
alter table public.weak_words enable row level security;
alter table public.coach_feedback enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "voice_consents_crud_own" on public.voice_consents;
create policy "voice_consents_crud_own"
on public.voice_consents
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "voices_crud_own" on public.voices;
create policy "voices_crud_own"
on public.voices
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "scripts_crud_own" on public.scripts;
create policy "scripts_crud_own"
on public.scripts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "script_audios_read_own" on public.script_audios;
create policy "script_audios_read_own"
on public.script_audios
for select
using (
  exists (
    select 1
    from public.scripts
    where scripts.id = script_audios.script_id
      and scripts.user_id = auth.uid()
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
);

drop policy if exists "script_audios_delete_own" on public.script_audios;
create policy "script_audios_delete_own"
on public.script_audios
for delete
using (
  exists (
    select 1
    from public.scripts
    where scripts.id = script_audios.script_id
      and scripts.user_id = auth.uid()
  )
);

drop policy if exists "takes_crud_own" on public.takes;
create policy "takes_crud_own"
on public.takes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "weak_words_read_own" on public.weak_words;
create policy "weak_words_read_own"
on public.weak_words
for select
using (
  exists (
    select 1
    from public.takes
    where takes.id = weak_words.take_id
      and takes.user_id = auth.uid()
  )
);

drop policy if exists "weak_words_insert_own" on public.weak_words;
create policy "weak_words_insert_own"
on public.weak_words
for insert
with check (
  exists (
    select 1
    from public.takes
    where takes.id = weak_words.take_id
      and takes.user_id = auth.uid()
  )
);

drop policy if exists "coach_feedback_read_own" on public.coach_feedback;
create policy "coach_feedback_read_own"
on public.coach_feedback
for select
using (
  exists (
    select 1
    from public.takes
    where takes.id = coach_feedback.take_id
      and takes.user_id = auth.uid()
  )
);

drop policy if exists "coach_feedback_write_own" on public.coach_feedback;
create policy "coach_feedback_write_own"
on public.coach_feedback
for insert
with check (
  exists (
    select 1
    from public.takes
    where takes.id = coach_feedback.take_id
      and takes.user_id = auth.uid()
  )
);
