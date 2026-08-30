-- G5C-B7 Option D is a deliberately narrow human-approved recovery transition.
-- It accepts no provider evidence, does not call a provider, and cannot advance
-- beyond provider_cleanup. The existing strict automated 404 reconciliation path
-- remains the only automatic proof of provider absence.
create or replace function public.accept_g5c_b7_manual_provider_absence(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_verification_attempt_count integer
)
returns public.voice_deletion_operations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
  v_provider_target public.voice_deletion_targets;
  v_provider_target_count integer := 0;
  v_storage_target_count integer := 0;
  v_database_target_count integer := 0;
  v_total_target_count integer := 0;
begin
  if p_operation_id is null
    or p_user_id is null
    or p_target_id is null
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or p_expected_verification_attempt_count is null
    or p_expected_verification_attempt_count < 1 then
    return null;
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found
    or v_operation.status <> 'manual_required'
    or v_operation.current_stage is distinct from 'provider_cleanup'
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status <> 'succeeded'
    or v_operation.destructive_started_at is null
    or v_operation.last_failure_stage is distinct from 'provider_cleanup'
    or v_operation.last_failure_category is distinct from 'provider_rejected'
    or v_operation.manual_reason_category is distinct from 'provider_rejected'
    or v_operation.manual_required_at is null
    or v_operation.next_retry_at is not null
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  -- The retained account and target script must still be present and owned by
  -- this exact user. This transition has no authority to repair a different
  -- deletion state or an unsealed/cross-user target relation.
  if not exists (select 1 from auth.users as account where account.id = p_user_id)
    or exists (
      select 1
      from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id
        and target.user_id <> p_user_id
    )
    or exists (
      select 1
      from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id
        and (
          target.target_fingerprint is null
          or btrim(target.target_fingerprint) = ''
        )
    ) then
    return null;
  end if;

  select count(*) into v_total_target_count
  from public.voice_deletion_targets as target
  where target.operation_id = p_operation_id
    and target.user_id = p_user_id;

  select count(*) into v_provider_target_count
  from public.voice_deletion_targets as target
  where target.operation_id = p_operation_id
    and target.user_id = p_user_id
    and target.target_kind = 'provider_voice';

  select count(*) into v_storage_target_count
  from public.voice_deletion_targets as target
  where target.operation_id = p_operation_id
    and target.user_id = p_user_id
    and target.target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage');

  select count(*) into v_database_target_count
  from public.voice_deletion_targets as target
  where target.operation_id = p_operation_id
    and target.user_id = p_user_id
    and target.target_kind in ('script_audio', 'saved_model_audio', 'voice_binding');

  if v_total_target_count <> 6
    or v_provider_target_count <> 1
    or v_storage_target_count <> 3
    or v_database_target_count <> 2
    or (select count(*) from public.voice_deletion_targets as target
        where target.operation_id = p_operation_id and target.user_id = p_user_id
          and target.target_kind = 'voice_sample') <> 1
    or (select count(*) from public.voice_deletion_targets as target
        where target.operation_id = p_operation_id and target.user_id = p_user_id
          and target.target_kind = 'voice_consent_recording') <> 1
    or (select count(*) from public.voice_deletion_targets as target
        where target.operation_id = p_operation_id and target.user_id = p_user_id
          and target.target_kind = 'script_audio_storage') <> 1
    or (select count(*) from public.voice_deletion_targets as target
        where target.operation_id = p_operation_id and target.user_id = p_user_id
          and target.target_kind = 'script_audio') <> 1
    or (select count(*) from public.voice_deletion_targets as target
        where target.operation_id = p_operation_id and target.user_id = p_user_id
          and target.target_kind = 'voice_binding') <> 1
    or exists (
      select 1
      from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id
        and target.user_id = p_user_id
        and target.target_kind = 'saved_model_audio'
    ) then
    return null;
  end if;

  select * into v_provider_target
  from public.voice_deletion_targets
  where id = p_target_id
    and operation_id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found
    or v_provider_target.target_kind <> 'provider_voice'
    or v_provider_target.provider_name is distinct from 'elevenlabs'
    or v_provider_target.provider_resource_id is null
    or btrim(v_provider_target.provider_resource_id) = ''
    or v_provider_target.status <> 'manual_required'
    or v_provider_target.reconciliation_status <> 'manual_required'
    or v_provider_target.verification_status <> 'manual_required'
    or v_provider_target.delete_attempt_count <> 1
    or v_provider_target.delete_outcome <> 'succeeded'
    or v_provider_target.verification_attempt_count <> p_expected_verification_attempt_count
    or v_provider_target.verification_attempt_count < 1
    or v_provider_target.last_failure_category is distinct from 'provider_rejected'
    or v_provider_target.manual_required_at is null
    or v_provider_target.verified_absent_at is not null then
    return null;
  end if;

  -- Storage and DB targets must be the exact sealed downstream universe and
  -- must still be untouched. This RPC never executes either cleanup plane.
  if exists (
    select 1
    from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id
      and target.user_id = p_user_id
      and target.target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage', 'script_audio', 'voice_binding')
      and (
        target.status <> 'pending'
        or target.delete_outcome <> 'not_attempted'
        or target.reconciliation_status <> 'not_applicable'
        or target.verification_status <> 'pending'
        or target.delete_attempt_count <> 0
        or target.verification_attempt_count <> 0
        or target.last_failure_category is not null
        or target.last_attempted_at is not null
        or target.delete_succeeded_at is not null
        or target.verified_absent_at is not null
        or target.manual_required_at is not null
      )
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.voice_deletion_targets as provider_target
    join public.voice_deletion_targets as binding_target
      on binding_target.operation_id = provider_target.operation_id
      and binding_target.user_id = provider_target.user_id
      and binding_target.target_kind = 'voice_binding'
    join public.voices as voice
      on voice.id = binding_target.source_row_id
    join public.voice_deletion_targets as script_audio_target
      on script_audio_target.operation_id = provider_target.operation_id
      and script_audio_target.user_id = provider_target.user_id
      and script_audio_target.target_kind = 'script_audio'
    join public.script_audios as script_audio
      on script_audio.id = script_audio_target.source_row_id
    join public.scripts as script
      on script.id = script_audio.script_id
    where provider_target.id = p_target_id
      and provider_target.operation_id = p_operation_id
      and provider_target.user_id = p_user_id
      and voice.user_id = p_user_id
      and voice.provider = 'elevenlabs'
      and provider_target.source_row_id = voice.id
      and provider_target.provider_resource_id = voice.provider_voice_id
      and script.user_id = p_user_id
  ) then
    return null;
  end if;

  -- Historical withdrawn consent stays retained. Any current active voice-cloning
  -- consent, canonical or malformed, blocks this special acceptance transition.
  if cardinality(v_operation.consent_snapshot_ids) = 0
    or exists (
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
        or consent.status <> 'withdrawn'
    )
    or public.g5c_b4_is_current_voice_cloning_consent(p_user_id, null)
    or exists (
      select 1
      from public.processing_consents as consent
      where consent.user_id = p_user_id
        and consent.consent_type = 'voice_cloning'
        and consent.status = 'active'
    ) then
    return null;
  end if;

  update public.voice_deletion_targets
  set status = 'verified_absent',
      reconciliation_status = 'verified_absent',
      verification_status = 'not_applicable',
      verified_absent_at = now(),
      last_failure_category = 'manual_provider_absence_accepted',
      last_attempted_at = now()
  where id = p_target_id
    and operation_id = p_operation_id
    and user_id = p_user_id;

  update public.voice_deletion_operations
  set status = 'processing',
      current_stage = 'provider_cleanup',
      last_failure_stage = null,
      last_failure_category = null,
      manual_reason_category = null,
      manual_required_at = null,
      next_retry_at = null
  where id = p_operation_id
    and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

revoke all on function public.accept_g5c_b7_manual_provider_absence(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.accept_g5c_b7_manual_provider_absence(uuid, uuid, uuid, uuid, integer, integer) to service_role;
