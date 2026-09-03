-- G5D Completion: focused atomic account-deletion completion foundation.
-- This migration adds no service/operator routing, external action, notification
-- sender, purge worker, retention-policy change, or new table/column.

-- Fail closed before installing authority. Historical completion evidence cannot
-- be inferred or repaired safely by this migration.
do $$
begin
  if exists (
    select 1
    from public.account_deletion_requests as request
    where
      (
        request.status <> 'completed'
        and request.completed_at is not null
      )
      or
      (
        request.status = 'completed'
        and (
          request.completed_at is null
          or request.expires_at is distinct from request.completed_at + interval '2160 hours'
          or request.last_attempted_at is distinct from request.completed_at
          or request.user_id is not null
          or request.failure_stage is not null
          or request.failure_reason_code is not null
          or request.notification_status <> 'not_needed'
          or request.metadata <> '{}'::jsonb
          or request.provider_snapshot_version <> 'g5d-2a.account-provider.v1'
          or request.provider_snapshot_status <> 'sealed'
          or request.provider_snapshot_seal_version <> 1
          or request.provider_snapshot_sealed_at is null
          or request.provider_cleanup_status not in ('succeeded', 'not_needed')
          or request.provider_sub_finalized_at is null
          or request.provider_locator_scrubbed_at is distinct from request.provider_sub_finalized_at
          or request.provider_runner_lease_token is not null
          or request.provider_runner_lease_expires_at is not null
          or request.provider_verified_absent_count <> request.provider_snapshot_target_count
          or request.storage_snapshot_version <> 'g5d-2e.account-storage.v1'
          or request.storage_snapshot_status <> 'sealed'
          or request.storage_snapshot_seal_version <> 1
          or request.storage_snapshot_collection_token is not null
          or request.storage_snapshot_collection_started_at is null
          or request.storage_snapshot_sealed_at is null
          or request.storage_snapshot_fingerprint is not null
          or request.storage_cleanup_status not in ('succeeded', 'not_needed')
          or request.storage_sub_finalized_at is null
          or request.storage_locator_scrubbed_at is distinct from request.storage_sub_finalized_at
          or request.storage_runner_lease_token is not null
          or request.storage_runner_lease_expires_at is not null
          or request.storage_verified_absent_count <> request.storage_snapshot_target_count
          or request.db_inventory_version <> 'g5d-2h.account-db.v1'
          or request.db_cleanup_status not in ('succeeded', 'not_needed')
          or request.db_sub_finalized_at is null
          or request.db_observed_row_count < 0
          or request.db_deleted_row_count < 0
          or request.db_anonymized_row_count < 0
          or request.db_retained_row_count < 0
          or request.db_observed_row_count::bigint <>
            request.db_deleted_row_count::bigint
              + request.db_anonymized_row_count::bigint
              + request.db_retained_row_count::bigint
          or request.auth_intent_version <> 'g5d-2m.auth-delete.v1'
          or request.auth_delete_target_user_id is not null
          or request.auth_delete_requested_at is null
          or request.auth_verification_attempt_count < 1
          or request.auth_verification_result is not null
          or request.auth_verification_result_attempt_count is not null
          or request.auth_verified_absent_at is null
          or request.auth_sub_finalized_at is null
          or request.auth_verified_absent_at < request.auth_delete_requested_at
          or request.auth_sub_finalized_at < request.auth_verified_absent_at
          or not (
            (request.provider_cleanup_status = 'not_needed' and request.provider_snapshot_target_count = 0)
            or (request.provider_cleanup_status = 'succeeded' and request.provider_snapshot_target_count > 0)
          )
          or not (
            (request.storage_cleanup_status = 'not_needed' and request.storage_snapshot_target_count = 0)
            or (request.storage_cleanup_status = 'succeeded' and request.storage_snapshot_target_count > 0)
          )
          or not (
            (
              request.db_cleanup_status = 'not_needed'
              and request.db_deleted_row_count = 0
              and request.db_anonymized_row_count = 0
            )
            or (
              request.db_cleanup_status = 'succeeded'
              and request.db_deleted_row_count::bigint + request.db_anonymized_row_count::bigint > 0
            )
          )
          or not (
            (request.auth_cleanup_status = 'not_needed' and request.auth_delete_generation = 0)
            or (request.auth_cleanup_status = 'succeeded' and request.auth_delete_generation = 1)
          )
          or request.db_retained_row_count::bigint <> 1::bigint
            + (select count(*) from public.account_deletion_provider_targets as target
                where target.deletion_request_id = request.id)
            + (select count(*) from public.account_deletion_storage_targets as target
                where target.deletion_request_id = request.id)
          or request.provider_snapshot_target_count::bigint <>
            (select count(*) from public.account_deletion_provider_targets as target
              where target.deletion_request_id = request.id)
          or request.storage_snapshot_target_count::bigint <>
            (select count(*) from public.account_deletion_storage_targets as target
              where target.deletion_request_id = request.id)
          or exists (
            select 1
            from public.account_deletion_provider_targets as target
            where target.deletion_request_id = request.id
              and (
                target.user_id is not null
                or target.status <> 'verified_absent'
                or target.reconciliation_status <> 'verified_absent'
                or target.verified_absent_at is null
                or target.locator_scrubbed_at is distinct from request.provider_sub_finalized_at
                or target.source_voice_id is not null
                or target.provider_name is not null
                or target.provider_resource_id is not null
                or target.target_fingerprint is not null
                or target.next_retry_at is not null
                or target.last_failure_category is not null
                or target.manual_required_at is not null
              )
          )
          or exists (
            select 1
            from public.account_deletion_storage_targets as target
            where target.deletion_request_id = request.id
              and (
                target.user_id is not null
                or target.status <> 'verified_absent'
                or target.verification_status <> 'verified_absent'
                or target.verified_absent_at is null
                or target.locator_scrubbed_at is distinct from request.storage_sub_finalized_at
                or target.storage_bucket is not null
                or target.storage_object_key is not null
                or target.target_fingerprint is not null
                or target.source_refs is not null
                or target.next_retry_at is not null
                or target.last_failure_category is not null
                or target.manual_required_at is not null
              )
          )
        )
      )
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'historical account deletion completion rows require reconciliation before G5D Completion';
  end if;
end;
$$;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_completion_terminal_shape_check check (
    (
      status = 'completed'
      and completed_at is not null
      and expires_at is not null
      and expires_at = completed_at + interval '2160 hours'
      and last_attempted_at is not null
      and last_attempted_at = completed_at
      and user_id is null
      and failure_stage is null
      and failure_reason_code is null
      and notification_status = 'not_needed'
      and metadata = '{}'::jsonb
    )
    or
    (
      status <> 'completed'
      and completed_at is null
    )
  );

-- G5D-2M correctly protects every Auth durable field after sub-finalization, but
-- its terminal-entry clause also rejected later updates that changed no Auth
-- field. Preserve all Auth transition/immutability rules while allowing the
-- separate Completion transition to update only Completion-owned columns.
create or replace function public.enforce_account_deletion_auth_durable_authority()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_protected_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.auth_intent_version is not null
      or new.auth_delete_target_user_id is not null
      or new.auth_delete_generation <> 0
      or new.auth_delete_requested_at is not null
      or new.auth_verification_attempt_count <> 0
      or new.auth_verification_result is not null
      or new.auth_verification_result_attempt_count is not null
      or new.auth_verified_absent_at is not null
      or new.auth_sub_finalized_at is not null
      or new.auth_cleanup_status in ('succeeded', 'not_needed') then
      raise exception using
        errcode = 'insufficient_privilege',
        message = 'account deletion Auth durable state requires focused authority';
    end if;
    return new;
  end if;

  v_protected_changed :=
    new.auth_intent_version is distinct from old.auth_intent_version
    or new.auth_delete_target_user_id is distinct from old.auth_delete_target_user_id
    or new.auth_delete_generation is distinct from old.auth_delete_generation
    or new.auth_delete_requested_at is distinct from old.auth_delete_requested_at
    or new.auth_verification_attempt_count is distinct from old.auth_verification_attempt_count
    or new.auth_verification_result is distinct from old.auth_verification_result
    or new.auth_verification_result_attempt_count is distinct from old.auth_verification_result_attempt_count
    or new.auth_verified_absent_at is distinct from old.auth_verified_absent_at
    or new.auth_sub_finalized_at is distinct from old.auth_sub_finalized_at
    or new.auth_cleanup_status is distinct from old.auth_cleanup_status;

  if old.auth_sub_finalized_at is not null and v_protected_changed then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth terminal evidence is immutable';
  end if;

  if old.auth_cleanup_status = 'manual_required'
    and new.auth_cleanup_status is distinct from old.auth_cleanup_status then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth manual state is sticky';
  end if;

  if old.auth_intent_version is not null
    and new.auth_intent_version is distinct from old.auth_intent_version then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth intent version is immutable';
  end if;

  if old.auth_delete_requested_at is not null
    and new.auth_delete_requested_at is distinct from old.auth_delete_requested_at then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth request timestamp is immutable';
  end if;

  if new.auth_delete_generation is distinct from old.auth_delete_generation
    and not (old.auth_delete_generation = 0 and new.auth_delete_generation = 1) then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth DELETE generation is monotonic and bounded';
  end if;

  if new.auth_verification_attempt_count is distinct from old.auth_verification_attempt_count
    and new.auth_verification_attempt_count <> old.auth_verification_attempt_count + 1 then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth verification attempt count is monotonic';
  end if;

  if old.auth_verified_absent_at is not null
    and new.auth_verified_absent_at is distinct from old.auth_verified_absent_at then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth verified-absence evidence is immutable';
  end if;

  if old.auth_delete_target_user_id is not null
    and new.auth_delete_target_user_id is distinct from old.auth_delete_target_user_id
    and not (
      new.auth_delete_target_user_id is null
      and old.auth_sub_finalized_at is null
      and new.auth_sub_finalized_at is not null
      and new.auth_cleanup_status in ('succeeded', 'not_needed')
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth target is immutable until sub-finalization';
  end if;

  if old.auth_delete_target_user_id is null
    and old.auth_intent_version is not null
    and new.auth_delete_target_user_id is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion Auth target cannot be restored';
  end if;

  if old.auth_sub_finalized_at is null
    and new.auth_cleanup_status in ('succeeded', 'not_needed')
    and not (
      new.auth_sub_finalized_at is not null
      and new.auth_delete_target_user_id is null
      and new.user_id is null
      and new.auth_verification_result is null
      and new.auth_verification_result_attempt_count is null
      and new.auth_verified_absent_at is not null
      and new.status = 'confirmed'
      and new.failure_stage is null
      and new.failure_reason_code is null
      and (
        (new.auth_cleanup_status = 'not_needed' and new.auth_delete_generation = 0)
        or
        (new.auth_cleanup_status = 'succeeded' and new.auth_delete_generation = 1)
      )
    ) then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'account deletion Auth terminal state requires focused sub-finalization';
  end if;

  return new;
end;
$$;

-- Exact persisted prior-stage authority shared by the transition trigger and RPC.
-- It does not accept caller-supplied stage flags and has no mutation path.
create or replace function public.account_deletion_completion_prerequisites_terminal(
  p_request public.account_deletion_requests
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce((
    p_request.id is not null
    and p_request.status in ('confirmed', 'completed')
    and p_request.user_id is null
    and p_request.failure_stage is null
    and p_request.failure_reason_code is null
    and p_request.metadata = '{}'::jsonb

    and p_request.provider_snapshot_version = 'g5d-2a.account-provider.v1'
    and p_request.provider_snapshot_status = 'sealed'
    and p_request.provider_snapshot_seal_version = 1
    and p_request.provider_snapshot_sealed_at is not null
    and p_request.provider_cleanup_status in ('succeeded', 'not_needed')
    and p_request.provider_sub_finalized_at is not null
    and p_request.provider_locator_scrubbed_at = p_request.provider_sub_finalized_at
    and p_request.provider_runner_lease_token is null
    and p_request.provider_runner_lease_expires_at is null
    and p_request.provider_verified_absent_count = p_request.provider_snapshot_target_count
    and (
      (p_request.provider_cleanup_status = 'not_needed' and p_request.provider_snapshot_target_count = 0)
      or (p_request.provider_cleanup_status = 'succeeded' and p_request.provider_snapshot_target_count > 0)
    )
    and p_request.provider_snapshot_target_count::bigint = (
      select count(*)
      from public.account_deletion_provider_targets as target
      where target.deletion_request_id = p_request.id
    )
    and not exists (
      select 1
      from public.account_deletion_provider_targets as target
      where target.deletion_request_id = p_request.id
        and (
          target.user_id is not null
          or target.status <> 'verified_absent'
          or target.reconciliation_status <> 'verified_absent'
          or target.verified_absent_at is null
          or target.locator_scrubbed_at is distinct from p_request.provider_sub_finalized_at
          or target.source_voice_id is not null
          or target.provider_name is not null
          or target.provider_resource_id is not null
          or target.target_fingerprint is not null
          or target.next_retry_at is not null
          or target.last_failure_category is not null
          or target.manual_required_at is not null
        )
    )

    and p_request.storage_snapshot_version = 'g5d-2e.account-storage.v1'
    and p_request.storage_snapshot_status = 'sealed'
    and p_request.storage_snapshot_seal_version = 1
    and p_request.storage_snapshot_collection_token is null
    and p_request.storage_snapshot_collection_started_at is not null
    and p_request.storage_snapshot_sealed_at is not null
    and p_request.storage_snapshot_fingerprint is null
    and p_request.storage_cleanup_status in ('succeeded', 'not_needed')
    and p_request.storage_sub_finalized_at is not null
    and p_request.storage_locator_scrubbed_at = p_request.storage_sub_finalized_at
    and p_request.storage_runner_lease_token is null
    and p_request.storage_runner_lease_expires_at is null
    and p_request.storage_verified_absent_count = p_request.storage_snapshot_target_count
    and (
      (p_request.storage_cleanup_status = 'not_needed' and p_request.storage_snapshot_target_count = 0)
      or (p_request.storage_cleanup_status = 'succeeded' and p_request.storage_snapshot_target_count > 0)
    )
    and p_request.storage_snapshot_target_count::bigint = (
      select count(*)
      from public.account_deletion_storage_targets as target
      where target.deletion_request_id = p_request.id
    )
    and not exists (
      select 1
      from public.account_deletion_storage_targets as target
      where target.deletion_request_id = p_request.id
        and (
          target.user_id is not null
          or target.status <> 'verified_absent'
          or target.verification_status <> 'verified_absent'
          or target.verified_absent_at is null
          or target.locator_scrubbed_at is distinct from p_request.storage_sub_finalized_at
          or target.storage_bucket is not null
          or target.storage_object_key is not null
          or target.target_fingerprint is not null
          or target.source_refs is not null
          or target.next_retry_at is not null
          or target.last_failure_category is not null
          or target.manual_required_at is not null
        )
    )

    and p_request.db_inventory_version = 'g5d-2h.account-db.v1'
    and p_request.db_cleanup_status in ('succeeded', 'not_needed')
    and p_request.db_sub_finalized_at is not null
    and p_request.db_observed_row_count >= 0
    and p_request.db_deleted_row_count >= 0
    and p_request.db_anonymized_row_count >= 0
    and p_request.db_retained_row_count >= 0
    and p_request.db_observed_row_count::bigint =
      p_request.db_deleted_row_count::bigint
        + p_request.db_anonymized_row_count::bigint
        + p_request.db_retained_row_count::bigint
    and (
      (
        p_request.db_cleanup_status = 'not_needed'
        and p_request.db_deleted_row_count = 0
        and p_request.db_anonymized_row_count = 0
      )
      or (
        p_request.db_cleanup_status = 'succeeded'
        and p_request.db_deleted_row_count::bigint + p_request.db_anonymized_row_count::bigint > 0
      )
    )
    and p_request.db_retained_row_count::bigint = 1::bigint
      + (select count(*) from public.account_deletion_provider_targets as target
          where target.deletion_request_id = p_request.id)
      + (select count(*) from public.account_deletion_storage_targets as target
          where target.deletion_request_id = p_request.id)

    and p_request.auth_intent_version = 'g5d-2m.auth-delete.v1'
    and p_request.auth_delete_target_user_id is null
    and p_request.auth_delete_generation in (0, 1)
    and p_request.auth_delete_requested_at is not null
    and p_request.auth_verification_attempt_count >= 1
    and p_request.auth_verification_result is null
    and p_request.auth_verification_result_attempt_count is null
    and p_request.auth_verified_absent_at is not null
    and p_request.auth_sub_finalized_at is not null
    and p_request.auth_verified_absent_at >= p_request.auth_delete_requested_at
    and p_request.auth_sub_finalized_at >= p_request.auth_verified_absent_at
    and (
      (p_request.auth_cleanup_status = 'not_needed' and p_request.auth_delete_generation = 0)
      or (p_request.auth_cleanup_status = 'succeeded' and p_request.auth_delete_generation = 1)
    )
  ), false);
$$;

create or replace function public.enforce_account_deletion_completion_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_completion_authority_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' or new.completed_at is not null then
      raise exception using
        errcode = 'insufficient_privilege',
        message = 'account deletion completion requires focused finalization';
    end if;
    return new;
  end if;

  v_completion_authority_changed :=
    new.status is distinct from old.status
    or new.completed_at is distinct from old.completed_at
    or new.expires_at is distinct from old.expires_at
    or new.notification_status is distinct from old.notification_status
    or new.failure_stage is distinct from old.failure_stage
    or new.failure_reason_code is distinct from old.failure_reason_code
    or new.user_id is distinct from old.user_id
    or new.metadata is distinct from old.metadata
    or new.last_attempted_at is distinct from old.last_attempted_at;

  if old.status = 'completed' and v_completion_authority_changed then
    raise exception using
      errcode = 'check_violation',
      message = 'completed account deletion authority is immutable';
  end if;

  if new.status = 'completed' then
    if old.status <> 'confirmed'
      or old.completed_at is not null
      or new.completed_at is null
      or new.expires_at is distinct from new.completed_at + interval '2160 hours'
      or new.last_attempted_at is distinct from new.completed_at
      or new.notification_status <> 'not_needed'
      or new.user_id is not null
      or new.failure_stage is not null
      or new.failure_reason_code is not null
      or new.metadata <> '{}'::jsonb
      or public.account_deletion_completion_prerequisites_terminal(new) is not true then
      raise exception using
        errcode = 'insufficient_privilege',
        message = 'account deletion completion requires focused finalization';
    end if;
  elsif new.completed_at is distinct from old.completed_at then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'account deletion completed_at requires focused finalization';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_account_deletion_completion_authority
  on public.account_deletion_requests;
create trigger enforce_account_deletion_completion_authority
  before insert or update on public.account_deletion_requests
  for each row
  execute function public.enforce_account_deletion_completion_authority();

create or replace function public.finalize_account_deletion_completion(
  p_deletion_request_id uuid
)
returns table(
  completion_status text,
  safe_reason text,
  completed_at timestamptz,
  expires_at timestamptz,
  already_completed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_completed_at timestamptz;
begin
  if p_deletion_request_id is null then
    raise exception using
      errcode = 'invalid_parameter_value',
      message = 'completion_request_identity_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests as request
  where request.id = p_deletion_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'completion_request_not_found';
  end if;

  if public.account_deletion_completion_prerequisites_terminal(v_request) is not true then
    raise exception using
      errcode = 'check_violation',
      message = 'completion_prerequisite_authority_invalid';
  end if;

  if v_request.status = 'completed' then
    if v_request.completed_at is null
      or v_request.expires_at is distinct from v_request.completed_at + interval '2160 hours'
      or v_request.last_attempted_at is distinct from v_request.completed_at
      or v_request.notification_status <> 'not_needed'
      or v_request.user_id is not null
      or v_request.failure_stage is not null
      or v_request.failure_reason_code is not null
      or v_request.metadata <> '{}'::jsonb then
      raise exception using
        errcode = 'check_violation',
        message = 'completion_terminal_replay_invalid';
    end if;

    return query select
      'completed'::text,
      'already_completed'::text,
      v_request.completed_at,
      v_request.expires_at,
      true;
    return;
  end if;

  if v_request.status <> 'confirmed'
    or v_request.completed_at is not null
    or v_request.notification_status <> 'pending'
    or v_request.last_attempted_at is distinct from v_request.auth_sub_finalized_at then
    raise exception using
      errcode = 'check_violation',
      message = 'completion_request_not_runnable';
  end if;

  v_completed_at := transaction_timestamp();

  update public.account_deletion_requests as request
  set status = 'completed',
      completed_at = v_completed_at,
      expires_at = v_completed_at + interval '2160 hours',
      notification_status = 'not_needed',
      failure_stage = null,
      failure_reason_code = null,
      last_attempted_at = v_completed_at
  where request.id = p_deletion_request_id
    and request.status = 'confirmed'
    and request.completed_at is null
  returning * into v_request;

  if not found then
    raise exception using
      errcode = 'serialization_failure',
      message = 'completion_terminal_write_lost';
  end if;

  return query select
    'completed'::text,
    'completion_finalized'::text,
    v_request.completed_at,
    v_request.expires_at,
    false;
end;
$$;

alter function public.account_deletion_completion_prerequisites_terminal(public.account_deletion_requests)
  owner to postgres;
alter function public.enforce_account_deletion_auth_durable_authority()
  owner to postgres;
alter function public.enforce_account_deletion_completion_authority()
  owner to postgres;
alter function public.finalize_account_deletion_completion(uuid)
  owner to postgres;

revoke all on function public.account_deletion_completion_prerequisites_terminal(public.account_deletion_requests)
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_auth_durable_authority()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_completion_authority()
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_account_deletion_completion(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_account_deletion_completion(uuid)
  to service_role;

-- Preserve request creation/confirmation and prior-stage server writers while
-- removing direct service-role authority over the Completion-owned columns.
revoke update on table public.account_deletion_requests
  from public, anon, authenticated, service_role;
grant update (
  user_id, anonymized_user_ref, request_source, status, failure_stage, failure_reason_code,
  provider_cleanup_status, provider_snapshot_version, provider_snapshot_status,
  provider_snapshot_seal_version, provider_snapshot_sealed_at, provider_snapshot_target_count,
  provider_verified_absent_count, provider_runner_attempt_count, provider_runner_lease_token,
  provider_runner_lease_expires_at, provider_destructive_started_at, provider_sub_finalized_at,
  provider_locator_scrubbed_at, storage_cleanup_status, storage_snapshot_version,
  storage_snapshot_status, storage_snapshot_seal_version, storage_snapshot_collection_token,
  storage_snapshot_collection_started_at, storage_snapshot_sealed_at, storage_snapshot_fingerprint,
  storage_snapshot_target_count, storage_verified_absent_count, storage_runner_attempt_count,
  storage_runner_lease_token, storage_runner_lease_expires_at, storage_destructive_started_at,
  storage_sub_finalized_at, storage_locator_scrubbed_at,
  retry_count, requested_at, confirmed_at, processing_started_at, cancelled_at,
  last_attempted_at, metadata, created_at, updated_at
) on public.account_deletion_requests to service_role;

comment on function public.finalize_account_deletion_completion(uuid) is
  'Focused atomic Completion authority. It revalidates persisted Provider, Storage, Database, and Auth evidence and performs no external action.';
