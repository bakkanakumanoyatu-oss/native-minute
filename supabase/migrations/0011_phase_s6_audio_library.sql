create table if not exists public.script_saved_model_audios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  script_id uuid not null references public.scripts (id) on delete cascade,
  script_audio_id uuid not null references public.script_audios (id) on delete cascade,
  slot smallint not null,
  label text not null,
  source text not null default 'listen',
  metadata jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint script_saved_model_audios_slot_check check (slot between 1 and 5),
  constraint script_saved_model_audios_label_check check (char_length(label) between 1 and 80),
  constraint script_saved_model_audios_source_check check (source in ('listen', 'script_detail')),
  constraint script_saved_model_audios_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint script_saved_model_audios_user_script_slot_key unique (user_id, script_id, slot),
  constraint script_saved_model_audios_user_script_audio_key unique (user_id, script_id, script_audio_id)
);

create table if not exists public.script_saved_best_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  script_id uuid not null references public.scripts (id) on delete cascade,
  take_id uuid not null references public.takes (id) on delete cascade,
  slot smallint not null,
  label text not null,
  source text not null default 'review',
  metadata jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint script_saved_best_takes_slot_check check (slot between 1 and 5),
  constraint script_saved_best_takes_label_check check (char_length(label) between 1 and 80),
  constraint script_saved_best_takes_source_check check (source in ('review', 'progress', 'script_detail')),
  constraint script_saved_best_takes_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint script_saved_best_takes_user_script_slot_key unique (user_id, script_id, slot),
  constraint script_saved_best_takes_user_script_take_key unique (user_id, script_id, take_id)
);

create index if not exists script_saved_model_audios_user_script_slot_idx
  on public.script_saved_model_audios (user_id, script_id, slot);

create index if not exists script_saved_model_audios_script_audio_id_idx
  on public.script_saved_model_audios (script_audio_id);

create index if not exists script_saved_best_takes_user_script_slot_idx
  on public.script_saved_best_takes (user_id, script_id, slot);

create index if not exists script_saved_best_takes_take_id_idx
  on public.script_saved_best_takes (take_id);

alter table public.script_saved_model_audios enable row level security;
alter table public.script_saved_best_takes enable row level security;

drop policy if exists "script_saved_model_audios_select_own" on public.script_saved_model_audios;
create policy "script_saved_model_audios_select_own"
on public.script_saved_model_audios
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "script_saved_best_takes_select_own" on public.script_saved_best_takes;
create policy "script_saved_best_takes_select_own"
on public.script_saved_best_takes
for select
to authenticated
using (auth.uid() = user_id);
