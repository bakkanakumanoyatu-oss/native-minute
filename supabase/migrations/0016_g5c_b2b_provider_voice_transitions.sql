-- G5C-B2b: focused, lease-owned state transitions for one provider_voice target.
-- These functions intentionally do not advance Storage/database stages or complete an operation.

create or replace function public.begin_provider_voice_delete_attempt(
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
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 0 then
    raise exception 'invalid provider voice delete attempt request';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.current_stage <> 'provider_cleanup'
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
    or v_target.target_kind <> 'provider_voice'
    or v_target.provider_name <> 'elevenlabs'
    or v_target.provider_resource_id is null
    or btrim(v_target.provider_resource_id) = ''
    or v_target.delete_attempt_count <> p_expected_delete_attempt_count
    or not (
      (v_target.status = 'pending' and v_target.delete_attempt_count = 0)
      or (v_target.status = 'delete_requested' and v_target.reconciliation_status = 'present')
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
        last_failure_stage = 'provider_cleanup',
        last_failure_category = 'retry_budget_exhausted',
        next_retry_at = null,
        manual_reason_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now()),
        last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id;

    return v_target;
  end if;

  update public.voice_deletion_targets
  set status = 'delete_requested',
      delete_outcome = 'not_attempted',
      reconciliation_status = 'pending',
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

create or replace function public.record_provider_voice_delete_result(
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
  v_is_manual boolean;
  v_is_transient boolean;
  v_delete_outcome text;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 1
    or p_result not in (
      'deleted', 'not_found', 'credential_missing', 'invalid_provider_reference', 'auth_failed',
      'permission_denied', 'rate_limited', 'provider_unavailable', 'timeout', 'network_error',
      'provider_rejected', 'protocol_error'
    )
    or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300 then
    raise exception 'invalid provider voice delete result';
  end if;

  v_is_manual := p_result in ('credential_missing', 'invalid_provider_reference', 'auth_failed', 'permission_denied', 'provider_rejected');
  v_is_transient := p_result in ('rate_limited', 'provider_unavailable', 'timeout', 'network_error', 'protocol_error');

  if (v_is_transient and p_retry_delay_seconds < 1) or (not v_is_transient and p_retry_delay_seconds <> 0) then
    raise exception 'invalid provider voice delete retry delay';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.status <> 'processing'
    or v_operation.current_stage <> 'provider_cleanup'
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now() then
    return null;
  end if;

  select * into v_target
  from public.voice_deletion_targets
  where id = p_target_id
    and operation_id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found
    or v_target.target_kind <> 'provider_voice'
    or v_target.provider_name <> 'elevenlabs'
    or v_target.status <> 'delete_requested'
    or v_target.reconciliation_status <> 'pending'
    or v_target.delete_attempt_count <> p_expected_delete_attempt_count then
    return null;
  end if;

  if p_result = 'deleted' then
    update public.voice_deletion_targets
    set status = 'deleted',
        delete_outcome = 'succeeded',
        reconciliation_status = 'pending',
        verification_status = 'not_applicable',
        delete_succeeded_at = coalesce(delete_succeeded_at, now()),
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif p_result = 'not_found' then
    update public.voice_deletion_targets
    set delete_outcome = 'not_found', reconciliation_status = 'pending', verification_status = 'pending', last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif v_is_manual then
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
        last_failure_stage = 'provider_cleanup',
        last_failure_category = p_result,
        next_retry_at = null,
        manual_reason_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_operation_id and user_id = p_user_id;
  else
    v_delete_outcome := case when p_result = 'timeout' then 'timed_out' when p_result = 'protocol_error' then 'rejected' else 'unavailable' end;

    update public.voice_deletion_targets
    set delete_outcome = v_delete_outcome,
        reconciliation_status = 'pending',
        verification_status = 'pending',
        last_failure_category = p_result
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'partial_failure',
        last_failure_stage = 'provider_cleanup',
        last_failure_category = p_result,
        next_retry_at = now() + make_interval(secs => p_retry_delay_seconds)
    where id = p_operation_id and user_id = p_user_id;
  end if;

  return v_target;
end;
$$;

create or replace function public.begin_provider_voice_reconciliation_attempt(
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
    raise exception 'invalid provider voice reconciliation attempt request';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.current_stage <> 'provider_cleanup'
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
    or v_target.target_kind <> 'provider_voice'
    or v_target.provider_name <> 'elevenlabs'
    or v_target.provider_resource_id is null
    or btrim(v_target.provider_resource_id) = ''
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count
    or not (
      v_target.status in ('delete_requested', 'deleted')
      and v_target.reconciliation_status in ('pending', 'unavailable')
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
        last_failure_stage = 'provider_cleanup',
        last_failure_category = 'retry_budget_exhausted',
        next_retry_at = null,
        manual_reason_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now()),
        last_attempted_at = now()
    where id = p_operation_id and user_id = p_user_id;

    return v_target;
  end if;

  update public.voice_deletion_targets
  set reconciliation_status = 'pending',
      verification_status = 'pending',
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

create or replace function public.record_provider_voice_reconciliation_result(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_verification_attempt_count integer,
  p_result text,
  p_owner_signal text,
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
  v_is_manual boolean;
  v_is_transient boolean;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_verification_attempt_count is null or p_expected_verification_attempt_count < 1
    or p_result not in (
      'present', 'verified_absent', 'credential_missing', 'invalid_provider_reference', 'auth_failed',
      'permission_denied', 'rate_limited', 'provider_unavailable', 'timeout', 'network_error',
      'provider_rejected', 'protocol_error'
    )
    or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300
    or (p_result = 'present' and p_owner_signal not in ('true', 'false', 'unknown'))
    or (p_result <> 'present' and p_owner_signal is not null) then
    raise exception 'invalid provider voice reconciliation result';
  end if;

  v_is_manual := p_result in ('credential_missing', 'invalid_provider_reference', 'auth_failed', 'permission_denied', 'provider_rejected');
  v_is_transient := p_result in ('rate_limited', 'provider_unavailable', 'timeout', 'network_error', 'protocol_error');

  if (v_is_transient and p_retry_delay_seconds < 1) or (not v_is_transient and p_retry_delay_seconds <> 0) then
    raise exception 'invalid provider voice reconciliation retry delay';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.status <> 'processing'
    or v_operation.current_stage <> 'provider_cleanup'
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= now() then
    return null;
  end if;

  select * into v_target
  from public.voice_deletion_targets
  where id = p_target_id
    and operation_id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found
    or v_target.target_kind <> 'provider_voice'
    or v_target.provider_name <> 'elevenlabs'
    or v_target.status not in ('delete_requested', 'deleted')
    or v_target.reconciliation_status <> 'pending'
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count then
    return null;
  end if;

  if p_result = 'verified_absent' then
    update public.voice_deletion_targets
    set status = 'verified_absent',
        reconciliation_status = 'verified_absent',
        verification_status = 'not_applicable',
        verified_absent_at = coalesce(verified_absent_at, now()),
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif p_result = 'present' and p_owner_signal <> 'false' then
    update public.voice_deletion_targets
    set status = 'delete_requested',
        reconciliation_status = 'present',
        verification_status = 'present',
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'processing', last_failure_stage = null, last_failure_category = null, next_retry_at = null
    where id = p_operation_id and user_id = p_user_id;
  elsif (p_result = 'present' and p_owner_signal = 'false') or v_is_manual then
    update public.voice_deletion_targets
    set status = 'manual_required',
        reconciliation_status = 'manual_required',
        verification_status = 'manual_required',
        last_failure_category = case when p_result = 'present' then 'ownership_unverified' else p_result end,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'manual_required',
        last_failure_stage = 'provider_cleanup',
        last_failure_category = case when p_result = 'present' then 'ownership_unverified' else p_result end,
        next_retry_at = null,
        manual_reason_category = case when p_result = 'present' then 'ownership_unverified' else p_result end,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_operation_id and user_id = p_user_id;
  else
    update public.voice_deletion_targets
    set reconciliation_status = 'unavailable',
        verification_status = 'unavailable',
        last_failure_category = p_result
    where id = p_target_id
    returning * into v_target;

    update public.voice_deletion_operations
    set status = 'partial_failure',
        last_failure_stage = 'provider_cleanup',
        last_failure_category = p_result,
        next_retry_at = now() + make_interval(secs => p_retry_delay_seconds)
    where id = p_operation_id and user_id = p_user_id;
  end if;

  return v_target;
end;
$$;

revoke all on function public.begin_provider_voice_delete_attempt(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_provider_voice_delete_result(uuid, uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.begin_provider_voice_reconciliation_attempt(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_provider_voice_reconciliation_result(uuid, uuid, uuid, uuid, integer, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.begin_provider_voice_delete_attempt(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.record_provider_voice_delete_result(uuid, uuid, uuid, uuid, integer, text, integer) to service_role;
grant execute on function public.begin_provider_voice_reconciliation_attempt(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.record_provider_voice_reconciliation_result(uuid, uuid, uuid, uuid, integer, text, text, integer) to service_role;
