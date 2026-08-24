-- G5C-B3: focused, lease-owned Storage object transitions for voice-only deletion.
-- This migration intentionally does not call Storage, scrub locators, complete an
-- operation, or advance any later (B4) stage.

-- Existing durable data must either already satisfy the focused Storage shape or be
-- reviewed before this migration is applied. No existing rows are rewritten here.
do $$
begin
  if exists (
    select 1
    from public.voice_deletion_targets as target
    where target.locator_scrubbed_at is null
      and (
        (
          target.target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
          and (
            target.source_row_id is null
            or target.storage_bucket is null
            or btrim(target.storage_bucket) = ''
            or target.storage_object_key is null
            or btrim(target.storage_object_key) = ''
            or (target.target_kind = 'voice_sample' and target.storage_bucket <> 'voice-samples')
            or (target.target_kind = 'voice_consent_recording' and target.storage_bucket <> 'voice-consents')
            or (target.target_kind = 'script_audio_storage' and target.storage_bucket <> 'script-audios')
          )
        )
        or (
          target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
          and (target.storage_bucket is not null or target.storage_object_key is not null)
        )
      )
  ) then
    raise exception 'G5C-B3 pre-apply check failed: existing voice deletion target storage locators need manual review';
  end if;
end;
$$;

alter table public.voice_deletion_targets
  drop constraint if exists voice_deletion_targets_storage_locator_contract_check;

alter table public.voice_deletion_targets
  add constraint voice_deletion_targets_storage_locator_contract_check check (
    locator_scrubbed_at is not null
    or (
      (
        target_kind = 'voice_sample'
        and source_row_id is not null
        and storage_bucket = 'voice-samples'
        and storage_object_key is not null
        and btrim(storage_object_key) <> ''
      )
      or (
        target_kind = 'voice_consent_recording'
        and source_row_id is not null
        and storage_bucket = 'voice-consents'
        and storage_object_key is not null
        and btrim(storage_object_key) <> ''
      )
      or (
        target_kind = 'script_audio_storage'
        and source_row_id is not null
        and storage_bucket = 'script-audios'
        and storage_object_key is not null
        and btrim(storage_object_key) <> ''
      )
      or (
        target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
        and storage_bucket is null
        and storage_object_key is null
      )
    )
  );

-- Authenticated callers may continue to read, insert, and update their own objects,
-- but only the durable service-role runner may remove B3 cleanup objects directly.
drop policy if exists "voice-samples_delete_own" on storage.objects;
drop policy if exists "voice-consents_delete_own" on storage.objects;
drop policy if exists "script-audios_delete_own" on storage.objects;

-- G5C-B3 writer fence. The begin-delete RPC locks the same writer tables before
-- it re-resolves shared references. After its durable delete intent commits, these
-- triggers keep the exact locator fenced until the operation is safely completed.
-- This is deliberately limited to the three B3 Storage target kinds and their
-- current DB reference writers; it is not a general Storage policy framework.
create or replace function public.g5c_b3_storage_reference_fence_active(
  p_user_id uuid,
  p_target_kind text,
  p_storage_bucket text,
  p_storage_object_key text,
  p_source_row_id uuid default null
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    p_user_id is not null
    and p_storage_object_key is not null
    and (
      (p_target_kind = 'voice_sample' and p_storage_bucket = 'voice-samples')
      or (p_target_kind = 'voice_consent_recording' and p_storage_bucket = 'voice-consents')
      or (p_target_kind = 'script_audio_storage' and p_storage_bucket = 'script-audios')
    )
    and exists (
      select 1
      from public.voice_deletion_targets as target
      join public.voice_deletion_operations as operation
        on operation.id = target.operation_id
        and operation.user_id = target.user_id
      where target.user_id = p_user_id
        and target.target_kind = p_target_kind
        and target.storage_bucket = p_storage_bucket
        and target.storage_object_key = p_storage_object_key
        and (p_source_row_id is null or target.source_row_id = p_source_row_id)
        and target.status in ('delete_requested', 'deleted', 'verified_absent', 'manual_required')
        and operation.destructive_started_at is not null
        and operation.status <> 'completed'
    );
$$;

create or replace function public.enforce_g5c_b3_voice_storage_reference_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_consent_recording_path text;
  v_object_key text;
begin
  if tg_op = 'UPDATE'
    and new.user_id is not distinct from old.user_id
    and new.sample_audio_path is not distinct from old.sample_audio_path
    and new.consent_id is not distinct from old.consent_id then
    return new;
  end if;

  if new.sample_audio_path like 'storage://voice-samples/%' then
    v_object_key := substr(new.sample_audio_path, char_length('storage://voice-samples/') + 1);

    if v_object_key = ''
      or public.g5c_b3_storage_reference_fence_active(
        new.user_id,
        'voice_sample',
        'voice-samples',
        v_object_key
      ) then
      raise exception using
        errcode = 'check_violation',
        message = 'voice deletion storage reference fence is active';
    end if;
  end if;

  if new.consent_id is not null then
    select consent.metadata -> 'recording' ->> 'audioPath'
    into v_consent_recording_path
    from public.voice_consents as consent
    where consent.id = new.consent_id
      and consent.user_id = new.user_id;

    if v_consent_recording_path like 'storage://voice-consents/%' then
      v_object_key := substr(v_consent_recording_path, char_length('storage://voice-consents/') + 1);

      if v_object_key = ''
        or public.g5c_b3_storage_reference_fence_active(
          new.user_id,
          'voice_consent_recording',
          'voice-consents',
          v_object_key,
          new.consent_id
        ) then
        raise exception using
          errcode = 'check_violation',
          message = 'voice deletion storage reference fence is active';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b3_voice_consent_storage_reference_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recording_path text;
  v_object_key text;
begin
  v_recording_path := new.metadata -> 'recording' ->> 'audioPath';

  if tg_op = 'UPDATE'
    and new.user_id is not distinct from old.user_id
    and v_recording_path is not distinct from old.metadata -> 'recording' ->> 'audioPath' then
    return new;
  end if;

  if v_recording_path like 'storage://voice-consents/%' then
    v_object_key := substr(v_recording_path, char_length('storage://voice-consents/') + 1);

    if v_object_key = ''
      or public.g5c_b3_storage_reference_fence_active(
        new.user_id,
        'voice_consent_recording',
        'voice-consents',
        v_object_key
      ) then
      raise exception using
        errcode = 'check_violation',
        message = 'voice deletion storage reference fence is active';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b3_script_audio_storage_reference_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_storage_bucket text;
  v_object_key text;
begin
  if tg_op = 'UPDATE'
    and new.script_id is not distinct from old.script_id
    and new.voice_id is not distinct from old.voice_id
    and new.stored_asset is not distinct from old.stored_asset then
    return new;
  end if;

  v_storage_bucket := new.stored_asset ->> 'storageBucket';
  v_object_key := new.stored_asset ->> 'storageObjectKey';

  if v_storage_bucket = 'script-audios' and v_object_key is not null then
    select script.user_id
    into v_user_id
    from public.scripts as script
    where script.id = new.script_id;

    if not found
      or public.g5c_b3_storage_reference_fence_active(
        v_user_id,
        'script_audio_storage',
        'script-audios',
        v_object_key
      ) then
      raise exception using
        errcode = 'check_violation',
        message = 'voice deletion storage reference fence is active';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_g5c_b3_saved_model_audio_reference_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_script_owner_id uuid;
  v_storage_bucket text;
  v_object_key text;
begin
  if tg_op = 'UPDATE'
    and new.user_id is not distinct from old.user_id
    and new.script_id is not distinct from old.script_id
    and new.script_audio_id is not distinct from old.script_audio_id then
    return new;
  end if;

  select script.user_id,
         audio.stored_asset ->> 'storageBucket',
         audio.stored_asset ->> 'storageObjectKey'
  into v_script_owner_id, v_storage_bucket, v_object_key
  from public.script_audios as audio
  join public.scripts as script on script.id = audio.script_id
  where audio.id = new.script_audio_id;

  if not found then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion storage reference fence is active';
  end if;

  if v_storage_bucket = 'script-audios'
    and v_object_key is not null
    and v_script_owner_id = new.user_id
    and public.g5c_b3_storage_reference_fence_active(
      new.user_id,
      'script_audio_storage',
      'script-audios',
      v_object_key,
      new.script_audio_id
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion storage reference fence is active';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_g5c_b3_voice_storage_reference_fence on public.voices;
create trigger enforce_g5c_b3_voice_storage_reference_fence
  before insert or update of user_id, sample_audio_path, consent_id on public.voices
  for each row
  execute function public.enforce_g5c_b3_voice_storage_reference_fence();

drop trigger if exists enforce_g5c_b3_voice_consent_storage_reference_fence on public.voice_consents;
create trigger enforce_g5c_b3_voice_consent_storage_reference_fence
  before insert or update of user_id, metadata on public.voice_consents
  for each row
  execute function public.enforce_g5c_b3_voice_consent_storage_reference_fence();

drop trigger if exists enforce_g5c_b3_script_audio_storage_reference_fence on public.script_audios;
create trigger enforce_g5c_b3_script_audio_storage_reference_fence
  before insert or update of script_id, voice_id, stored_asset on public.script_audios
  for each row
  execute function public.enforce_g5c_b3_script_audio_storage_reference_fence();

drop trigger if exists enforce_g5c_b3_saved_model_audio_reference_fence on public.script_saved_model_audios;
create trigger enforce_g5c_b3_saved_model_audio_reference_fence
  before insert or update of user_id, script_id, script_audio_id on public.script_saved_model_audios
  for each row
  execute function public.enforce_g5c_b3_saved_model_audio_reference_fence();

create or replace function public.enter_voice_deletion_storage_cleanup_stage(
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
  if p_operation_id is null or p_user_id is null or p_lease_token is null
    or p_expected_runner_attempt_count is null or p_expected_runner_attempt_count < 1 then
    raise exception 'invalid storage cleanup stage entry request';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.current_stage <> 'provider_cleanup'
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count
    or (v_operation.next_retry_at is not null and v_operation.next_retry_at > now())
    or exists (
      select 1
      from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id
        and target.user_id = p_user_id
        and target.target_kind = 'provider_voice'
        and (
          target.status <> 'verified_absent'
          or target.reconciliation_status <> 'verified_absent'
          or target.verification_status <> 'not_applicable'
        )
    ) then
    return null;
  end if;

  update public.voice_deletion_operations
  set current_stage = 'storage_cleanup',
      status = 'processing',
      last_failure_stage = null,
      last_failure_category = null,
      next_retry_at = null,
      last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.begin_storage_object_delete_attempt(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_delete_attempt_count integer
)
returns public.voice_deletion_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_target public.voice_deletion_targets;
  v_manual_reason text;
  v_expected_path text;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 0 then
    raise exception 'invalid storage delete attempt request';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.current_stage <> 'storage_cleanup'
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or (v_operation.next_retry_at is not null and v_operation.next_retry_at > now()) then
    return null;
  end if;

  select * into v_target
  from public.voice_deletion_targets
  where id = p_target_id
    and operation_id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found
    or v_target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
    or v_target.source_row_id is null
    or v_target.storage_object_key is null
    or btrim(v_target.storage_object_key) = ''
    or (v_target.target_kind = 'voice_sample' and v_target.storage_bucket <> 'voice-samples')
    or (v_target.target_kind = 'voice_consent_recording' and v_target.storage_bucket <> 'voice-consents')
    or (v_target.target_kind = 'script_audio_storage' and v_target.storage_bucket <> 'script-audios')
    or v_target.delete_attempt_count <> p_expected_delete_attempt_count
    or not (
      (v_target.status = 'pending' and v_target.delete_attempt_count = 0)
      or (v_target.status = 'delete_requested' and v_target.verification_status = 'present')
    ) then
    return null;
  end if;

  if v_target.delete_attempt_count >= 3 then
    update public.voice_deletion_targets
    set status = 'manual_required',
        reconciliation_status = 'manual_required',
        verification_status = 'manual_required',
        last_failure_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'manual_required',
        last_failure_stage = 'storage_cleanup',
        last_failure_category = 'retry_budget_exhausted',
        next_retry_at = null,
        manual_reason_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now()),
        last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id;

    return v_target;
  end if;

  -- Lock every relevant table before resolving references. This closes the gap in
  -- which a concurrent writer could add a shared reference after row-level checks.
  lock table public.voices, public.voice_consents, public.scripts, public.script_audios,
    public.script_saved_model_audios in share row exclusive mode;

  if v_target.target_kind = 'voice_sample' then
    v_expected_path := 'storage://voice-samples/' || v_target.storage_object_key;

    if not exists (
      select 1
      from public.voices as voice
      join public.voice_consents as consent on consent.id = voice.consent_id
      where voice.id = v_target.source_row_id
        and voice.user_id = p_user_id
        and voice.provider = 'elevenlabs'
        and consent.user_id = p_user_id
        and consent.provider = 'elevenlabs'
        and voice.sample_audio_path = v_expected_path
        and v_target.storage_object_key like p_user_id::text || '/' || consent.id::text || '/%'
        and array_length(string_to_array(v_target.storage_object_key, '/'), 1) = 3
    ) then
      v_manual_reason := 'storage_attribution_mismatch';
    elsif exists (
      select 1
      from public.voices as voice
      where voice.sample_audio_path = v_expected_path
        and (
          voice.user_id <> p_user_id
          or voice.provider <> 'elevenlabs'
          or voice.consent_id is null
          or not exists (
            select 1 from public.voice_consents as consent
            where consent.id = voice.consent_id
              and consent.user_id = p_user_id
              and consent.provider = 'elevenlabs'
          )
          or not exists (
            select 1 from public.voice_deletion_targets as provider_target
            where provider_target.operation_id = p_operation_id
              and provider_target.user_id = p_user_id
              and provider_target.target_kind = 'provider_voice'
              and provider_target.source_row_id = voice.id
          )
        )
    ) then
      v_manual_reason := 'storage_shared_reference';
    end if;
  elsif v_target.target_kind = 'voice_consent_recording' then
    v_expected_path := 'storage://voice-consents/' || v_target.storage_object_key;

    if not exists (
      select 1
      from public.voice_consents as consent
      where consent.id = v_target.source_row_id
        and consent.user_id = p_user_id
        and consent.provider = 'elevenlabs'
        and consent.metadata -> 'recording' ->> 'audioPath' = v_expected_path
        and v_target.storage_object_key like p_user_id::text || '/%'
        and array_length(string_to_array(v_target.storage_object_key, '/'), 1) = 2
        and exists (
          select 1 from public.voices as voice
          where voice.consent_id = consent.id
            and voice.user_id = p_user_id
            and voice.provider = 'elevenlabs'
        )
    ) then
      v_manual_reason := 'storage_attribution_mismatch';
    elsif exists (
      select 1
      from public.voice_consents as consent
      where consent.metadata -> 'recording' ->> 'audioPath' = v_expected_path
        and (
          consent.user_id <> p_user_id
          or consent.provider <> 'elevenlabs'
          or not exists (
            select 1 from public.voices as voice
            where voice.consent_id = consent.id
              and voice.user_id = p_user_id
              and voice.provider = 'elevenlabs'
          )
          or exists (
            select 1 from public.voices as voice
            where voice.consent_id = consent.id
              and (
                voice.user_id <> p_user_id
                or voice.provider <> 'elevenlabs'
                or not exists (
                  select 1 from public.voice_deletion_targets as provider_target
                  where provider_target.operation_id = p_operation_id
                    and provider_target.user_id = p_user_id
                    and provider_target.target_kind = 'provider_voice'
                    and provider_target.source_row_id = voice.id
                )
              )
          )
        )
    ) then
      v_manual_reason := 'storage_shared_reference';
    end if;
  else
    if not exists (
      select 1
      from public.script_audios as audio
      join public.scripts as script on script.id = audio.script_id
      join public.voices as voice on voice.id = audio.voice_id
      where audio.id = v_target.source_row_id
        and script.user_id = p_user_id
        and voice.user_id = p_user_id
        and voice.provider = 'elevenlabs'
        and audio.provider = 'elevenlabs'
        and audio.stored_asset ->> 'storageBucket' = 'script-audios'
        and audio.stored_asset ->> 'storageObjectKey' = v_target.storage_object_key
        and v_target.storage_object_key like p_user_id::text || '/' || script.id::text || '/' || voice.id::text || '/%'
        and array_length(string_to_array(v_target.storage_object_key, '/'), 1) = 4
        and exists (
          select 1 from public.voice_deletion_targets as provider_target
          where provider_target.operation_id = p_operation_id
            and provider_target.user_id = p_user_id
            and provider_target.target_kind = 'provider_voice'
            and provider_target.source_row_id = voice.id
        )
        and exists (
          select 1 from public.voice_deletion_targets as audio_target
          where audio_target.operation_id = p_operation_id
            and audio_target.user_id = p_user_id
            and audio_target.target_kind = 'script_audio'
            and audio_target.source_row_id = audio.id
        )
    ) then
      v_manual_reason := 'storage_attribution_mismatch';
    elsif exists (
      select 1
      from public.script_audios as audio
      left join public.scripts as script on script.id = audio.script_id
      left join public.voices as voice on voice.id = audio.voice_id
      where audio.stored_asset ->> 'storageBucket' = 'script-audios'
        and audio.stored_asset ->> 'storageObjectKey' = v_target.storage_object_key
        and (
          script.id is null
          or script.user_id <> p_user_id
          or voice.id is null
          or voice.user_id <> p_user_id
          or voice.provider <> 'elevenlabs'
          or audio.provider <> 'elevenlabs'
          or not exists (
            select 1 from public.voice_deletion_targets as provider_target
            where provider_target.operation_id = p_operation_id
              and provider_target.user_id = p_user_id
              and provider_target.target_kind = 'provider_voice'
              and provider_target.source_row_id = voice.id
          )
          or not exists (
            select 1 from public.voice_deletion_targets as audio_target
            where audio_target.operation_id = p_operation_id
              and audio_target.user_id = p_user_id
              and audio_target.target_kind = 'script_audio'
              and audio_target.source_row_id = audio.id
          )
          or exists (
            select 1
            from public.script_saved_model_audios as saved
            where saved.script_audio_id = audio.id
              and (
                saved.user_id <> p_user_id
                or saved.script_id <> audio.script_id
                or not exists (
                  select 1 from public.voice_deletion_targets as saved_target
                  where saved_target.operation_id = p_operation_id
                    and saved_target.user_id = p_user_id
                    and saved_target.target_kind = 'saved_model_audio'
                    and saved_target.source_row_id = saved.id
                )
              )
          )
        )
    ) then
      v_manual_reason := 'storage_shared_reference';
    end if;
  end if;

  if v_manual_reason is not null then
    update public.voice_deletion_targets
    set status = 'manual_required',
        reconciliation_status = 'manual_required',
        verification_status = 'manual_required',
        last_failure_category = v_manual_reason,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'manual_required',
        last_failure_stage = 'storage_cleanup',
        last_failure_category = v_manual_reason,
        next_retry_at = null,
        manual_reason_category = v_manual_reason,
        manual_required_at = coalesce(manual_required_at, now()),
        last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id;

    return v_target;
  end if;

  update public.voice_deletion_targets
  set status = 'delete_requested',
      delete_outcome = 'not_attempted',
      reconciliation_status = 'not_applicable',
      verification_status = 'pending',
      delete_attempt_count = delete_attempt_count + 1,
      last_failure_category = null,
      last_attempted_at = now()
  where id = p_target_id
  returning * into v_target;

  update public.voice_deletion_operations
  set status = 'processing',
      destructive_started_at = coalesce(destructive_started_at, now()),
      last_failure_stage = null,
      last_failure_category = null,
      next_retry_at = null,
      last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id;

  return v_target;
end;
$$;

create or replace function public.record_storage_object_delete_result(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_delete_attempt_count integer,
  p_result text,
  p_retry_delay_seconds integer
)
returns public.voice_deletion_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_target public.voice_deletion_targets;
  v_is_transient boolean;
  v_delete_outcome text;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 1
    or p_result not in (
      'request_succeeded', 'timed_out', 'rate_limited', 'unavailable', 'network_error',
      'auth_failed', 'permission_denied', 'rejected', 'protocol_error'
    )
    or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300 then
    raise exception 'invalid storage delete result';
  end if;

  v_is_transient := p_result in ('timed_out', 'rate_limited', 'unavailable', 'network_error', 'protocol_error');
  if (v_is_transient and p_retry_delay_seconds < 1) or (not v_is_transient and p_retry_delay_seconds <> 0) then
    raise exception 'invalid storage delete retry delay';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.current_stage <> 'storage_cleanup'
    or v_operation.status <> 'processing'
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now() then
    return null;
  end if;

  select * into v_target
  from public.voice_deletion_targets
  where id = p_target_id and operation_id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
    or v_target.status <> 'delete_requested'
    or v_target.verification_status <> 'pending'
    or v_target.delete_attempt_count <> p_expected_delete_attempt_count then
    return null;
  end if;

  if p_result = 'request_succeeded' then
    update public.voice_deletion_targets
    set status = 'deleted',
        delete_outcome = 'succeeded',
        reconciliation_status = 'not_applicable',
        verification_status = 'pending',
        delete_succeeded_at = coalesce(delete_succeeded_at, now()),
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif p_result in ('auth_failed', 'permission_denied') then
    update public.voice_deletion_targets
    set status = 'manual_required',
        delete_outcome = 'rejected',
        reconciliation_status = 'manual_required',
        verification_status = 'manual_required',
        last_failure_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'manual_required',
        last_failure_stage = 'storage_cleanup',
        last_failure_category = p_result,
        next_retry_at = null,
        manual_reason_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_operation_id and user_id = p_user_id;
  else
    v_delete_outcome := case
      when p_result = 'timed_out' then 'timed_out'
      when p_result in ('rejected', 'protocol_error') then 'rejected'
      else 'unavailable'
    end;

    update public.voice_deletion_targets
    set status = 'delete_requested',
        delete_outcome = v_delete_outcome,
        reconciliation_status = 'not_applicable',
        verification_status = 'pending',
        last_failure_category = p_result
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = case when v_is_transient then 'partial_failure' else 'processing' end,
        last_failure_stage = case when v_is_transient then 'storage_cleanup' else null end,
        last_failure_category = case when v_is_transient then p_result else null end,
        next_retry_at = case
          when v_is_transient then now() + make_interval(secs => p_retry_delay_seconds)
          else null
        end
    where id = p_operation_id and user_id = p_user_id;
  end if;

  return v_target;
end;
$$;

create or replace function public.begin_storage_object_verification_attempt(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_verification_attempt_count integer
)
returns public.voice_deletion_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_target public.voice_deletion_targets;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_verification_attempt_count is null or p_expected_verification_attempt_count < 0 then
    raise exception 'invalid storage verification attempt request';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.current_stage <> 'storage_cleanup'
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or (v_operation.next_retry_at is not null and v_operation.next_retry_at > now()) then
    return null;
  end if;

  select * into v_target
  from public.voice_deletion_targets
  where id = p_target_id and operation_id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
    or v_target.storage_object_key is null
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count
    or not (
      v_target.status in ('delete_requested', 'deleted')
      and v_target.verification_status in ('pending', 'unavailable')
    ) then
    return null;
  end if;

  if v_target.verification_attempt_count >= 5 then
    update public.voice_deletion_targets
    set status = 'manual_required',
        reconciliation_status = 'manual_required',
        verification_status = 'manual_required',
        last_failure_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'manual_required',
        last_failure_stage = 'storage_cleanup',
        last_failure_category = 'retry_budget_exhausted',
        next_retry_at = null,
        manual_reason_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now()),
        last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id;

    return v_target;
  end if;

  update public.voice_deletion_targets
  set verification_status = 'pending',
      reconciliation_status = 'not_applicable',
      verification_attempt_count = verification_attempt_count + 1,
      last_attempted_at = now()
  where id = p_target_id
  returning * into v_target;

  update public.voice_deletion_operations
  set status = 'processing',
      last_failure_stage = null,
      last_failure_category = null,
      next_retry_at = null,
      last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id;

  return v_target;
end;
$$;

create or replace function public.record_storage_object_verification_result(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_verification_attempt_count integer,
  p_result text,
  p_retry_delay_seconds integer
)
returns public.voice_deletion_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_target public.voice_deletion_targets;
  v_is_transient boolean;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_verification_attempt_count is null or p_expected_verification_attempt_count < 1
    or p_result not in (
      'absent', 'present', 'timed_out', 'rate_limited', 'unavailable', 'network_error',
      'auth_failed', 'permission_denied', 'rejected', 'protocol_error'
    )
    or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300 then
    raise exception 'invalid storage verification result';
  end if;

  v_is_transient := p_result in ('timed_out', 'rate_limited', 'unavailable', 'network_error');
  if (v_is_transient and p_retry_delay_seconds < 1) or (not v_is_transient and p_retry_delay_seconds <> 0) then
    raise exception 'invalid storage verification retry delay';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.current_stage <> 'storage_cleanup'
    or v_operation.status <> 'processing'
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now() then
    return null;
  end if;

  select * into v_target
  from public.voice_deletion_targets
  where id = p_target_id and operation_id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
    or v_target.status not in ('delete_requested', 'deleted')
    or v_target.verification_status <> 'pending'
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count then
    return null;
  end if;

  if p_result = 'absent' then
    update public.voice_deletion_targets
    set status = 'verified_absent',
        reconciliation_status = 'not_applicable',
        verification_status = 'verified_absent',
        verified_absent_at = coalesce(verified_absent_at, now()),
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif p_result = 'present' then
    update public.voice_deletion_targets
    set status = 'delete_requested',
        reconciliation_status = 'not_applicable',
        verification_status = 'present',
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif v_is_transient then
    update public.voice_deletion_targets
    set verification_status = 'unavailable',
        reconciliation_status = 'not_applicable',
        last_failure_category = p_result
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'partial_failure',
        last_failure_stage = 'storage_cleanup',
        last_failure_category = p_result,
        next_retry_at = now() + make_interval(secs => p_retry_delay_seconds)
    where id = p_operation_id and user_id = p_user_id;
  else
    update public.voice_deletion_targets
    set status = 'manual_required',
        reconciliation_status = 'manual_required',
        verification_status = 'manual_required',
        last_failure_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'manual_required',
        last_failure_stage = 'storage_cleanup',
        last_failure_category = p_result,
        next_retry_at = null,
        manual_reason_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_operation_id and user_id = p_user_id;
  end if;

  return v_target;
end;
$$;

revoke all on function public.enter_voice_deletion_storage_cleanup_stage(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.begin_storage_object_delete_attempt(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_storage_object_delete_result(uuid, uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.begin_storage_object_verification_attempt(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_storage_object_verification_result(uuid, uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.g5c_b3_storage_reference_fence_active(uuid, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b3_voice_storage_reference_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b3_voice_consent_storage_reference_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b3_script_audio_storage_reference_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5c_b3_saved_model_audio_reference_fence() from public, anon, authenticated, service_role;
grant execute on function public.enter_voice_deletion_storage_cleanup_stage(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.begin_storage_object_delete_attempt(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.record_storage_object_delete_result(uuid, uuid, uuid, uuid, integer, text, integer) to service_role;
grant execute on function public.begin_storage_object_verification_attempt(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.record_storage_object_verification_result(uuid, uuid, uuid, uuid, integer, text, integer) to service_role;
