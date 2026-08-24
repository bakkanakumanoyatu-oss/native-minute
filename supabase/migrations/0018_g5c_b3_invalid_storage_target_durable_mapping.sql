-- Forward-only G5C-B3 remediation. 0017 remains canonical and unchanged.
-- A local adapter/projection contract violation is not an external Storage result.
-- It has one narrow, durable manual-required sink and never accepts a locator.

create or replace function public.mark_storage_object_invalid_target_manual_required(
  p_operation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_delete_attempt_count integer,
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
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 0
    or p_expected_verification_attempt_count is null or p_expected_verification_attempt_count < 0 then
    raise exception 'invalid storage target contract transition';
  end if;

  select * into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if not found
    or v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.current_stage <> 'storage_cleanup'
    or v_operation.status = 'completed'
    or v_operation.status not in ('processing', 'partial_failure')
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

  -- This is deliberately limited to the three B3 Storage target kinds. It cannot
  -- manualize provider, relational, or any future target kind.
  if not found
    or v_target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')
    or v_target.status in ('verified_absent', 'manual_required')
    or v_target.locator_scrubbed_at is not null
    or v_target.delete_attempt_count <> p_expected_delete_attempt_count
    or v_target.verification_attempt_count <> p_expected_verification_attempt_count then
    return null;
  end if;

  update public.voice_deletion_targets
  set status = 'manual_required',
      reconciliation_status = 'manual_required',
      verification_status = 'manual_required',
      last_failure_category = 'invalid_target',
      manual_required_at = coalesce(manual_required_at, now())
  where id = p_target_id
  returning * into v_target;

  update public.voice_deletion_operations
  set status = 'manual_required',
      last_failure_stage = 'storage_cleanup',
      last_failure_category = 'invalid_target',
      next_retry_at = null,
      manual_reason_category = 'invalid_target',
      manual_required_at = coalesce(manual_required_at, now())
  where id = p_operation_id and user_id = p_user_id;

  return v_target;
end;
$$;

revoke all on function public.mark_storage_object_invalid_target_manual_required(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.mark_storage_object_invalid_target_manual_required(uuid, uuid, uuid, uuid, integer, integer) to service_role;
