create table if not exists public.processing_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null,
  consent_version text not null,
  purpose_id text not null,
  purpose_version text not null,
  provider_set text[] not null,
  data_categories text[] not null,
  status text not null default 'active',
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processing_consents_type_check check (
    consent_type in ('pronunciation_processing', 'voice_cloning')
  ),
  constraint processing_consents_status_check check (
    status in ('active', 'withdrawn')
  ),
  constraint processing_consents_provider_set_check check (
    cardinality(provider_set) > 0
  ),
  constraint processing_consents_data_categories_check check (
    cardinality(data_categories) > 0
  ),
  constraint processing_consents_withdrawal_check check (
    (status = 'active' and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null and withdrawn_at >= accepted_at)
  )
);

comment on table public.processing_consents is
  'Canonical, versioned affirmative consent records for pronunciation processing and voice cloning. Legacy voice_consents rows are preserved and are not backfilled into this table.';

comment on column public.processing_consents.provider_set is
  'Canonical provider disclosure set only. Do not store provider credentials, provider response bodies, IDs, or private paths.';

comment on column public.processing_consents.data_categories is
  'Narrow consent-scoped categories only. Do not store raw audio, transcript text, provider payloads, or storage object paths.';

create or replace function public.validate_processing_consent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id
      or new.user_id <> old.user_id
      or new.consent_type <> old.consent_type
      or new.consent_version <> old.consent_version
      or new.purpose_id <> old.purpose_id
      or new.purpose_version <> old.purpose_version
      or new.provider_set <> old.provider_set
      or new.data_categories <> old.data_categories
      or new.accepted_at <> old.accepted_at
      or new.created_at <> old.created_at
      or old.status = 'withdrawn'
      or old.status <> 'active'
      or new.status <> 'withdrawn' then
      raise exception 'processing consent records are append-only except for withdrawal';
    end if;

    -- Audit timestamps are database-authored. A client-provided withdrawal
    -- timestamp is deliberately ignored, while accepted/created timestamps
    -- remain immutable through the checks above.
    new.withdrawn_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- Never accept client-supplied audit timestamps as the canonical record.
  new.accepted_at := now();
  new.created_at := now();
  new.updated_at := now();

  if new.status <> 'active' or new.withdrawn_at is not null then
    raise exception 'new processing consent must be active';
  end if;

  if new.consent_type = 'pronunciation_processing' and (
    new.consent_version <> '2026-08-22.v1'
    or new.purpose_id <> 'pronunciation_processing'
    or new.purpose_version <> 'v1'
    or new.provider_set <> array['openai', 'azure']
    or new.data_categories <> array['recorded_audio', 'transcript', 'pronunciation_result']
  ) then
    raise exception 'invalid pronunciation processing consent contract';
  end if;

  if new.consent_type = 'voice_cloning' and (
    new.consent_version <> '2026-08-22.v1'
    or new.purpose_id <> 'voice_cloning'
    or new.purpose_version <> 'v1'
    or new.provider_set <> array['elevenlabs']
    or new.data_categories <> array['voice_sample', 'consent_recording', 'cloned_voice', 'reference_audio']
  ) then
    raise exception 'invalid voice cloning consent contract';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_processing_consent on public.processing_consents;
create trigger validate_processing_consent
  before insert or update on public.processing_consents
  for each row
  execute function public.validate_processing_consent();

create index if not exists processing_consents_user_type_accepted_at_idx
  on public.processing_consents (user_id, consent_type, accepted_at desc);

create index if not exists processing_consents_current_lookup_idx
  on public.processing_consents (user_id, consent_type, consent_version, status, accepted_at desc);

drop trigger if exists set_updated_at_processing_consents on public.processing_consents;

alter table public.processing_consents enable row level security;

drop policy if exists "processing_consents_crud_own" on public.processing_consents;
create policy "processing_consents_select_own"
  on public.processing_consents
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "processing_consents_insert_own"
  on public.processing_consents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "processing_consents_withdraw_own"
  on public.processing_consents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
