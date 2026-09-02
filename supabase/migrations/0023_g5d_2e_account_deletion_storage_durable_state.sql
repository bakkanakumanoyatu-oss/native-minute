-- G5D-2E: account-deletion-specific durable Storage authority.
-- Scope is exactly recordings, script-audios, voice-samples, and voice-consents.
-- No external Storage action, DB/anonymization stage, Auth action, account
-- completion, retention-period change, or live/Staging mutation is performed here.

alter table public.account_deletion_requests
  add column if not exists storage_snapshot_version text not null default 'g5d-2e.account-storage.v1',
  add column if not exists storage_snapshot_status text not null default 'pending',
  add column if not exists storage_snapshot_seal_version integer not null default 0,
  add column if not exists storage_snapshot_collection_token uuid,
  add column if not exists storage_snapshot_collection_started_at timestamptz,
  add column if not exists storage_snapshot_sealed_at timestamptz,
  add column if not exists storage_snapshot_fingerprint text,
  add column if not exists storage_snapshot_target_count integer not null default 0,
  add column if not exists storage_verified_absent_count integer not null default 0,
  add column if not exists storage_runner_attempt_count integer not null default 0,
  add column if not exists storage_runner_lease_token uuid,
  add column if not exists storage_runner_lease_expires_at timestamptz,
  add column if not exists storage_destructive_started_at timestamptz,
  add column if not exists storage_sub_finalized_at timestamptz,
  add column if not exists storage_locator_scrubbed_at timestamptz;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_storage_snapshot_version_check check (
    storage_snapshot_version = 'g5d-2e.account-storage.v1'
  ),
  add constraint account_deletion_requests_storage_snapshot_status_check check (
    storage_snapshot_status in ('pending', 'collecting', 'sealed')
  ),
  add constraint account_deletion_requests_storage_snapshot_counts_check check (
    storage_snapshot_seal_version >= 0
    and storage_snapshot_target_count >= 0
    and storage_verified_absent_count >= 0
    and storage_verified_absent_count <= storage_snapshot_target_count
    and storage_runner_attempt_count >= 0
  ),
  add constraint account_deletion_requests_storage_snapshot_shape_check check (
    (
      storage_snapshot_status = 'pending'
      and storage_snapshot_seal_version = 0
      and storage_snapshot_collection_token is null
      and storage_snapshot_collection_started_at is null
      and storage_snapshot_sealed_at is null
      and storage_snapshot_fingerprint is null
      and storage_snapshot_target_count = 0
      and storage_verified_absent_count = 0
      and storage_destructive_started_at is null
      and storage_sub_finalized_at is null
      and storage_locator_scrubbed_at is null
    )
    or (
      storage_snapshot_status = 'collecting'
      and storage_snapshot_seal_version = 0
      and storage_snapshot_collection_token is not null
      and storage_snapshot_collection_started_at is not null
      and storage_snapshot_sealed_at is null
      and storage_snapshot_fingerprint is null
      and storage_snapshot_target_count = 0
      and storage_verified_absent_count = 0
      and storage_destructive_started_at is null
      and storage_sub_finalized_at is null
      and storage_locator_scrubbed_at is null
    )
    or (
      storage_snapshot_status = 'sealed'
      and storage_snapshot_seal_version = 1
      and storage_snapshot_collection_token is null
      and storage_snapshot_collection_started_at is not null
      and storage_snapshot_sealed_at is not null
      and (storage_snapshot_fingerprint is not null or storage_locator_scrubbed_at is not null)
    )
  ),
  add constraint account_deletion_requests_storage_runner_lease_pair_check check (
    (storage_runner_lease_token is null and storage_runner_lease_expires_at is null)
    or (storage_runner_lease_token is not null and storage_runner_lease_expires_at is not null)
  ),
  add constraint account_deletion_requests_storage_sub_finalized_shape_check check (
    storage_sub_finalized_at is null
    or (
      storage_snapshot_status = 'sealed'
      and storage_cleanup_status in ('succeeded', 'not_needed')
      and storage_verified_absent_count = storage_snapshot_target_count
      and storage_locator_scrubbed_at = storage_sub_finalized_at
      and storage_snapshot_fingerprint is null
      and storage_runner_lease_token is null
      and storage_runner_lease_expires_at is null
    )
  );

create table public.account_deletion_storage_targets (
  id uuid primary key default gen_random_uuid(),
  deletion_request_id uuid not null,
  user_id uuid,
  target_kind text not null,
  storage_bucket text,
  storage_object_key text,
  target_fingerprint text,
  source_kind_summary text[] not null default '{}'::text[],
  source_refs jsonb,
  prefix_listed boolean not null default false,
  status text not null default 'pending',
  delete_outcome text not null default 'not_attempted',
  verification_status text not null default 'not_applicable',
  delete_attempt_count integer not null default 0,
  verification_attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_failure_category text,
  last_attempted_at timestamptz,
  delete_requested_at timestamptz,
  delete_succeeded_at timestamptz,
  verified_absent_at timestamptz,
  manual_required_at timestamptz,
  locator_scrubbed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_storage_targets_request_fkey
    foreign key (deletion_request_id) references public.account_deletion_requests(id) on delete cascade,
  constraint account_deletion_storage_targets_request_owner_fkey
    foreign key (deletion_request_id, user_id)
    references public.account_deletion_requests(id, user_id) on update cascade on delete cascade,
  constraint account_deletion_storage_targets_kind_check check (
    target_kind in ('recording', 'script_audio', 'voice_sample', 'voice_consent_recording')
  ),
  constraint account_deletion_storage_targets_kind_bucket_check check (
    locator_scrubbed_at is not null
    or (target_kind = 'recording' and storage_bucket = 'recordings')
    or (target_kind = 'script_audio' and storage_bucket = 'script-audios')
    or (target_kind = 'voice_sample' and storage_bucket = 'voice-samples')
    or (target_kind = 'voice_consent_recording' and storage_bucket = 'voice-consents')
  ),
  constraint account_deletion_storage_targets_status_check check (
    status in ('pending', 'delete_requested', 'verified_absent', 'manual_required')
  ),
  constraint account_deletion_storage_targets_delete_outcome_check check (
    delete_outcome in ('not_attempted', 'succeeded', 'timed_out', 'unavailable', 'rejected')
  ),
  constraint account_deletion_storage_targets_verification_status_check check (
    verification_status in ('not_applicable', 'pending', 'verified_absent', 'present', 'unavailable', 'manual_required')
  ),
  constraint account_deletion_storage_targets_attempt_counts_check check (
    delete_attempt_count in (0, 1) and verification_attempt_count >= 0
  ),
  constraint account_deletion_storage_targets_source_kind_check check (
    source_kind_summary <@ array[
      'take_audio', 'script_audio_stored_asset', 'voice_sample_path',
      'voice_consent_recording', 'write_intent'
    ]::text[]
  ),
  constraint account_deletion_storage_targets_source_refs_check check (
    source_refs is null or jsonb_typeof(source_refs) = 'array'
  ),
  constraint account_deletion_storage_targets_locator_shape_check check (
    (user_id is not null or locator_scrubbed_at is not null)
    and (
      locator_scrubbed_at is not null
      or (
        storage_bucket is not null
        and storage_object_key is not null and btrim(storage_object_key) = storage_object_key
        and storage_object_key <> '' and char_length(storage_object_key) <= 1024
        and target_fingerprint is not null and target_fingerprint <> ''
        and source_refs is not null
        and (prefix_listed or cardinality(source_kind_summary) > 0)
      )
    )
  ),
  constraint account_deletion_storage_targets_verified_absent_check check (
    status <> 'verified_absent'
    or (verification_status = 'verified_absent' and verified_absent_at is not null)
  ),
  constraint account_deletion_storage_targets_scrubbed_check check (
    locator_scrubbed_at is null
    or (
      status = 'verified_absent'
      and storage_bucket is null and storage_object_key is null
      and target_fingerprint is null and source_refs is null
    )
  )
);

comment on table public.account_deletion_storage_targets is
  'Server-only account-deletion Storage target authority. Raw bucket/key/source/fingerprint data is internal and scrubbed only by the focused Storage sub-finalizer.';

drop trigger if exists set_updated_at_account_deletion_storage_targets on public.account_deletion_storage_targets;
create trigger set_updated_at_account_deletion_storage_targets
  before update on public.account_deletion_storage_targets
  for each row execute function public.set_updated_at();

create unique index account_deletion_storage_targets_request_locator_unique_idx
  on public.account_deletion_storage_targets(deletion_request_id, storage_bucket, storage_object_key)
  where storage_bucket is not null and storage_object_key is not null;
create unique index account_deletion_storage_targets_request_fingerprint_unique_idx
  on public.account_deletion_storage_targets(deletion_request_id, target_fingerprint)
  where target_fingerprint is not null;
create index account_deletion_storage_targets_request_status_idx
  on public.account_deletion_storage_targets(deletion_request_id, status);
create index account_deletion_storage_targets_request_retry_idx
  on public.account_deletion_storage_targets(deletion_request_id, next_retry_at)
  where next_retry_at is not null;
create index account_deletion_requests_storage_runner_lease_idx
  on public.account_deletion_requests(storage_runner_lease_expires_at)
  where storage_runner_lease_token is not null;

alter table public.account_deletion_storage_targets enable row level security;
revoke all privileges on table public.account_deletion_storage_targets from public, anon, authenticated, service_role;
grant select on table public.account_deletion_storage_targets to service_role;

-- Recordings and script audios join the existing server-owned write-intent
-- boundary. Their public routes stay unchanged, but Storage mutation uses service
-- role only after a user-scoped reservation. Authenticated SELECT remains intact;
-- direct mutation is closed across all four account-deletion Storage buckets.
drop policy if exists "recordings_insert_own" on storage.objects;
drop policy if exists "recordings_update_own" on storage.objects;
drop policy if exists "recordings_delete_own" on storage.objects;
drop policy if exists "script-audios_insert_own" on storage.objects;
drop policy if exists "script-audios_update_own" on storage.objects;
drop policy if exists "script-audios_delete_own" on storage.objects;

alter table public.voice_asset_write_intents
  drop constraint voice_asset_write_intents_kind_check,
  drop constraint voice_asset_write_intents_shape_check;

alter table public.voice_asset_write_intents
  add constraint voice_asset_write_intents_kind_check check (
    kind in ('voice_create', 'script_audio_create', 'voice_sample_upload', 'voice_consent_upload', 'recording_upload')
  ),
  add constraint voice_asset_write_intents_shape_check check (
    (kind = 'voice_create'
      and script_id is null and voice_id is null and cache_key is null
      and storage_bucket is null and storage_object_key is null)
    or
    (kind = 'script_audio_create'
      and script_id is not null and voice_id is not null and nullif(cache_key, '') is not null
      and (
        (status in ('reserved', 'manual_required')
          and storage_bucket = 'script-audios' and nullif(storage_object_key, '') is not null)
        or
        (status in ('completed', 'cancelled')
          and storage_bucket is null and storage_object_key is null)
      ))
    or
    (kind = 'voice_sample_upload'
      and script_id is null and voice_id is null and cache_key is null
      and (
        (status in ('reserved', 'completed', 'manual_required')
          and storage_bucket = 'voice-samples' and nullif(storage_object_key, '') is not null)
        or
        (status = 'cancelled' and storage_bucket is null and storage_object_key is null)
      ))
    or
    (kind = 'voice_consent_upload'
      and script_id is null and voice_id is null and cache_key is null
      and (
        (status in ('reserved', 'completed', 'manual_required')
          and storage_bucket = 'voice-consents' and nullif(storage_object_key, '') is not null)
        or
        (status = 'cancelled' and storage_bucket is null and storage_object_key is null)
      ))
    or
    (kind = 'recording_upload'
      and script_id is not null and voice_id is null and cache_key is null
      and (
        (status in ('reserved', 'completed', 'manual_required')
          and storage_bucket = 'recordings' and nullif(storage_object_key, '') is not null)
        or
        (status = 'cancelled' and storage_bucket is null and storage_object_key is null)
      ))
  );

create or replace function public.reserve_voice_asset_write_intent(
  p_user_id uuid,
  p_kind text,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_script_id uuid default null,
  p_voice_id uuid default null,
  p_cache_key text default null,
  p_storage_bucket text default null,
  p_storage_object_key text default null
)
returns public.voice_asset_write_intents
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.voice_asset_write_intents;
  v_script_user_id uuid;
  v_voice_user_id uuid;
begin
  if p_user_id is null or p_kind not in (
    'voice_create', 'script_audio_create', 'voice_sample_upload', 'voice_consent_upload', 'recording_upload'
  ) or p_lease_token is null or p_lease_seconds < 1 or p_lease_seconds > 900 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid voice asset writer reservation';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(p_user_id);

  if exists (
    select 1 from public.voice_deletion_operations
    where user_id = p_user_id and status in ('pending', 'processing', 'partial_failure', 'manual_required')
  ) then
    raise exception using errcode = 'object_in_use', message = 'voice_deletion_active';
  end if;
  if exists (
    select 1 from public.account_deletion_requests
    where user_id = p_user_id and status in (
      'requested', 'confirmed', 'processing', 'provider_cleanup_failed',
      'storage_cleanup_failed', 'db_cleanup_failed', 'auth_cleanup_failed'
    )
  ) then
    raise exception using errcode = 'object_in_use', message = 'account_deletion_active';
  end if;
  if exists (
    select 1 from public.voice_asset_write_intents
    where user_id = p_user_id and status in ('reserved', 'manual_required')
  ) then
    raise exception using errcode = 'object_in_use', message = 'voice_asset_writer_in_progress';
  end if;

  if p_kind = 'voice_create' then
    if p_script_id is not null or p_voice_id is not null or p_cache_key is not null
      or p_storage_bucket is not null or p_storage_object_key is not null then
      raise exception using errcode = 'invalid_parameter_value', message = 'invalid voice create reservation shape';
    end if;
  elsif p_kind = 'script_audio_create' then
    select user_id into v_script_user_id from public.scripts where id = p_script_id;
    select user_id into v_voice_user_id from public.voices where id = p_voice_id;
    if v_script_user_id is distinct from p_user_id or v_voice_user_id is distinct from p_user_id
      or nullif(p_cache_key, '') is null or p_storage_bucket <> 'script-audios'
      or nullif(p_storage_object_key, '') is null
      or p_storage_object_key not like p_user_id::text || '/' || p_script_id::text || '/' || p_voice_id::text || '/%'
      or exists (select 1 from public.script_audios
        where script_id = p_script_id and voice_id = p_voice_id and cache_key = p_cache_key) then
      raise exception using errcode = 'invalid_parameter_value', message = 'invalid script audio writer reservation';
    end if;
  elsif p_kind = 'voice_sample_upload' then
    if p_script_id is not null or p_voice_id is not null or p_cache_key is not null
      or p_storage_bucket is distinct from 'voice-samples' or nullif(p_storage_object_key, '') is null
      or array_length(string_to_array(p_storage_object_key, '/'), 1) <> 3
      or split_part(p_storage_object_key, '/', 1) <> p_user_id::text
      or not exists (select 1 from public.voice_consents
        where user_id = p_user_id and id::text = split_part(p_storage_object_key, '/', 2)) then
      raise exception using errcode = 'invalid_parameter_value', message = 'invalid voice sample upload reservation';
    end if;
  elsif p_kind = 'voice_consent_upload' then
    if p_script_id is not null or p_voice_id is not null or p_cache_key is not null
      or p_storage_bucket is distinct from 'voice-consents' or nullif(p_storage_object_key, '') is null
      or array_length(string_to_array(p_storage_object_key, '/'), 1) <> 2
      or split_part(p_storage_object_key, '/', 1) <> p_user_id::text then
      raise exception using errcode = 'invalid_parameter_value', message = 'invalid voice consent upload reservation';
    end if;
  else
    select user_id into v_script_user_id from public.scripts where id = p_script_id;
    if v_script_user_id is distinct from p_user_id or p_voice_id is not null or p_cache_key is not null
      or p_storage_bucket is distinct from 'recordings' or nullif(p_storage_object_key, '') is null
      or array_length(string_to_array(p_storage_object_key, '/'), 1) <> 3
      or split_part(p_storage_object_key, '/', 1) <> p_user_id::text
      or split_part(p_storage_object_key, '/', 2) <> p_script_id::text then
      raise exception using errcode = 'invalid_parameter_value', message = 'invalid recording upload reservation';
    end if;
  end if;

  insert into public.voice_asset_write_intents (
    user_id, kind, lease_token, lease_expires_at, script_id, voice_id, cache_key, storage_bucket, storage_object_key
  ) values (
    p_user_id, p_kind, p_lease_token, now() + make_interval(secs => p_lease_seconds),
    p_script_id, p_voice_id, p_cache_key, p_storage_bucket, p_storage_object_key
  ) returning * into v_intent;
  return v_intent;
end;
$$;

create or replace function public.finalize_recording_upload_write_intent(
  p_intent_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_storage_object_key text
)
returns public.voice_asset_write_intents
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.voice_asset_write_intents;
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  select * into v_intent from public.voice_asset_write_intents
  where id = p_intent_id and user_id = p_user_id for update;

  if not found or v_intent.kind <> 'recording_upload' or v_intent.status <> 'reserved'
    or v_intent.lease_token is distinct from p_lease_token or v_intent.lease_expires_at <= now()
    or v_intent.storage_bucket <> 'recordings'
    or v_intent.storage_object_key is distinct from p_storage_object_key then
    raise exception using errcode = 'check_violation', message = 'recording upload writer finalization rejected';
  end if;

  update public.voice_asset_write_intents
  set status = 'completed', lease_token = null, lease_expires_at = null
  where id = p_intent_id returning * into v_intent;
  return v_intent;
end;
$$;

create or replace function public.account_deletion_storage_writer_fence_active(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1 from public.account_deletion_requests
    where user_id = p_user_id
      and storage_snapshot_status in ('collecting', 'sealed')
  );
$$;

create or replace function public.account_deletion_storage_source_inventory_fence_active(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1 from public.account_deletion_requests
    where user_id = p_user_id
      and storage_snapshot_status in ('collecting', 'sealed')
      and storage_sub_finalized_at is null
  );
$$;

create or replace function public.enforce_account_deletion_take_storage_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    if public.account_deletion_storage_source_inventory_fence_active(old.user_id) then
      raise exception using errcode = 'object_in_use', message = 'account deletion Storage source inventory fence is active';
    end if;
    return old;
  end if;
  if public.account_deletion_storage_writer_fence_active(new.user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_storage_writer_fence_active(old.user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion Storage writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_voice_storage_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    if public.account_deletion_storage_source_inventory_fence_active(old.user_id) then
      raise exception using errcode = 'object_in_use', message = 'account deletion Storage source inventory fence is active';
    end if;
    return old;
  end if;
  if public.account_deletion_storage_writer_fence_active(new.user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_storage_writer_fence_active(old.user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion Storage writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_script_audio_storage_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_new_user_id uuid; v_old_user_id uuid;
begin
  if tg_op = 'DELETE' then
    select user_id into v_old_user_id from public.scripts where id = old.script_id;
    if found and public.account_deletion_storage_source_inventory_fence_active(v_old_user_id) then
      raise exception using errcode = 'object_in_use', message = 'account deletion Storage source inventory fence is active';
    end if;
    return old;
  end if;
  select user_id into v_new_user_id from public.scripts where id = new.script_id;
  if not found or public.account_deletion_storage_writer_fence_active(v_new_user_id) then
    raise exception using errcode = 'object_in_use', message = 'account deletion Storage writer fence is active';
  end if;
  if tg_op = 'UPDATE' then
    select user_id into v_old_user_id from public.scripts where id = old.script_id;
    if public.account_deletion_storage_writer_fence_active(v_old_user_id) then
      raise exception using errcode = 'object_in_use', message = 'account deletion Storage writer fence is active';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_script_storage_source_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    if public.account_deletion_storage_source_inventory_fence_active(old.user_id) then
      raise exception using errcode = 'object_in_use', message = 'account deletion Storage source inventory fence is active';
    end if;
    return old;
  end if;
  if public.account_deletion_storage_writer_fence_active(new.user_id)
    or public.account_deletion_storage_writer_fence_active(old.user_id) then
    raise exception using errcode = 'object_in_use', message = 'account deletion Storage writer fence is active';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_account_deletion_take_storage_writer_fence on public.takes;
create trigger enforce_account_deletion_take_storage_writer_fence
  before insert or update of user_id, script_id, audio_path or delete on public.takes
  for each row execute function public.enforce_account_deletion_take_storage_writer_fence();
drop trigger if exists enforce_account_deletion_voice_consent_storage_writer_fence on public.voice_consents;
create trigger enforce_account_deletion_voice_consent_storage_writer_fence
  before insert or update of user_id, metadata or delete on public.voice_consents
  for each row execute function public.enforce_account_deletion_voice_storage_writer_fence();
drop trigger if exists enforce_account_deletion_voice_storage_writer_fence on public.voices;
create trigger enforce_account_deletion_voice_storage_writer_fence
  before insert or update of user_id, sample_audio_path or delete on public.voices
  for each row execute function public.enforce_account_deletion_voice_storage_writer_fence();
drop trigger if exists enforce_account_deletion_script_audio_storage_writer_fence on public.script_audios;
create trigger enforce_account_deletion_script_audio_storage_writer_fence
  before insert or update of script_id, stored_asset or delete on public.script_audios
  for each row execute function public.enforce_account_deletion_script_audio_storage_writer_fence();
drop trigger if exists enforce_account_deletion_script_storage_source_fence on public.scripts;
create trigger enforce_account_deletion_script_storage_source_fence
  before update of user_id or delete on public.scripts
  for each row execute function public.enforce_account_deletion_script_storage_source_fence();

create or replace function public.enforce_account_deletion_storage_parent_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mutation text := current_setting('native_minute.account_deletion_storage_mutation', true);
  v_status_changed boolean;
  v_snapshot_changed boolean;
  v_lease_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.storage_cleanup_status in ('succeeded', 'not_needed') then
      raise exception using errcode = 'check_violation', message = 'account deletion Storage terminal status is forbidden on insert';
    end if;
    return new;
  end if;

  v_status_changed := new.storage_cleanup_status is distinct from old.storage_cleanup_status;
  v_snapshot_changed := new.storage_snapshot_version is distinct from old.storage_snapshot_version
    or new.storage_snapshot_status is distinct from old.storage_snapshot_status
    or new.storage_snapshot_seal_version is distinct from old.storage_snapshot_seal_version
    or new.storage_snapshot_collection_token is distinct from old.storage_snapshot_collection_token
    or new.storage_snapshot_collection_started_at is distinct from old.storage_snapshot_collection_started_at
    or new.storage_snapshot_sealed_at is distinct from old.storage_snapshot_sealed_at
    or new.storage_snapshot_fingerprint is distinct from old.storage_snapshot_fingerprint
    or new.storage_snapshot_target_count is distinct from old.storage_snapshot_target_count;
  v_lease_changed := new.storage_runner_attempt_count is distinct from old.storage_runner_attempt_count
    or new.storage_runner_lease_token is distinct from old.storage_runner_lease_token
    or new.storage_runner_lease_expires_at is distinct from old.storage_runner_lease_expires_at;

  if v_status_changed and new.storage_cleanup_status in ('succeeded', 'not_needed')
    and v_mutation is distinct from 'finalize' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage terminal status requires focused finalization';
  end if;
  if v_snapshot_changed and (v_mutation is null or v_mutation not in ('begin_snapshot', 'seal', 'finalize')) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage snapshot requires focused authority';
  end if;
  if v_lease_changed and (v_mutation is null or v_mutation not in ('claim_lease', 'release_lease', 'finalize')) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage lease requires focused authority';
  end if;
  if new.storage_destructive_started_at is distinct from old.storage_destructive_started_at
    and v_mutation is distinct from 'begin_delete' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage destructive marker requires focused authority';
  end if;
  if new.storage_verified_absent_count is distinct from old.storage_verified_absent_count
    and (v_mutation is null or v_mutation not in ('record_verification', 'finalize')) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage verified count requires focused authority';
  end if;
  if (
    new.storage_sub_finalized_at is distinct from old.storage_sub_finalized_at
    or new.storage_locator_scrubbed_at is distinct from old.storage_locator_scrubbed_at
  ) and v_mutation is distinct from 'finalize' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage finalization requires focused authority';
  end if;
  if old.storage_snapshot_status = 'sealed' and v_snapshot_changed and v_mutation is distinct from 'finalize' then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage snapshot is immutable';
  end if;
  if old.storage_cleanup_status = 'manual_required' and v_status_changed then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage manual state is sticky';
  end if;
  if old.storage_destructive_started_at is not null
    and new.storage_destructive_started_at is distinct from old.storage_destructive_started_at then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage destructive marker is monotonic';
  end if;
  if old.storage_sub_finalized_at is not null and (
    v_status_changed or new.storage_verified_absent_count is distinct from old.storage_verified_absent_count
    or new.storage_sub_finalized_at is distinct from old.storage_sub_finalized_at
    or new.storage_locator_scrubbed_at is distinct from old.storage_locator_scrubbed_at
    or new.storage_runner_lease_token is not null or new.storage_runner_lease_expires_at is not null
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage sub-finalization is immutable';
  end if;
  if new.storage_snapshot_status = 'sealed'
    and new.storage_cleanup_status in ('succeeded', 'not_needed')
    and new.storage_sub_finalized_at is null then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage terminal status requires focused finalization';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_storage_target_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mutation text := current_setting('native_minute.account_deletion_storage_mutation', true);
  v_locator_changed boolean;
begin
  if new.deletion_request_id is distinct from old.deletion_request_id
    or new.target_kind is distinct from old.target_kind
    or new.prefix_listed is distinct from old.prefix_listed
    or new.source_kind_summary is distinct from old.source_kind_summary then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage target identity is immutable';
  end if;
  if new.user_id is distinct from old.user_id
    and not (old.locator_scrubbed_at is not null and new.user_id is null) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage target ownership is immutable';
  end if;

  v_locator_changed := new.storage_bucket is distinct from old.storage_bucket
    or new.storage_object_key is distinct from old.storage_object_key
    or new.target_fingerprint is distinct from old.target_fingerprint
    or new.source_refs is distinct from old.source_refs;

  if new.delete_attempt_count is distinct from old.delete_attempt_count and not (
    v_mutation = 'begin_delete' and old.delete_attempt_count = 0 and new.delete_attempt_count = 1
  ) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion Storage DELETE generation requires focused begin authority';
  end if;
  if old.status = 'manual_required' and (
    new.status is distinct from old.status or new.verification_status is distinct from old.verification_status
    or new.manual_required_at is distinct from old.manual_required_at or v_locator_changed
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage target manual state is sticky';
  end if;
  if old.locator_scrubbed_at is not null then
    if v_locator_changed or new.locator_scrubbed_at is distinct from old.locator_scrubbed_at
      or new.status is distinct from old.status or new.delete_outcome is distinct from old.delete_outcome
      or new.verification_status is distinct from old.verification_status
      or new.delete_attempt_count is distinct from old.delete_attempt_count
      or new.verification_attempt_count is distinct from old.verification_attempt_count
      or new.next_retry_at is distinct from old.next_retry_at
      or new.last_failure_category is distinct from old.last_failure_category then
      raise exception using errcode = 'check_violation', message = 'finalized account deletion Storage target is immutable';
    end if;
    return new;
  end if;
  if v_locator_changed and not (
    v_mutation = 'finalize' and new.status = 'verified_absent'
    and new.storage_bucket is null and new.storage_object_key is null
    and new.target_fingerprint is null and new.source_refs is null and new.locator_scrubbed_at is not null
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage locators can only transition to scrubbed';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_account_deletion_storage_parent_immutability on public.account_deletion_requests;
create trigger enforce_account_deletion_storage_parent_immutability
  before insert or update on public.account_deletion_requests
  for each row execute function public.enforce_account_deletion_storage_parent_immutability();
drop trigger if exists enforce_account_deletion_storage_target_immutability on public.account_deletion_storage_targets;
create trigger enforce_account_deletion_storage_target_immutability
  before update on public.account_deletion_storage_targets
  for each row execute function public.enforce_account_deletion_storage_target_immutability();

create or replace function public.begin_account_deletion_storage_snapshot(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_collection_token uuid
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null or p_expected_user_id is null or p_collection_token is null then
    raise exception using errcode = 'invalid_parameter_value', message = 'account deletion Storage collection identity is required';
  end if;
  perform public.g5c_b4_lock_voice_asset_user(p_expected_user_id);
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;

  if not found or v_request.status not in ('confirmed', 'storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_cleanup_status not in ('pending', 'failed')
    or v_request.storage_sub_finalized_at is not null then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage request is stale or not runnable';
  end if;
  if exists (select 1 from public.voice_asset_write_intents
    where user_id = p_expected_user_id and status in ('reserved', 'manual_required')) then
    raise exception using errcode = 'object_in_use', message = 'account deletion Storage seal blocked by writer intent';
  end if;
  if v_request.storage_snapshot_status = 'collecting' then
    return v_request;
  end if;
  if v_request.storage_snapshot_status <> 'pending'
    or exists (select 1 from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage reseal conflict';
  end if;

  perform set_config('native_minute.account_deletion_storage_mutation', 'begin_snapshot', true);
  update public.account_deletion_requests
  set storage_snapshot_status = 'collecting',
      storage_snapshot_collection_token = p_collection_token,
      storage_snapshot_collection_started_at = now(),
      storage_cleanup_status = 'pending', failure_stage = null, failure_reason_code = null,
      last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.seal_account_deletion_storage_snapshot(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_collection_token uuid,
  p_listed_inventory jsonb
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_target_count integer;
  v_fingerprint text;
begin
  if p_listed_inventory is null or jsonb_typeof(p_listed_inventory) <> 'object'
    or (select count(*) from jsonb_object_keys(p_listed_inventory)) <> 4
    or not (p_listed_inventory ?& array['recordings','script-audios','voice-samples','voice-consents'])
    or exists (select 1 from jsonb_each(p_listed_inventory) where jsonb_typeof(value) <> 'array') then
    raise exception using errcode = 'invalid_parameter_value', message = 'account deletion Storage inventory shape is invalid';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(p_expected_user_id);
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;
  if not found or v_request.storage_snapshot_status <> 'collecting'
    or v_request.status not in ('confirmed', 'storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_snapshot_collection_token is distinct from p_collection_token
    or v_request.storage_cleanup_status not in ('pending', 'failed')
    or v_request.storage_sub_finalized_at is not null
    or v_request.storage_destructive_started_at is not null
    or exists (select 1 from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage collection is stale or already sealed';
  end if;

  lock table public.takes in share row exclusive mode;
  lock table public.scripts in share row exclusive mode;
  lock table public.script_audios in share row exclusive mode;
  lock table public.voices in share row exclusive mode;
  lock table public.voice_consents in share row exclusive mode;
  lock table public.voice_asset_write_intents in share row exclusive mode;

  if exists (select 1 from public.voice_asset_write_intents
    where user_id = p_expected_user_id and status in ('reserved', 'manual_required')) then
    raise exception using errcode = 'object_in_use', message = 'account deletion Storage writer changed during collection';
  end if;

  -- Every listed key must be an exact object under the canonical owner prefix.
  if exists (
    select 1
    from jsonb_each(p_listed_inventory) as bucket_entry
    cross join lateral jsonb_array_elements_text(bucket_entry.value) as object_key(value)
    where object_key.value = '' or btrim(object_key.value) <> object_key.value
      or char_length(object_key.value) > 1024
      or split_part(object_key.value, '/', 1) <> p_expected_user_id::text
      or object_key.value like '/%' or object_key.value like '%/' or object_key.value like '%//%'
      or string_to_array(object_key.value, '/') && array['.','..']::text[]
  ) or exists (
    select 1 from (
      select bucket_entry.key, object_key.value, count(*)
      from jsonb_each(p_listed_inventory) as bucket_entry
      cross join lateral jsonb_array_elements_text(bucket_entry.value) as object_key(value)
      group by bucket_entry.key, object_key.value having count(*) > 1
    ) duplicates
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage listed ownership is malformed or ambiguous';
  end if;

  -- Canonical DB locators and completed writer locators are fail-closed. A
  -- listing omission never removes one of these sources from the target universe.
  if exists (select 1 from public.takes
      where user_id = p_expected_user_id and (
        audio_path not like 'storage://recordings/' || p_expected_user_id::text || '/%'
        or substr(audio_path, char_length('storage://recordings/') + 1) like '%//%'
      ))
    or exists (select 1 from public.script_audios audio join public.scripts script on script.id = audio.script_id
      where script.user_id = p_expected_user_id and (
        jsonb_typeof(audio.stored_asset) <> 'object'
        or audio.stored_asset ->> 'storageBucket' is distinct from 'script-audios'
        or nullif(audio.stored_asset ->> 'storageObjectKey', '') is null
        or audio.stored_asset ->> 'storageObjectKey' not like p_expected_user_id::text || '/%'
      ))
    or exists (select 1 from public.voices where user_id = p_expected_user_id
      and sample_audio_path is not null and (
        sample_audio_path not like 'storage://voice-samples/' || p_expected_user_id::text || '/%'
        or substr(sample_audio_path, char_length('storage://voice-samples/') + 1) like '%//%'
      ))
    or exists (select 1 from public.voice_consents where user_id = p_expected_user_id
      and metadata ? 'recording' and metadata -> 'recording' is not null and (
        jsonb_typeof(metadata -> 'recording') <> 'object'
        or jsonb_typeof(metadata -> 'recording' -> 'audioPath') is distinct from 'string'
        or metadata -> 'recording' ->> 'audioPath' not like 'storage://voice-consents/' || p_expected_user_id::text || '/%'
      ))
    or exists (select 1 from public.voice_asset_write_intents where user_id = p_expected_user_id
      and status = 'completed' and storage_object_key is not null and (
        storage_bucket not in ('recordings','script-audios','voice-samples','voice-consents')
        or storage_object_key not like p_expected_user_id::text || '/%'
      )) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage canonical locator is malformed';
  end if;

  -- Fail closed if any exact locator is attributed to both this user and another
  -- user anywhere in the canonical DB/write-intent source universe.
  if exists (
    with all_sources as (
      select user_id, 'recordings'::text bucket,
        substr(audio_path, char_length('storage://recordings/') + 1) object_key from public.takes
      union all
      select script.user_id, 'script-audios', audio.stored_asset ->> 'storageObjectKey'
        from public.script_audios audio join public.scripts script on script.id = audio.script_id
      union all
      select user_id, 'voice-samples', substr(sample_audio_path, char_length('storage://voice-samples/') + 1)
        from public.voices where sample_audio_path like 'storage://voice-samples/%'
      union all
      select user_id, 'voice-consents', substr(metadata -> 'recording' ->> 'audioPath', char_length('storage://voice-consents/') + 1)
        from public.voice_consents where metadata -> 'recording' ->> 'audioPath' like 'storage://voice-consents/%'
      union all
      select user_id, storage_bucket, storage_object_key from public.voice_asset_write_intents
        where status = 'completed' and storage_bucket is not null and storage_object_key is not null
    )
    select 1 from all_sources owned join all_sources other
      on other.bucket = owned.bucket and other.object_key = owned.object_key and other.user_id <> owned.user_id
    where owned.user_id = p_expected_user_id
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion Storage cross-user locator collision';
  end if;

  with listed as (
    select bucket_entry.key as bucket, object_key.value as object_key, true as prefix_listed,
      null::text as source_kind, null::uuid as source_id
    from jsonb_each(p_listed_inventory) as bucket_entry
    cross join lateral jsonb_array_elements_text(bucket_entry.value) as object_key(value)
  ), sources as (
    select 'recordings'::text bucket,
      substr(audio_path, char_length('storage://recordings/') + 1) object_key,
      false prefix_listed, 'take_audio'::text source_kind, id source_id
    from public.takes where user_id = p_expected_user_id
    union all
    select 'script-audios', audio.stored_asset ->> 'storageObjectKey', false,
      'script_audio_stored_asset', audio.id
    from public.script_audios audio join public.scripts script on script.id = audio.script_id
    where script.user_id = p_expected_user_id
    union all
    select 'voice-samples', substr(sample_audio_path, char_length('storage://voice-samples/') + 1),
      false, 'voice_sample_path', id
    from public.voices where user_id = p_expected_user_id and sample_audio_path is not null
    union all
    select 'voice-consents', substr(metadata -> 'recording' ->> 'audioPath', char_length('storage://voice-consents/') + 1),
      false, 'voice_consent_recording', id
    from public.voice_consents
    where user_id = p_expected_user_id and metadata -> 'recording' ->> 'audioPath' is not null
    union all
    select storage_bucket, storage_object_key, false, 'write_intent', id
    from public.voice_asset_write_intents
    where user_id = p_expected_user_id and status = 'completed'
      and storage_bucket is not null and storage_object_key is not null
  ), universe as (
    select bucket, object_key, bool_or(prefix_listed) prefix_listed,
      coalesce(array_agg(distinct source_kind order by source_kind)
        filter (where source_kind is not null), '{}'::text[]) source_kinds,
      coalesce(jsonb_agg(jsonb_build_object('kind', source_kind, 'rowId', source_id) order by source_kind, source_id)
        filter (where source_kind is not null), '[]'::jsonb) source_refs
    from (select * from listed union all select * from sources) combined
    group by bucket, object_key
  )
  insert into public.account_deletion_storage_targets (
    deletion_request_id, user_id, target_kind, storage_bucket, storage_object_key,
    target_fingerprint, source_kind_summary, source_refs, prefix_listed
  )
  select p_deletion_request_id, p_expected_user_id,
    case bucket when 'recordings' then 'recording' when 'script-audios' then 'script_audio'
      when 'voice-samples' then 'voice_sample' else 'voice_consent_recording' end,
    bucket, object_key,
    encode(extensions.digest(bucket || ':' || object_key, 'sha256'), 'hex'),
    source_kinds, source_refs, prefix_listed
  from universe order by bucket, object_key;

  get diagnostics v_target_count = row_count;
  select encode(extensions.digest(coalesce(string_agg(
    target_kind || ':' || storage_bucket || ':' || storage_object_key || ':' || target_fingerprint,
    '|' order by target_kind, storage_bucket, storage_object_key
  ), ''), 'sha256'), 'hex') into v_fingerprint
  from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id;

  perform set_config('native_minute.account_deletion_storage_mutation', 'seal', true);
  update public.account_deletion_requests
  set storage_snapshot_status = 'sealed', storage_snapshot_seal_version = 1,
      storage_snapshot_collection_token = null, storage_snapshot_sealed_at = now(),
      storage_snapshot_fingerprint = v_fingerprint,
      storage_snapshot_target_count = v_target_count, storage_verified_absent_count = 0,
      storage_cleanup_status = 'pending', failure_stage = null, failure_reason_code = null,
      last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.claim_account_deletion_storage_lease(
  p_deletion_request_id uuid, p_expected_user_id uuid, p_lease_token uuid, p_lease_seconds integer
)
returns public.account_deletion_requests
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests;
begin
  if p_lease_token is null or p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 900 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage lease';
  end if;
  perform set_config('native_minute.account_deletion_storage_mutation', 'claim_lease', true);
  update public.account_deletion_requests
  set storage_runner_lease_token = p_lease_token,
      storage_runner_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      storage_runner_attempt_count = storage_runner_attempt_count + 1,
      last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id
    and status in ('confirmed', 'storage_cleanup_failed')
    and provider_sub_finalized_at is not null and provider_cleanup_status in ('succeeded', 'not_needed')
    and storage_snapshot_status = 'sealed' and storage_cleanup_status in ('pending', 'failed')
    and storage_sub_finalized_at is null
    and (storage_runner_lease_token is null or storage_runner_lease_expires_at <= now())
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.release_account_deletion_storage_lease(
  p_deletion_request_id uuid, p_expected_user_id uuid, p_lease_token uuid
)
returns public.account_deletion_requests
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests;
begin
  if p_lease_token is null then
    raise exception using errcode = 'invalid_parameter_value', message = 'account deletion Storage lease token is required';
  end if;
  perform set_config('native_minute.account_deletion_storage_mutation', 'release_lease', true);
  update public.account_deletion_requests
  set storage_runner_lease_token = null, storage_runner_lease_expires_at = null
  where id = p_deletion_request_id and user_id = p_expected_user_id
    and storage_runner_lease_token = p_lease_token
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.begin_account_deletion_storage_delete_attempt(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_delete_attempt_count integer
)
returns public.account_deletion_storage_targets
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests; v_target public.account_deletion_storage_targets;
begin
  if p_target_id is null or p_lease_token is null or p_expected_runner_attempt_count < 1
    or p_expected_delete_attempt_count is distinct from 0 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage delete attempt';
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;
  if not found or v_request.status not in ('confirmed', 'storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_snapshot_status <> 'sealed'
    or v_request.storage_cleanup_status not in ('pending', 'failed')
    or v_request.storage_sub_finalized_at is not null
    or v_request.storage_runner_lease_token is distinct from p_lease_token
    or v_request.storage_runner_lease_expires_at is null or v_request.storage_runner_lease_expires_at <= now()
    or v_request.storage_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;
  select * into v_target from public.account_deletion_storage_targets
    where id = p_target_id and deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
    for update;
  if not found or v_target.status <> 'pending' or v_target.delete_attempt_count <> 0
    or v_target.delete_outcome <> 'not_attempted' or v_target.verification_status <> 'not_applicable'
    or v_target.storage_bucket is null or v_target.storage_object_key is null
    or v_target.locator_scrubbed_at is not null then
    return null;
  end if;

  perform set_config('native_minute.account_deletion_storage_mutation', 'begin_delete', true);
  update public.account_deletion_storage_targets
  set status = 'delete_requested', verification_status = 'pending', delete_attempt_count = 1,
      delete_requested_at = coalesce(delete_requested_at, now()), last_attempted_at = now(),
      next_retry_at = null, last_failure_category = null
  where id = p_target_id returning * into v_target;
  update public.account_deletion_requests
  set status = 'confirmed', storage_cleanup_status = 'pending',
      storage_destructive_started_at = coalesce(storage_destructive_started_at, now()),
      failure_stage = null, failure_reason_code = null, last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id;
  return v_target;
end;
$$;

create or replace function public.record_account_deletion_storage_delete_result(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_delete_attempt_count integer,
  p_result text,
  p_retry_delay_seconds integer
)
returns public.account_deletion_storage_targets
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_request public.account_deletion_requests;
  v_target public.account_deletion_storage_targets;
  v_manual boolean;
  v_transient boolean;
begin
  if p_expected_delete_attempt_count is distinct from 1 or p_result not in (
    'request_succeeded','invalid_target','timed_out','rate_limited','unavailable','network_error',
    'auth_failed','permission_denied','rejected','protocol_error'
  ) or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage delete result';
  end if;
  v_manual := p_result in ('invalid_target','auth_failed','permission_denied','rejected');
  v_transient := p_result in ('timed_out','rate_limited','unavailable','network_error','protocol_error');
  if (v_transient and p_retry_delay_seconds < 1) or (not v_transient and p_retry_delay_seconds <> 0) then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage delete retry delay';
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;
  if not found or v_request.status not in ('confirmed', 'storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_snapshot_status <> 'sealed'
    or v_request.storage_cleanup_status not in ('pending','failed')
    or v_request.storage_sub_finalized_at is not null
    or v_request.storage_runner_lease_token is distinct from p_lease_token
    or v_request.storage_runner_lease_expires_at is null or v_request.storage_runner_lease_expires_at <= now()
    or v_request.storage_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;
  select * into v_target from public.account_deletion_storage_targets
    where id = p_target_id and deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
    for update;
  if not found or v_target.status <> 'delete_requested' or v_target.delete_attempt_count <> 1
    or v_target.delete_outcome <> 'not_attempted' or v_target.delete_succeeded_at is not null
    or v_target.verification_status <> 'pending' then return null; end if;

  perform set_config('native_minute.account_deletion_storage_mutation', 'record_delete', true);
  if p_result = 'request_succeeded' then
    update public.account_deletion_storage_targets
    set delete_outcome = 'succeeded', verification_status = 'pending', next_retry_at = null,
        delete_succeeded_at = coalesce(delete_succeeded_at, now()), last_failure_category = null
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'confirmed', storage_cleanup_status = 'pending', failure_stage = null, failure_reason_code = null
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  elsif v_manual then
    update public.account_deletion_storage_targets
    set status = 'manual_required', delete_outcome = 'rejected', verification_status = 'manual_required',
        next_retry_at = null, last_failure_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'storage_cleanup_failed', storage_cleanup_status = 'manual_required',
        failure_stage = 'storage_cleanup', failure_reason_code = p_result, last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  else
    update public.account_deletion_storage_targets
    set delete_outcome = case when p_result = 'timed_out' then 'timed_out'
        when p_result = 'protocol_error' then 'rejected' else 'unavailable' end,
        verification_status = 'unavailable',
        next_retry_at = now() + make_interval(secs => p_retry_delay_seconds),
        last_failure_category = p_result
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'storage_cleanup_failed', storage_cleanup_status = 'failed',
        failure_stage = 'storage_cleanup', failure_reason_code = p_result, last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  end if;
  return v_target;
end;
$$;

create or replace function public.begin_account_deletion_storage_verification_attempt(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_verification_attempt_count integer
)
returns public.account_deletion_storage_targets
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests; v_target public.account_deletion_storage_targets;
begin
  if p_expected_runner_attempt_count < 1 or p_expected_verification_attempt_count < 0 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage verification attempt';
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;
  if not found or v_request.status not in ('confirmed','storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_snapshot_status <> 'sealed' or v_request.storage_cleanup_status not in ('pending','failed')
    or v_request.storage_sub_finalized_at is not null
    or v_request.storage_runner_lease_token is distinct from p_lease_token
    or v_request.storage_runner_lease_expires_at is null or v_request.storage_runner_lease_expires_at <= now()
    or v_request.storage_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;
  select * into v_target from public.account_deletion_storage_targets
    where id = p_target_id and deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
    for update;
  if not found or v_target.status <> 'delete_requested' or v_target.delete_attempt_count <> 1
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count
    or v_target.verification_status not in ('pending','unavailable')
    or (v_target.next_retry_at is not null and v_target.next_retry_at > now()) then
    return null;
  end if;

  perform set_config('native_minute.account_deletion_storage_mutation', 'begin_verification', true);
  if v_target.verification_attempt_count >= 5 then
    update public.account_deletion_storage_targets
    set status = 'manual_required', verification_status = 'manual_required', next_retry_at = null,
        last_failure_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now()), last_attempted_at = now()
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'storage_cleanup_failed', storage_cleanup_status = 'manual_required',
        failure_stage = 'storage_cleanup', failure_reason_code = 'storage_verification_retry_budget_exhausted',
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
    return v_target;
  end if;

  update public.account_deletion_storage_targets
  set verification_status = 'pending', verification_attempt_count = verification_attempt_count + 1,
      next_retry_at = null, last_attempted_at = now()
  where id = p_target_id returning * into v_target;
  update public.account_deletion_requests
  set status = 'confirmed', storage_cleanup_status = 'pending', failure_stage = null,
      failure_reason_code = null, last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id;
  return v_target;
end;
$$;

create or replace function public.record_account_deletion_storage_verification_result(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_verification_attempt_count integer,
  p_result text,
  p_retry_delay_seconds integer
)
returns public.account_deletion_storage_targets
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests; v_target public.account_deletion_storage_targets;
  v_manual boolean; v_transient boolean;
begin
  if p_expected_verification_attempt_count < 1 or p_result not in (
    'absent','present','invalid_target','timed_out','rate_limited','unavailable','network_error',
    'auth_failed','permission_denied','rejected','protocol_error'
  ) or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage verification result';
  end if;
  v_manual := p_result in ('present','invalid_target','auth_failed','permission_denied','rejected');
  v_transient := p_result in ('timed_out','rate_limited','unavailable','network_error','protocol_error');
  if (v_transient and p_retry_delay_seconds < 1) or (not v_transient and p_retry_delay_seconds <> 0) then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion Storage verification retry delay';
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;
  if not found or v_request.status not in ('confirmed', 'storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_snapshot_status <> 'sealed'
    or v_request.storage_cleanup_status not in ('pending','failed') or v_request.storage_sub_finalized_at is not null
    or v_request.storage_runner_lease_token is distinct from p_lease_token
    or v_request.storage_runner_lease_expires_at is null or v_request.storage_runner_lease_expires_at <= now()
    or v_request.storage_runner_attempt_count <> p_expected_runner_attempt_count then return null; end if;
  select * into v_target from public.account_deletion_storage_targets
    where id = p_target_id and deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
    for update;
  if not found or v_target.status <> 'delete_requested' or v_target.delete_attempt_count <> 1
    or v_target.verification_status <> 'pending'
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count then return null; end if;

  perform set_config('native_minute.account_deletion_storage_mutation', 'record_verification', true);
  if p_result = 'absent' then
    update public.account_deletion_storage_targets
    set status = 'verified_absent', verification_status = 'verified_absent', next_retry_at = null,
        verified_absent_at = coalesce(verified_absent_at, now()), last_failure_category = null
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'confirmed', storage_cleanup_status = 'pending',
        storage_verified_absent_count = (select count(*) from public.account_deletion_storage_targets
          where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
            and status = 'verified_absent'),
        failure_stage = null, failure_reason_code = null
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  elsif v_manual then
    update public.account_deletion_storage_targets
    set status = 'manual_required', verification_status = 'manual_required', next_retry_at = null,
        last_failure_category = case when p_result = 'present' then 'storage_object_present' else p_result end,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'storage_cleanup_failed', storage_cleanup_status = 'manual_required',
        failure_stage = 'storage_cleanup',
        failure_reason_code = case when p_result = 'present' then 'storage_object_present_manual_required' else p_result end,
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  else
    update public.account_deletion_storage_targets
    set verification_status = 'unavailable', next_retry_at = now() + make_interval(secs => p_retry_delay_seconds),
        last_failure_category = p_result
    where id = p_target_id returning * into v_target;
    update public.account_deletion_requests
    set status = 'storage_cleanup_failed', storage_cleanup_status = 'failed',
        failure_stage = 'storage_cleanup', failure_reason_code = p_result, last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  end if;
  return v_target;
end;
$$;

create or replace function public.finalize_account_deletion_storage_stage(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer
)
returns public.account_deletion_requests
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests; v_target_count integer; v_verified_count integer; v_now timestamptz;
begin
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id and user_id = p_expected_user_id for update;
  if not found or p_lease_token is null or p_expected_runner_attempt_count < 1
    or v_request.status not in ('confirmed','storage_cleanup_failed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_snapshot_status <> 'sealed' or v_request.storage_cleanup_status not in ('pending','failed')
    or v_request.storage_sub_finalized_at is not null
    or v_request.storage_runner_lease_token is distinct from p_lease_token
    or v_request.storage_runner_lease_expires_at is null or v_request.storage_runner_lease_expires_at <= now()
    or v_request.storage_runner_attempt_count <> p_expected_runner_attempt_count then return null; end if;

  select count(*), count(*) filter (where status = 'verified_absent')
  into v_target_count, v_verified_count from public.account_deletion_storage_targets
  where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id;
  if v_target_count <> v_request.storage_snapshot_target_count or v_verified_count <> v_target_count
    or exists (select 1 from public.account_deletion_storage_targets
      where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id and (
        status <> 'verified_absent' or verification_status <> 'verified_absent' or locator_scrubbed_at is not null
      )) then return null; end if;

  v_now := now();
  perform set_config('native_minute.account_deletion_storage_mutation', 'finalize', true);
  update public.account_deletion_storage_targets
  set storage_bucket = null, storage_object_key = null, target_fingerprint = null,
      source_refs = null, locator_scrubbed_at = v_now
  where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id;
  update public.account_deletion_requests
  set status = 'confirmed', storage_cleanup_status = case when v_target_count = 0 then 'not_needed' else 'succeeded' end,
      storage_verified_absent_count = v_verified_count, storage_snapshot_fingerprint = null,
      failure_stage = null, failure_reason_code = null,
      storage_runner_lease_token = null, storage_runner_lease_expires_at = null,
      storage_sub_finalized_at = v_now, storage_locator_scrubbed_at = v_now, last_attempted_at = v_now
  where id = p_deletion_request_id and user_id = p_expected_user_id returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.begin_account_deletion_storage_snapshot(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.seal_account_deletion_storage_snapshot(uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.claim_account_deletion_storage_lease(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.release_account_deletion_storage_lease(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.begin_account_deletion_storage_delete_attempt(uuid,uuid,uuid,uuid,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_storage_delete_result(uuid,uuid,uuid,uuid,integer,integer,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.begin_account_deletion_storage_verification_attempt(uuid,uuid,uuid,uuid,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_storage_verification_result(uuid,uuid,uuid,uuid,integer,integer,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.finalize_account_deletion_storage_stage(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.finalize_recording_upload_write_intent(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.account_deletion_storage_writer_fence_active(uuid) from public, anon, authenticated, service_role;
revoke all on function public.account_deletion_storage_source_inventory_fence_active(uuid) from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_storage_parent_immutability() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_storage_target_immutability() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_take_storage_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_voice_storage_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_script_audio_storage_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_script_storage_source_fence() from public, anon, authenticated, service_role;

grant execute on function public.begin_account_deletion_storage_snapshot(uuid,uuid,uuid) to service_role;
grant execute on function public.seal_account_deletion_storage_snapshot(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.claim_account_deletion_storage_lease(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.release_account_deletion_storage_lease(uuid,uuid,uuid) to service_role;
grant execute on function public.begin_account_deletion_storage_delete_attempt(uuid,uuid,uuid,uuid,integer,integer) to service_role;
grant execute on function public.record_account_deletion_storage_delete_result(uuid,uuid,uuid,uuid,integer,integer,text,integer) to service_role;
grant execute on function public.begin_account_deletion_storage_verification_attempt(uuid,uuid,uuid,uuid,integer,integer) to service_role;
grant execute on function public.record_account_deletion_storage_verification_result(uuid,uuid,uuid,uuid,integer,integer,text,integer) to service_role;
grant execute on function public.finalize_account_deletion_storage_stage(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.finalize_recording_upload_write_intent(uuid,uuid,uuid,text) to service_role;
