-- G5C-B4: focused consent withdrawal and application-database cleanup for
-- voice-only deletion. This migration does not call external providers or Storage,
-- scrub durable locators, finalize an operation, or enter a later stage.

alter table public.voice_deletion_operations
  add column if not exists consent_snapshot_ids uuid[] not null default '{}'::uuid[];

alter table public.voice_deletion_operations
  drop constraint if exists voice_deletion_operations_consent_snapshot_ids_check;

alter table public.voice_deletion_operations
  add constraint voice_deletion_operations_consent_snapshot_ids_check check (
    array_position(consent_snapshot_ids, null) is null
  );

-- The existing completion RPC deliberately remains outside B4. This focused guard
-- prevents a future completion from retaining a sealed consent-ID snapshot, while
-- keeping B4 itself from scrubbing it early.
create or replace function public.enforce_g5c_b4_consent_snapshot_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'completed'
    and new.consent_snapshot_ids is distinct from old.consent_snapshot_ids then
    raise exception using
      errcode = 'check_violation',
      message = 'completed voice deletion consent snapshots are immutable';
  end if;

  if new.status = 'completed'
    and cardinality(new.consent_snapshot_ids) <> 0 then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion completion requires the consent snapshot to be scrubbed';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_g5c_b4_consent_snapshot_immutability on public.voice_deletion_operations;
create trigger enforce_g5c_b4_consent_snapshot_immutability
  before update on public.voice_deletion_operations
  for each row
  execute function public.enforce_g5c_b4_consent_snapshot_immutability();

-- SQL, rather than a client-supplied version or array payload, is the authority for
-- the exact current voice-cloning contract. Array equality intentionally preserves
-- the canonical order from 0013.
create or replace function public.g5c_b4_is_current_voice_cloning_consent(
  p_user_id uuid,
  p_consent_id uuid default null
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.processing_consents as consent
    where consent.user_id = p_user_id
      and (p_consent_id is null or consent.id = p_consent_id)
      and consent.consent_type = 'voice_cloning'
      and consent.consent_version = '2026-08-22.v1'
      and consent.purpose_id = 'voice_cloning'
      and consent.purpose_version = 'v1'
      and consent.provider_set = array['elevenlabs']::text[]
      and consent.data_categories = array['voice_sample', 'consent_recording', 'cloned_voice', 'reference_audio']::text[]
      and consent.status = 'active'
  );
$$;

create or replace function public.g5c_b4_voice_deletion_writer_fence_active(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.voice_deletion_operations as operation
    where operation.user_id = p_user_id
      and operation.snapshot_status = 'succeeded'
      and operation.status in ('pending', 'processing', 'partial_failure', 'manual_required')
      and operation.status <> 'completed'
  );
$$;

create or replace function public.enforce_g5c_b4_processing_consent_writer_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'active'
    and new.consent_type = 'voice_cloning'
    and new.consent_version = '2026-08-22.v1'
    and new.purpose_id = 'voice_cloning'
    and new.purpose_version = 'v1'
    and new.provider_set = array['elevenlabs']::text[]
    and new.data_categories = array['voice_sample', 'consent_recording', 'cloned_voice', 'reference_audio']::text[]
    and public.g5c_b4_voice_deletion_writer_fence_active(new.user_id) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion writer fence is active';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b4_voice_consent_writer_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.provider = 'elevenlabs'
    and public.g5c_b4_voice_deletion_writer_fence_active(new.user_id) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion writer fence is active';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b4_voice_writer_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.provider = 'elevenlabs'
    and public.g5c_b4_voice_deletion_writer_fence_active(new.user_id) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion writer fence is active';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b4_script_audio_writer_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_voice_provider text;
begin
  select script.user_id, voice.provider
  into v_user_id, v_voice_provider
  from public.scripts as script
  left join public.voices as voice on voice.id = new.voice_id
  where script.id = new.script_id;

  if not found
    or (new.voice_id is not null and v_voice_provider is null)
    or (new.voice_id is not null and v_voice_provider = 'elevenlabs'
      and public.g5c_b4_voice_deletion_writer_fence_active(v_user_id)) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion writer fence is active';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b4_saved_model_audio_writer_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_script_owner uuid;
  v_audio_script_id uuid;
  v_voice_provider text;
begin
  select script.user_id, audio.script_id, voice.provider
  into v_script_owner, v_audio_script_id, v_voice_provider
  from public.script_audios as audio
  join public.scripts as script on script.id = audio.script_id
  left join public.voices as voice on voice.id = audio.voice_id
  where audio.id = new.script_audio_id;

  if not found
    or v_script_owner <> new.user_id
    or v_audio_script_id <> new.script_id
    or (v_voice_provider = 'elevenlabs'
      and public.g5c_b4_voice_deletion_writer_fence_active(new.user_id)) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion writer fence is active';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b4_script_writer_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid;
begin
  v_owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if public.g5c_b4_voice_deletion_writer_fence_active(v_owner_id)
    and exists (
      select 1
      from public.script_audios as audio
      join public.voices as voice on voice.id = audio.voice_id
      where audio.script_id = case when tg_op = 'DELETE' then old.id else new.id end
        and voice.user_id = v_owner_id
        and voice.provider = 'elevenlabs'
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion writer fence is active';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists enforce_g5c_b4_processing_consent_writer_fence on public.processing_consents;
create trigger enforce_g5c_b4_processing_consent_writer_fence
  before insert or update of user_id, consent_type, consent_version, purpose_id, purpose_version, provider_set, data_categories, status
  on public.processing_consents
  for each row
  execute function public.enforce_g5c_b4_processing_consent_writer_fence();

drop trigger if exists enforce_g5c_b4_voice_consent_writer_fence on public.voice_consents;
create trigger enforce_g5c_b4_voice_consent_writer_fence
  before insert or update of user_id, provider, metadata
  on public.voice_consents
  for each row
  execute function public.enforce_g5c_b4_voice_consent_writer_fence();

drop trigger if exists enforce_g5c_b4_voice_writer_fence on public.voices;
create trigger enforce_g5c_b4_voice_writer_fence
  before insert or update of user_id, provider, provider_voice_id, consent_id, sample_audio_path
  on public.voices
  for each row
  execute function public.enforce_g5c_b4_voice_writer_fence();

drop trigger if exists enforce_g5c_b4_script_audio_writer_fence on public.script_audios;
create trigger enforce_g5c_b4_script_audio_writer_fence
  before insert or update of script_id, voice_id, provider, cache_key, storage_path, stored_asset
  on public.script_audios
  for each row
  execute function public.enforce_g5c_b4_script_audio_writer_fence();

drop trigger if exists enforce_g5c_b4_saved_model_audio_writer_fence on public.script_saved_model_audios;
create trigger enforce_g5c_b4_saved_model_audio_writer_fence
  before insert or update of user_id, script_id, script_audio_id
  on public.script_saved_model_audios
  for each row
  execute function public.enforce_g5c_b4_saved_model_audio_writer_fence();

drop trigger if exists enforce_g5c_b4_script_writer_fence on public.scripts;
create trigger enforce_g5c_b4_script_writer_fence
  before delete or update of user_id
  on public.scripts
  for each row
  execute function public.enforce_g5c_b4_script_writer_fence();

-- script_audios is a replay/cache authority. Reads remain owner-scoped but all
-- normal cache writes now pass through the server-owned Listen writer.
drop policy if exists "script_audios_insert_own" on public.script_audios;
drop policy if exists "script_audios_update_own" on public.script_audios;
drop policy if exists "script_audios_delete_own" on public.script_audios;

-- Legacy provider-workflow consent rows remain append-only for authenticated users.
drop policy if exists "voice_consents_crud_own" on public.voice_consents;
drop policy if exists "voice_consents_select_own" on public.voice_consents;
drop policy if exists "voice_consents_insert_own" on public.voice_consents;
drop policy if exists "voice_consents_update_own" on public.voice_consents;
drop policy if exists "voice_consents_delete_own" on public.voice_consents;
create policy "voice_consents_select_own"
  on public.voice_consents
  for select
  to authenticated
  using (auth.uid() = user_id);
create policy "voice_consents_insert_own"
  on public.voice_consents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public.seal_voice_deletion_consent_snapshot(
  p_operation_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer
)
returns public.voice_deletion_operations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_consent_ids uuid[] := '{}'::uuid[];
  v_target_voice_count integer := 0;
  v_latest_consent_id uuid;
begin
  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.status not in ('pending', 'processing', 'partial_failure')
    or v_operation.current_stage is not null
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  lock table public.processing_consents, public.voices, public.scripts, public.script_audios, public.script_saved_model_audios in share row exclusive mode;

  select count(*) into v_target_voice_count
  from public.voices as voice
  where voice.user_id = p_user_id and voice.provider = 'elevenlabs';

  if exists (
    select 1
    from public.voices as voice
    where voice.user_id = p_user_id
      and voice.provider = 'elevenlabs'
      and (
        (select count(*) from public.voice_deletion_targets as target
          where target.operation_id = p_operation_id and target.user_id = p_user_id
            and target.target_kind = 'voice_binding' and target.source_row_id = voice.id) <> 1
        or (select count(*) from public.voice_deletion_targets as target
          where target.operation_id = p_operation_id and target.user_id = p_user_id
            and target.target_kind = 'provider_voice' and target.source_row_id = voice.id
            and target.provider_name = 'elevenlabs' and target.provider_resource_id = voice.provider_voice_id) <> 1
      )
  )
  or exists (
    select 1
    from public.voice_deletion_targets as target
    left join public.voices as voice on voice.id = target.source_row_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'voice_binding'
      and (voice.id is null or voice.user_id <> p_user_id or voice.provider <> 'elevenlabs')
  )
  or exists (
    select 1
    from public.voice_deletion_targets as target
    left join public.voices as voice on voice.id = target.source_row_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'provider_voice'
      and (voice.id is null or voice.user_id <> p_user_id or voice.provider <> 'elevenlabs'
        or target.provider_name <> 'elevenlabs' or target.provider_resource_id <> voice.provider_voice_id)
  ) then
    update public.voice_deletion_operations
    set status = 'manual_required', current_stage = 'consent_withdrawal', consent_snapshot_state = 'manual_required',
        consent_withdrawal_status = 'manual_required', last_failure_stage = 'consent_withdrawal',
        last_failure_category = 'sealed_voice_target_universe_mismatch', manual_reason_category = 'sealed_voice_target_universe_mismatch',
        manual_required_at = now(), next_retry_at = null, last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  if exists (
    select 1 from public.processing_consents as consent
    where consent.user_id = p_user_id and consent.consent_type = 'voice_cloning' and consent.status = 'active'
      and not public.g5c_b4_is_current_voice_cloning_consent(p_user_id, consent.id)
  ) then
    update public.voice_deletion_operations
    set status = 'manual_required', current_stage = 'consent_withdrawal', consent_snapshot_state = 'manual_required',
        consent_withdrawal_status = 'manual_required', last_failure_stage = 'consent_withdrawal',
        last_failure_category = 'mixed_or_malformed_voice_cloning_consent', manual_reason_category = 'mixed_or_malformed_voice_cloning_consent',
        manual_required_at = now(), next_retry_at = null, last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  select coalesce(array_agg(consent.id order by consent.accepted_at desc, consent.id desc), '{}'::uuid[])
  into v_consent_ids
  from public.processing_consents as consent
  where consent.user_id = p_user_id
    and public.g5c_b4_is_current_voice_cloning_consent(p_user_id, consent.id);

  v_latest_consent_id := v_consent_ids[1];

  if cardinality(v_consent_ids) = 0 and v_target_voice_count > 0 then
    update public.voice_deletion_operations
    set status = 'manual_required', current_stage = 'consent_withdrawal', consent_snapshot_state = 'manual_required',
        consent_withdrawal_status = 'manual_required', last_failure_stage = 'consent_withdrawal',
        last_failure_category = 'voice_target_without_current_consent', manual_reason_category = 'voice_target_without_current_consent',
        manual_required_at = now(), next_retry_at = null, last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  update public.voice_deletion_operations
  set status = 'processing', current_stage = 'consent_withdrawal', consent_snapshot_id = v_latest_consent_id,
      consent_snapshot_ids = v_consent_ids,
      consent_snapshot_state = case when cardinality(v_consent_ids) = 0 then 'not_needed' else 'approved_current' end,
      consent_withdrawal_status = 'processing', processing_started_at = coalesce(processing_started_at, now()),
      last_failure_stage = null, last_failure_category = null, manual_reason_category = null, manual_required_at = null,
      next_retry_at = null, last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.withdraw_voice_deletion_current_consents(
  p_operation_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer
)
returns public.voice_deletion_operations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_target_voice_count integer := 0;
  v_bad_snapshot boolean := false;
begin
  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.current_stage <> 'consent_withdrawal'
    or v_operation.consent_withdrawal_status <> 'processing'
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  lock table public.processing_consents, public.voices, public.scripts, public.script_audios, public.script_saved_model_audios in share row exclusive mode;

  select count(*) into v_target_voice_count from public.voices where user_id = p_user_id and provider = 'elevenlabs';

  select exists (
    select 1
    from unnest(v_operation.consent_snapshot_ids) as snapshot_id
    left join public.processing_consents as consent on consent.id = snapshot_id
    where consent.id is null
      or consent.user_id <> p_user_id
      or consent.consent_type <> 'voice_cloning'
      or consent.consent_version <> '2026-08-22.v1'
      or consent.purpose_id <> 'voice_cloning'
      or consent.purpose_version <> 'v1'
      or consent.provider_set <> array['elevenlabs']::text[]
      or consent.data_categories <> array['voice_sample', 'consent_recording', 'cloned_voice', 'reference_audio']::text[]
      or consent.status not in ('active', 'withdrawn')
  ) into v_bad_snapshot;

  if v_bad_snapshot
    or exists (
      select 1 from public.processing_consents as consent
      where consent.user_id = p_user_id
        and public.g5c_b4_is_current_voice_cloning_consent(p_user_id, consent.id)
        and not (consent.id = any(v_operation.consent_snapshot_ids))
    )
    or exists (
      select 1 from public.processing_consents as consent
      where consent.user_id = p_user_id and consent.consent_type = 'voice_cloning' and consent.status = 'active'
        and not public.g5c_b4_is_current_voice_cloning_consent(p_user_id, consent.id)
    )
    or exists (
      select 1 from public.voices as voice
      where voice.user_id = p_user_id and voice.provider = 'elevenlabs'
        and not exists (
          select 1 from public.voice_deletion_targets as target
          where target.operation_id = p_operation_id and target.user_id = p_user_id
            and target.target_kind = 'voice_binding' and target.source_row_id = voice.id
        )
    ) then
    update public.voice_deletion_operations
    set status = 'manual_required', consent_snapshot_state = 'manual_required', consent_withdrawal_status = 'manual_required',
        last_failure_stage = 'consent_withdrawal', last_failure_category = 'consent_withdrawal_precondition_failed',
        manual_reason_category = 'consent_withdrawal_precondition_failed', manual_required_at = now(), next_retry_at = null,
        consent_attempt_count = consent_attempt_count + 1, last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  if cardinality(v_operation.consent_snapshot_ids) = 0 and v_target_voice_count > 0 then
    update public.voice_deletion_operations
    set status = 'manual_required', consent_snapshot_state = 'manual_required', consent_withdrawal_status = 'manual_required',
        last_failure_stage = 'consent_withdrawal', last_failure_category = 'voice_target_without_sealed_consent',
        manual_reason_category = 'voice_target_without_sealed_consent', manual_required_at = now(), next_retry_at = null,
        consent_attempt_count = consent_attempt_count + 1, last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  -- 0013's trigger authors withdrawn_at and updated_at. This single statement keeps
  -- multiple active exact consents atomic and leaves historical rows intact.
  update public.processing_consents
  set status = 'withdrawn'
  where id = any(v_operation.consent_snapshot_ids)
    and user_id = p_user_id
    and status = 'active';

  update public.voice_deletion_operations
  set status = 'processing', current_stage = 'provider_cleanup',
      consent_withdrawal_status = case when cardinality(v_operation.consent_snapshot_ids) = 0 then 'not_needed' else 'succeeded' end,
      consent_snapshot_state = case when cardinality(v_operation.consent_snapshot_ids) = 0 then 'not_needed' else 'withdrawn' end,
      consent_attempt_count = consent_attempt_count + 1, last_failure_stage = null, last_failure_category = null,
      manual_reason_category = null, manual_required_at = null, next_retry_at = null, last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.enter_voice_deletion_database_cleanup_stage(
  p_operation_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer
)
returns public.voice_deletion_operations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
begin
  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.current_stage <> 'storage_cleanup'
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count
    or (v_operation.next_retry_at is not null and v_operation.next_retry_at > now())
    or exists (
      select 1 from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.status = 'manual_required'
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'provider_voice'
        and (target.status <> 'verified_absent' or target.reconciliation_status <> 'verified_absent')
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
        and (target.status <> 'verified_absent' or target.verification_status <> 'verified_absent')
    ) then
    return null;
  end if;

  update public.voice_deletion_operations
  set current_stage = 'database_cleanup', status = 'processing', last_failure_stage = null,
      last_failure_category = null, next_retry_at = null, last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.cleanup_voice_deletion_database_targets(
  p_operation_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer
)
returns public.voice_deletion_operations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_manual_reason text;
begin
  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.current_stage <> 'database_cleanup'
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count
    or (v_operation.next_retry_at is not null and v_operation.next_retry_at > now()) then
    return null;
  end if;

  lock table public.script_saved_model_audios, public.script_audios, public.voices, public.scripts in share row exclusive mode;

  if exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.status = 'manual_required'
  ) then
    v_manual_reason := 'manual_target_present';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'provider_voice'
      and (target.status <> 'verified_absent' or target.reconciliation_status <> 'verified_absent')
  ) then
    v_manual_reason := 'provider_target_not_verified_absent';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
      and (target.status <> 'verified_absent' or target.verification_status <> 'verified_absent')
  ) then
    v_manual_reason := 'storage_target_not_verified_absent';
  elsif exists (
    select 1
    from public.voice_deletion_targets as target
    left join public.script_saved_model_audios as saved on saved.id = target.source_row_id
    left join public.script_audios as audio on audio.id = saved.script_audio_id
    left join public.scripts as script on script.id = audio.script_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'saved_model_audio'
      and saved.id is not null
      and (saved.user_id <> p_user_id or saved.script_id <> audio.script_id or script.user_id <> p_user_id
        or not exists (select 1 from public.voice_deletion_targets as audio_target
          where audio_target.operation_id = p_operation_id and audio_target.user_id = p_user_id
            and audio_target.target_kind = 'script_audio' and audio_target.source_row_id = saved.script_audio_id))
  ) then
    v_manual_reason := 'saved_model_target_attribution_mismatch';
  elsif exists (
    select 1
    from public.voice_deletion_targets as target
    join public.script_audios as audio on audio.id = target.source_row_id
    join public.scripts as script on script.id = audio.script_id
    left join public.voices as voice on voice.id = audio.voice_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'script_audio'
      and (script.user_id <> p_user_id or voice.user_id <> p_user_id or voice.provider <> 'elevenlabs'
        or not exists (select 1 from public.voice_deletion_targets as binding_target
          where binding_target.operation_id = p_operation_id and binding_target.user_id = p_user_id
            and binding_target.target_kind = 'voice_binding' and binding_target.source_row_id = audio.voice_id)
        or not exists (select 1 from public.voice_deletion_targets as storage_target
          where storage_target.operation_id = p_operation_id and storage_target.user_id = p_user_id
            and storage_target.target_kind = 'script_audio_storage' and storage_target.source_row_id = audio.id
            and storage_target.status = 'verified_absent' and storage_target.verification_status = 'verified_absent'))
  ) then
    v_manual_reason := 'script_audio_target_attribution_mismatch';
  elsif exists (
    select 1
    from public.voices as voice
    where voice.user_id = p_user_id and voice.provider = 'elevenlabs'
      and not exists (select 1 from public.voice_deletion_targets as binding_target
        where binding_target.operation_id = p_operation_id and binding_target.user_id = p_user_id
          and binding_target.target_kind = 'voice_binding' and binding_target.source_row_id = voice.id)
  ) then
    v_manual_reason := 'unsealed_elevenlabs_voice';
  elsif exists (
    select 1 from public.script_audios as audio
    join public.scripts as script on script.id = audio.script_id
    join public.voices as voice on voice.id = audio.voice_id
    where script.user_id = p_user_id and voice.user_id = p_user_id and voice.provider = 'elevenlabs'
      and not exists (select 1 from public.voice_deletion_targets as audio_target
        where audio_target.operation_id = p_operation_id and audio_target.user_id = p_user_id
          and audio_target.target_kind = 'script_audio' and audio_target.source_row_id = audio.id)
  ) then
    v_manual_reason := 'unsealed_elevenlabs_script_audio';
  elsif exists (
    select 1
    from public.voice_deletion_targets as binding_target
    join public.script_audios as audio on audio.voice_id = binding_target.source_row_id
    join public.scripts as script on script.id = audio.script_id
    left join public.voices as voice on voice.id = binding_target.source_row_id
    where binding_target.operation_id = p_operation_id and binding_target.user_id = p_user_id
      and binding_target.target_kind = 'voice_binding'
      and voice.id is null
      and script.user_id = p_user_id
  ) then
    v_manual_reason := 'missing_voice_with_unresolved_script_audio';
  elsif exists (
    select 1
    from public.voice_deletion_targets as audio_target
    join public.script_saved_model_audios as saved on saved.script_audio_id = audio_target.source_row_id
    left join public.script_audios as audio on audio.id = audio_target.source_row_id
    where audio_target.operation_id = p_operation_id and audio_target.user_id = p_user_id
      and audio_target.target_kind = 'script_audio'
      and audio.id is null
  ) then
    v_manual_reason := 'missing_script_audio_with_unresolved_saved_model_audio';
  elsif exists (
    select 1 from public.script_saved_model_audios as saved
    join public.script_audios as audio on audio.id = saved.script_audio_id
    join public.scripts as script on script.id = audio.script_id
    join public.voices as voice on voice.id = audio.voice_id
    where saved.user_id = p_user_id and script.user_id = p_user_id and voice.user_id = p_user_id and voice.provider = 'elevenlabs'
      and not exists (select 1 from public.voice_deletion_targets as saved_target
        where saved_target.operation_id = p_operation_id and saved_target.user_id = p_user_id
          and saved_target.target_kind = 'saved_model_audio' and saved_target.source_row_id = saved.id)
  ) then
    v_manual_reason := 'unsealed_saved_model_audio';
  end if;

  if v_manual_reason is not null then
    update public.voice_deletion_operations
    set status = 'manual_required', last_failure_stage = 'database_cleanup', last_failure_category = v_manual_reason,
        manual_reason_category = v_manual_reason, manual_required_at = now(), next_retry_at = null, last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  delete from public.script_saved_model_audios as saved
  where saved.user_id = p_user_id
    and saved.id in (
      select target.source_row_id from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'saved_model_audio'
    );

  delete from public.script_audios as audio
  where audio.id in (
    select target.source_row_id from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'script_audio'
  )
  and exists (select 1 from public.scripts as script where script.id = audio.script_id and script.user_id = p_user_id);

  delete from public.voices as voice
  where voice.user_id = p_user_id and voice.provider = 'elevenlabs'
    and voice.id in (
      select target.source_row_id from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'voice_binding'
    );

  if exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'saved_model_audio'
      and exists (select 1 from public.script_saved_model_audios as saved where saved.id = target.source_row_id)
  )
  or exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'script_audio'
      and exists (select 1 from public.script_audios as audio where audio.id = target.source_row_id)
  )
  or exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'voice_binding'
      and exists (select 1 from public.voices as voice where voice.id = target.source_row_id)
  ) then
    raise exception using errcode = 'check_violation', message = 'voice deletion database cleanup source absence verification failed';
  end if;

  update public.voice_deletion_targets
  set status = 'verified_absent', delete_outcome = 'not_needed', reconciliation_status = 'not_applicable',
      verification_status = 'verified_absent', verified_absent_at = now(), last_failure_category = null, last_attempted_at = now()
  where operation_id = p_operation_id and user_id = p_user_id
    and target_kind in ('saved_model_audio', 'script_audio', 'voice_binding')
    and status <> 'verified_absent';

  update public.voice_deletion_operations
  set status = 'processing', destructive_started_at = coalesce(destructive_started_at, now()),
      last_failure_stage = null, last_failure_category = null, manual_reason_category = null, manual_required_at = null,
      next_retry_at = null, last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

revoke all on function public.g5c_b4_is_current_voice_cloning_consent(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.g5c_b4_voice_deletion_writer_fence_active(uuid) from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_consent_snapshot_immutability() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_processing_consent_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_voice_consent_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_voice_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_script_audio_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_saved_model_audio_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b4_script_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.seal_voice_deletion_consent_snapshot(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.withdraw_voice_deletion_current_consents(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.enter_voice_deletion_database_cleanup_stage(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_voice_deletion_database_targets(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.seal_voice_deletion_consent_snapshot(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.withdraw_voice_deletion_current_consents(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.enter_voice_deletion_database_cleanup_stage(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.cleanup_voice_deletion_database_targets(uuid, uuid, uuid, integer) to service_role;
