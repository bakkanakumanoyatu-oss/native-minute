-- Forward-only G5C-B3 remediation. 0017 is already canonical and remains unchanged.
-- `invalid_target` is a local adapter contract failure, distinct from an external
-- Storage `rejected` result, which must keep its verification-first delete semantics.

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
      'request_succeeded', 'invalid_target', 'timed_out', 'rate_limited', 'unavailable', 'network_error',
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
  elsif p_result in ('auth_failed', 'permission_denied', 'invalid_target') then
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
      'absent', 'present', 'invalid_target', 'timed_out', 'rate_limited', 'unavailable', 'network_error',
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
  elsif p_result = 'invalid_target' then
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

revoke all on function public.record_storage_object_delete_result(uuid, uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_storage_object_verification_result(uuid, uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.record_storage_object_delete_result(uuid, uuid, uuid, uuid, integer, text, integer) to service_role;
grant execute on function public.record_storage_object_verification_result(uuid, uuid, uuid, uuid, integer, text, integer) to service_role;
