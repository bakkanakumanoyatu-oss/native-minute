-- G5C-B5 adds only the focused durable transitions needed after B4 database
-- cleanup. It does not add a worker, queue, product status, or completion path.

create or replace function public.mark_voice_deletion_preflight_manual_required(
  p_user_id uuid
)
returns public.voice_deletion_operations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.voice_deletion_operations;
begin
  if p_user_id is null then
    raise exception 'voice deletion operation user is required';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where user_id = p_user_id
    and status in ('pending', 'processing', 'partial_failure', 'manual_required')
  order by requested_at desc
  limit 1
  for update;

  if not found then
    begin
      insert into public.voice_deletion_operations (user_id)
      values (p_user_id)
      returning * into v_operation;
    exception
      when unique_violation then
        select * into v_operation
        from public.voice_deletion_operations
        where user_id = p_user_id
          and status in ('pending', 'processing', 'partial_failure', 'manual_required')
        order by requested_at desc
        limit 1
        for update;
    end;
  end if;

  if v_operation.status = 'manual_required' then
    return v_operation;
  end if;

  if v_operation.snapshot_status <> 'pending'
    or v_operation.current_stage is not null
    or v_operation.destructive_started_at is not null then
    return null;
  end if;

  update public.voice_deletion_operations
  set status = 'manual_required',
      current_stage = 'snapshot',
      snapshot_status = 'manual_required',
      last_failure_stage = 'snapshot',
      last_failure_category = 'preflight_manual_candidate',
      manual_reason_category = 'preflight_manual_candidate',
      manual_required_at = coalesce(manual_required_at, now()),
      next_retry_at = null,
      lease_token = null,
      lease_expires_at = null,
      last_attempted_at = now()
  where id = v_operation.id
    and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.enter_voice_deletion_post_delete_verification_stage(
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
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.current_stage <> 'database_cleanup'
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count
    or v_operation.next_retry_at is not null
    or exists (
      select 1 from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.status in ('pending', 'delete_requested', 'deleted', 'manual_required')
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'provider_voice'
        and (target.status <> 'verified_absent'
          or target.reconciliation_status <> 'verified_absent'
          or target.verification_status <> 'not_applicable')
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind in (
          'voice_sample', 'voice_consent_recording', 'script_audio_storage',
          'script_audio', 'saved_model_audio', 'voice_binding'
        )
        and (target.status <> 'verified_absent'
          or target.verification_status <> 'verified_absent'
          or target.reconciliation_status <> 'not_applicable')
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      join public.script_saved_model_audios as saved on saved.id = target.source_row_id
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'saved_model_audio'
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      join public.script_audios as audio on audio.id = target.source_row_id
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'script_audio'
    )
    or exists (
      select 1 from public.voice_deletion_targets as target
      join public.voices as voice on voice.id = target.source_row_id
      where target.operation_id = p_operation_id and target.user_id = p_user_id
        and target.target_kind = 'voice_binding'
    )
    or public.g5c_b4_is_current_voice_cloning_consent(p_user_id, null) then
    return null;
  end if;

  update public.voice_deletion_operations
  set status = 'processing',
      current_stage = 'post_delete_verification',
      post_delete_verification_status = 'processing',
      last_failure_stage = null,
      last_failure_category = null,
      manual_reason_category = null,
      manual_required_at = null,
      next_retry_at = null,
      last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.complete_voice_deletion_post_delete_verification(
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
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null
    or p_expected_runner_attempt_count < 1
    or v_operation.status not in ('processing', 'partial_failure')
    or v_operation.current_stage <> 'post_delete_verification'
    or v_operation.post_delete_verification_status <> 'processing'
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now()
    or v_operation.runner_attempt_count <> p_expected_runner_attempt_count
    or (v_operation.next_retry_at is not null and v_operation.next_retry_at > now()) then
    return null;
  end if;

  lock table public.script_saved_model_audios, public.script_audios, public.voices,
    public.processing_consents in share row exclusive mode;

  if exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.status = 'manual_required'
  ) then
    v_manual_reason := 'manual_target_present';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.status in ('pending', 'delete_requested', 'deleted')
  ) then
    v_manual_reason := 'unresolved_target_present';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'provider_voice'
      and (target.status <> 'verified_absent'
        or target.reconciliation_status <> 'verified_absent'
        or target.verification_status <> 'not_applicable')
  ) then
    v_manual_reason := 'provider_absence_not_durable';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind in (
        'voice_sample', 'voice_consent_recording', 'script_audio_storage',
        'script_audio', 'saved_model_audio', 'voice_binding'
      )
      and (target.status <> 'verified_absent'
        or target.verification_status <> 'verified_absent'
        or target.reconciliation_status <> 'not_applicable')
  ) then
    v_manual_reason := 'target_absence_not_durable';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    join public.script_saved_model_audios as saved on saved.id = target.source_row_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'saved_model_audio'
  ) then
    v_manual_reason := 'target_saved_model_audio_present';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    join public.script_audios as audio on audio.id = target.source_row_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'script_audio'
  ) then
    v_manual_reason := 'target_script_audio_present';
  elsif exists (
    select 1 from public.voice_deletion_targets as target
    join public.voices as voice on voice.id = target.source_row_id
    where target.operation_id = p_operation_id and target.user_id = p_user_id
      and target.target_kind = 'voice_binding'
  ) then
    v_manual_reason := 'target_elevenlabs_voice_present';
  elsif exists (
    select 1 from public.voices as voice
    where voice.user_id = p_user_id and voice.provider = 'elevenlabs'
  ) then
    v_manual_reason := 'current_elevenlabs_voice_present';
  elsif public.g5c_b4_is_current_voice_cloning_consent(p_user_id, null) then
    v_manual_reason := 'current_exact_voice_cloning_consent_active';
  elsif v_operation.next_retry_at is not null then
    v_manual_reason := 'retry_state_present';
  end if;

  if v_manual_reason is not null then
    update public.voice_deletion_operations
    set status = 'manual_required',
        post_delete_verification_status = 'manual_required',
        verification_attempt_count = verification_attempt_count + 1,
        last_failure_stage = 'post_delete_verification',
        last_failure_category = v_manual_reason,
        manual_reason_category = v_manual_reason,
        manual_required_at = coalesce(manual_required_at, now()),
        next_retry_at = null,
        last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id
    returning * into v_operation;
    return v_operation;
  end if;

  update public.voice_deletion_operations
  set status = 'processing',
      post_delete_verification_status = 'succeeded',
      verification_attempt_count = verification_attempt_count + 1,
      consent_snapshot_ids = '{}'::uuid[],
      last_failure_stage = null,
      last_failure_category = null,
      manual_reason_category = null,
      manual_required_at = null,
      next_retry_at = null,
      last_attempted_at = now()
  where id = p_operation_id and user_id = p_user_id
  returning * into v_operation;

  -- Deliberately no call to finalize_voice_deletion_operation here. Completion is
  -- available only to a later request-driven invocation with a fresh live lease.
  return v_operation;
end;
$$;

revoke all on function public.mark_voice_deletion_preflight_manual_required(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.enter_voice_deletion_post_delete_verification_stage(uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_voice_deletion_post_delete_verification(uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.mark_voice_deletion_preflight_manual_required(uuid) to service_role;
grant execute on function public.enter_voice_deletion_post_delete_verification_stage(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.complete_voice_deletion_post_delete_verification(uuid, uuid, uuid, integer) to service_role;
