-- G5D-2M: durable Supabase Auth deletion and response-loss recovery foundation.
-- This migration does not call Supabase Auth, wire the canonical operator, mark
-- an account deletion completed, set retention expiry, or change prior stages.

-- A legacy terminal Auth row cannot be assigned trustworthy durable evidence by
-- migration inference. Stop a future apply for explicit reconciliation instead.
do $$
begin
  if exists (
    select 1
    from public.account_deletion_requests
    where auth_cleanup_status in ('succeeded', 'not_needed')
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'legacy terminal Auth deletion rows require reconciliation before G5D-2M';
  end if;
end;
$$;

alter table public.account_deletion_requests
  add column if not exists auth_intent_version text,
  add column if not exists auth_delete_target_user_id uuid,
  add column if not exists auth_delete_generation integer not null default 0,
  add column if not exists auth_delete_requested_at timestamptz,
  add column if not exists auth_verification_attempt_count integer not null default 0,
  add column if not exists auth_verification_result text,
  add column if not exists auth_verification_result_attempt_count integer,
  add column if not exists auth_verified_absent_at timestamptz,
  add column if not exists auth_sub_finalized_at timestamptz;

comment on column public.account_deletion_requests.auth_intent_version is
  'Exact durable Auth deletion contract. G5D-2M supports only g5d-2m.auth-delete.v1.';
comment on column public.account_deletion_requests.auth_delete_target_user_id is
  'Temporary server-only exact Auth target copied from request ownership before DELETE. It intentionally has no auth.users foreign key and is scrubbed by the Auth sub-finalizer.';
comment on column public.account_deletion_requests.auth_delete_generation is
  'Automatic Auth DELETE dispatch generation. Only the one-way transition 0 to 1 is permitted.';
comment on column public.account_deletion_requests.auth_verification_attempt_count is
  'Monotonic count of focused GET verification attempt authorities.';
comment on column public.account_deletion_requests.auth_verification_result is
  'Current focused GET result normalized to present, absent, or unknown. It is bound to the exact current attempt and consumed by dispatch or sub-finalization.';
comment on column public.account_deletion_requests.auth_verification_result_attempt_count is
  'Exact verification attempt that produced auth_verification_result. It cannot outlive that current result.';

alter table public.account_deletion_requests
  add constraint account_deletion_requests_auth_delete_generation_check check (
    auth_delete_generation in (0, 1)
  ),
  add constraint account_deletion_requests_auth_verification_attempt_count_check check (
    auth_verification_attempt_count >= 0
  ),
  add constraint account_deletion_requests_auth_verification_result_check check (
    auth_verification_result in ('present', 'absent', 'unknown')
  ),
  add constraint account_deletion_requests_auth_verification_result_binding_check check (
    (
      auth_verification_result is null
      and auth_verification_result_attempt_count is null
    )
    or
    (
      auth_verification_result is not null
      and auth_verification_result_attempt_count is not null
      and auth_verification_result_attempt_count >= 1
      and auth_verification_result_attempt_count = auth_verification_attempt_count
    )
  ),
  add constraint account_deletion_requests_auth_durable_shape_check check (
    (
      auth_intent_version is null
      and auth_delete_target_user_id is null
      and auth_delete_generation = 0
      and auth_delete_requested_at is null
      and auth_verification_attempt_count = 0
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null
      and auth_verified_absent_at is null
      and auth_sub_finalized_at is null
      and auth_cleanup_status not in ('succeeded', 'not_needed')
    )
    or
    (
      auth_intent_version = 'g5d-2m.auth-delete.v1'
      and auth_delete_requested_at is not null
      and (
        (
          auth_sub_finalized_at is null
          and auth_delete_target_user_id is not null
          and auth_cleanup_status not in ('succeeded', 'not_needed')
          and (auth_delete_generation = 0 or auth_verification_attempt_count >= 1)
          and (
            (
              auth_verified_absent_at is null
              and auth_verification_result is distinct from 'absent'
            )
            or (
              auth_verification_attempt_count >= 1
              and auth_verification_result = 'absent'
              and auth_verification_result_attempt_count = auth_verification_attempt_count
              and auth_verified_absent_at >= auth_delete_requested_at
            )
          )
        )
        or
        (
          auth_sub_finalized_at is not null
          and auth_delete_target_user_id is null
          and user_id is null
          and status in ('confirmed', 'completed')
          and failure_stage is null
          and failure_reason_code is null
          and auth_verification_result is null
          and auth_verification_result_attempt_count is null
          and auth_verified_absent_at is not null
          and auth_verification_attempt_count >= 1
          and auth_verified_absent_at >= auth_delete_requested_at
          and auth_sub_finalized_at >= auth_verified_absent_at
          and (
            (auth_cleanup_status = 'not_needed' and auth_delete_generation = 0)
            or
            (auth_cleanup_status = 'succeeded' and auth_delete_generation = 1)
          )
        )
      )
    )
  );

-- Parent-only prerequisite authority. It deliberately does not rerun Provider or
-- Storage target validation, the 18-table inventory, or product cleanup.
create or replace function public.account_deletion_auth_prior_stages_terminal(
  p_request public.account_deletion_requests
)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce((
    p_request.provider_snapshot_version = 'g5d-2a.account-provider.v1'
    and p_request.provider_snapshot_status = 'sealed'
    and p_request.provider_snapshot_seal_version = 1
    and p_request.provider_snapshot_sealed_at is not null
    and p_request.provider_cleanup_status in ('succeeded', 'not_needed')
    and p_request.provider_sub_finalized_at is not null
    and p_request.provider_locator_scrubbed_at = p_request.provider_sub_finalized_at
    and p_request.provider_verified_absent_count = p_request.provider_snapshot_target_count
    and p_request.provider_runner_lease_token is null
    and p_request.provider_runner_lease_expires_at is null
    and (
      (p_request.provider_cleanup_status = 'not_needed' and p_request.provider_snapshot_target_count = 0)
      or
      (p_request.provider_cleanup_status = 'succeeded' and p_request.provider_snapshot_target_count > 0)
    )
    and p_request.storage_snapshot_version = 'g5d-2e.account-storage.v1'
    and p_request.storage_snapshot_status = 'sealed'
    and p_request.storage_snapshot_seal_version = 1
    and p_request.storage_snapshot_sealed_at is not null
    and p_request.storage_snapshot_fingerprint is null
    and p_request.storage_cleanup_status in ('succeeded', 'not_needed')
    and p_request.storage_sub_finalized_at is not null
    and p_request.storage_locator_scrubbed_at = p_request.storage_sub_finalized_at
    and p_request.storage_verified_absent_count = p_request.storage_snapshot_target_count
    and p_request.storage_runner_lease_token is null
    and p_request.storage_runner_lease_expires_at is null
    and (
      (p_request.storage_cleanup_status = 'not_needed' and p_request.storage_snapshot_target_count = 0)
      or
      (p_request.storage_cleanup_status = 'succeeded' and p_request.storage_snapshot_target_count > 0)
    )
    and p_request.db_inventory_version = 'g5d-2h.account-db.v1'
    and p_request.db_cleanup_status in ('succeeded', 'not_needed')
    and p_request.db_sub_finalized_at is not null
    and p_request.db_observed_row_count =
      p_request.db_deleted_row_count + p_request.db_anonymized_row_count + p_request.db_retained_row_count
    and (
      (
        p_request.db_cleanup_status = 'not_needed'
        and p_request.db_deleted_row_count = 0
        and p_request.db_anonymized_row_count = 0
      )
      or
      (
        p_request.db_cleanup_status = 'succeeded'
        and p_request.db_deleted_row_count + p_request.db_anonymized_row_count > 0
      )
    )
    and p_request.metadata = '{}'::jsonb
  ), false);
$$;

-- Shape/transition/terminal immutability. Authorization is provided exclusively
-- by column ACL plus the SECURITY DEFINER functions below; there is no GUC or
-- caller-supplied boolean bypass.
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

  if new.auth_cleanup_status in ('succeeded', 'not_needed') and not (
    old.auth_sub_finalized_at is null
    and new.auth_sub_finalized_at is not null
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

drop trigger if exists enforce_account_deletion_auth_durable_authority
  on public.account_deletion_requests;
create trigger enforce_account_deletion_auth_durable_authority
  before insert or update on public.account_deletion_requests
  for each row
  execute function public.enforce_account_deletion_auth_durable_authority();

create or replace function public.seal_account_deletion_auth_intent(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_auth_intent_version text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null
    or p_expected_user_id is null
    or p_auth_intent_version is distinct from 'g5d-2m.auth-delete.v1' then
    raise exception using errcode = 'invalid_parameter_value', message = 'auth_intent_identity_or_version_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
  for update;

  if not found then
    raise exception using errcode = 'insufficient_privilege', message = 'auth_intent_request_not_found';
  end if;

  if v_request.auth_intent_version is not null then
    if v_request.auth_intent_version = 'g5d-2m.auth-delete.v1'
      and v_request.auth_delete_target_user_id = p_expected_user_id
      and public.account_deletion_auth_prior_stages_terminal(v_request) then
      return v_request;
    end if;
    raise exception using errcode = 'check_violation', message = 'auth_intent_existing_authority_invalid';
  end if;

  if v_request.user_id is null
    or v_request.user_id is distinct from p_expected_user_id
    or v_request.status <> 'confirmed'
    or v_request.failure_stage is not null
    or v_request.failure_reason_code is not null
    or v_request.auth_cleanup_status not in ('pending', 'failed')
    or v_request.auth_sub_finalized_at is not null
    or public.account_deletion_auth_prior_stages_terminal(v_request) is not true then
    raise exception using errcode = 'check_violation', message = 'auth_intent_request_not_eligible';
  end if;

  update public.account_deletion_requests
  set auth_intent_version = 'g5d-2m.auth-delete.v1',
      auth_delete_target_user_id = v_request.user_id,
      auth_delete_requested_at = transaction_timestamp(),
      auth_cleanup_status = 'pending',
      failure_stage = null,
      failure_reason_code = null
  where id = p_deletion_request_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.begin_account_deletion_auth_verification_attempt(
  p_deletion_request_id uuid,
  p_expected_target_user_id uuid,
  p_auth_intent_version text,
  p_expected_verification_attempt_count integer
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null
    or p_expected_target_user_id is null
    or p_auth_intent_version is distinct from 'g5d-2m.auth-delete.v1'
    or p_expected_verification_attempt_count is null
    or p_expected_verification_attempt_count < 0
    or p_expected_verification_attempt_count >= 2147483647 then
    raise exception using errcode = 'invalid_parameter_value', message = 'auth_verification_attempt_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
  for update;

  if not found
    or v_request.status not in ('confirmed', 'auth_cleanup_failed')
    or v_request.auth_intent_version <> 'g5d-2m.auth-delete.v1'
    or v_request.auth_delete_target_user_id is distinct from p_expected_target_user_id
    or v_request.auth_delete_generation not in (0, 1)
    or v_request.auth_verification_attempt_count <> p_expected_verification_attempt_count
    or v_request.auth_verified_absent_at is not null
    or v_request.auth_sub_finalized_at is not null
    or v_request.auth_cleanup_status not in ('pending', 'failed')
    or public.account_deletion_auth_prior_stages_terminal(v_request) is not true then
    return null;
  end if;

  update public.account_deletion_requests
  set status = 'confirmed',
      auth_cleanup_status = 'pending',
      auth_verification_attempt_count = auth_verification_attempt_count + 1,
      auth_verification_result = null,
      auth_verification_result_attempt_count = null,
      failure_stage = null,
      failure_reason_code = null,
      last_attempted_at = transaction_timestamp()
  where id = p_deletion_request_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.record_account_deletion_auth_verification_result(
  p_deletion_request_id uuid,
  p_expected_target_user_id uuid,
  p_auth_intent_version text,
  p_expected_verification_attempt_count integer,
  p_result text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_now timestamptz := transaction_timestamp();
  v_reason text;
begin
  if p_deletion_request_id is null
    or p_expected_target_user_id is null
    or p_auth_intent_version is distinct from 'g5d-2m.auth-delete.v1'
    or p_expected_verification_attempt_count is null
    or p_expected_verification_attempt_count < 1
    or p_result not in (
      'verified_absent', 'present', 'permission_denied', 'rate_limited',
      'unavailable', 'network_error', 'timeout', 'malformed', 'mismatched_user'
    ) then
    raise exception using errcode = 'invalid_parameter_value', message = 'auth_verification_result_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
  for update;

  if not found
    or v_request.auth_intent_version <> 'g5d-2m.auth-delete.v1'
    or v_request.auth_delete_target_user_id is distinct from p_expected_target_user_id
    or v_request.auth_verification_attempt_count <> p_expected_verification_attempt_count
    or v_request.auth_verification_result is not null
    or v_request.auth_verification_result_attempt_count is not null
    or v_request.auth_verified_absent_at is not null
    or v_request.auth_sub_finalized_at is not null
    or v_request.auth_cleanup_status not in ('pending', 'failed')
    or public.account_deletion_auth_prior_stages_terminal(v_request) is not true then
    return null;
  end if;

  if p_result = 'verified_absent' then
    if v_request.user_id is null then
      update public.account_deletion_requests
      set status = 'confirmed', auth_cleanup_status = 'pending',
          auth_verification_result = 'absent',
          auth_verification_result_attempt_count = p_expected_verification_attempt_count,
          auth_verified_absent_at = v_now,
          failure_stage = null, failure_reason_code = null,
          last_attempted_at = v_now
      where id = p_deletion_request_id
      returning * into v_request;
    else
      update public.account_deletion_requests
      set status = 'auth_cleanup_failed', auth_cleanup_status = 'manual_required',
          auth_verification_result = 'absent',
          auth_verification_result_attempt_count = p_expected_verification_attempt_count,
          auth_verified_absent_at = v_now,
          failure_stage = 'auth_cleanup',
          failure_reason_code = 'auth_owner_not_null_after_verified_absence',
          retry_count = least(retry_count::bigint + 1, 2147483647)::integer,
          last_attempted_at = v_now
      where id = p_deletion_request_id
      returning * into v_request;
    end if;
  elsif p_result = 'present' and v_request.auth_delete_generation = 0 then
    update public.account_deletion_requests
    set status = 'confirmed', auth_cleanup_status = 'pending',
        auth_verification_result = 'present',
        auth_verification_result_attempt_count = p_expected_verification_attempt_count,
        failure_stage = null, failure_reason_code = null,
        last_attempted_at = v_now
    where id = p_deletion_request_id
    returning * into v_request;
  elsif p_result = 'present' then
    update public.account_deletion_requests
    set status = 'auth_cleanup_failed', auth_cleanup_status = 'manual_required',
        auth_verification_result = 'present',
        auth_verification_result_attempt_count = p_expected_verification_attempt_count,
        failure_stage = 'auth_cleanup',
        failure_reason_code = 'auth_user_present_after_dispatch_manual_required',
        retry_count = least(retry_count::bigint + 1, 2147483647)::integer,
        last_attempted_at = v_now
    where id = p_deletion_request_id
    returning * into v_request;
  elsif p_result in ('permission_denied', 'malformed', 'mismatched_user') then
    v_reason := case p_result
      when 'permission_denied' then 'auth_get_permission_denied'
      when 'mismatched_user' then 'auth_get_user_mismatch'
      else 'auth_get_protocol_error'
    end;
    update public.account_deletion_requests
    set status = 'auth_cleanup_failed', auth_cleanup_status = 'manual_required',
        auth_verification_result = 'unknown',
        auth_verification_result_attempt_count = p_expected_verification_attempt_count,
        failure_stage = 'auth_cleanup', failure_reason_code = v_reason,
        retry_count = least(retry_count::bigint + 1, 2147483647)::integer,
        last_attempted_at = v_now
    where id = p_deletion_request_id
    returning * into v_request;
  else
    v_reason := case p_result
      when 'rate_limited' then 'auth_get_rate_limited'
      when 'timeout' then 'auth_get_timeout'
      when 'network_error' then 'auth_get_network_error'
      else 'auth_get_unavailable'
    end;
    update public.account_deletion_requests
    set status = 'auth_cleanup_failed', auth_cleanup_status = 'failed',
        auth_verification_result = 'unknown',
        auth_verification_result_attempt_count = p_expected_verification_attempt_count,
        failure_stage = 'auth_cleanup', failure_reason_code = v_reason,
        retry_count = least(retry_count::bigint + 1, 2147483647)::integer,
        last_attempted_at = v_now
    where id = p_deletion_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

create or replace function public.authorize_account_deletion_auth_delete_dispatch(
  p_deletion_request_id uuid,
  p_expected_target_user_id uuid,
  p_auth_intent_version text,
  p_expected_verification_attempt_count integer
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null
    or p_expected_target_user_id is null
    or p_auth_intent_version is distinct from 'g5d-2m.auth-delete.v1'
    or p_expected_verification_attempt_count is null
    or p_expected_verification_attempt_count < 1 then
    raise exception using errcode = 'invalid_parameter_value', message = 'auth_delete_dispatch_identity_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
  for update;

  if not found
    or v_request.user_id is distinct from p_expected_target_user_id
    or v_request.status <> 'confirmed'
    or v_request.failure_stage is not null
    or v_request.failure_reason_code is not null
    or v_request.auth_intent_version <> 'g5d-2m.auth-delete.v1'
    or v_request.auth_delete_target_user_id is distinct from p_expected_target_user_id
    or v_request.auth_delete_generation <> 0
    or v_request.auth_delete_requested_at is null
    or v_request.auth_verification_attempt_count <> p_expected_verification_attempt_count
    or v_request.auth_verification_result_attempt_count is distinct from p_expected_verification_attempt_count
    or v_request.auth_verification_result is distinct from 'present'
    or v_request.auth_verified_absent_at is not null
    or v_request.auth_sub_finalized_at is not null
    or v_request.auth_cleanup_status <> 'pending'
    or public.account_deletion_auth_prior_stages_terminal(v_request) is not true then
    return null;
  end if;

  update public.account_deletion_requests
  set auth_delete_generation = 1,
      auth_verification_result = null,
      auth_verification_result_attempt_count = null,
      last_attempted_at = transaction_timestamp()
  where id = p_deletion_request_id
    and auth_delete_generation = 0
    and auth_verification_attempt_count = p_expected_verification_attempt_count
    and auth_verification_result_attempt_count = p_expected_verification_attempt_count
    and auth_verification_result = 'present'
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.record_account_deletion_auth_dispatch_outcome(
  p_deletion_request_id uuid,
  p_expected_target_user_id uuid,
  p_auth_intent_version text,
  p_result text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_now timestamptz := transaction_timestamp();
  v_manual boolean;
  v_reason text;
begin
  if p_deletion_request_id is null
    or p_expected_target_user_id is null
    or p_auth_intent_version is distinct from 'g5d-2m.auth-delete.v1'
    or p_result not in (
      'permission_denied', 'rate_limited', 'unavailable',
      'network_error', 'timeout', 'malformed'
    ) then
    raise exception using errcode = 'invalid_parameter_value', message = 'auth_dispatch_outcome_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
  for update;

  if not found
    or v_request.auth_intent_version <> 'g5d-2m.auth-delete.v1'
    or v_request.auth_delete_target_user_id is distinct from p_expected_target_user_id
    or v_request.auth_delete_generation <> 1
    or v_request.auth_verified_absent_at is not null
    or v_request.auth_sub_finalized_at is not null
    or v_request.auth_cleanup_status not in ('pending', 'failed')
    or public.account_deletion_auth_prior_stages_terminal(v_request) is not true then
    return null;
  end if;

  v_manual := p_result = 'permission_denied';
  v_reason := case p_result
    when 'permission_denied' then 'auth_delete_permission_denied'
    when 'rate_limited' then 'auth_delete_rate_limited_outcome_unknown'
    when 'timeout' then 'auth_delete_timeout_outcome_unknown'
    when 'network_error' then 'auth_delete_network_error_outcome_unknown'
    when 'malformed' then 'auth_delete_malformed_outcome_unknown'
    else 'auth_delete_unavailable_outcome_unknown'
  end;

  update public.account_deletion_requests
  set status = 'auth_cleanup_failed',
      auth_cleanup_status = case when v_manual then 'manual_required' else 'failed' end,
      failure_stage = 'auth_cleanup', failure_reason_code = v_reason,
      retry_count = least(retry_count::bigint + 1, 2147483647)::integer,
      last_attempted_at = v_now
  where id = p_deletion_request_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.finalize_account_deletion_auth_stage(
  p_deletion_request_id uuid,
  p_auth_intent_version text,
  p_expected_delete_generation integer,
  p_expected_verification_attempt_count integer
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_now timestamptz := transaction_timestamp();
  v_terminal_status text;
begin
  if p_deletion_request_id is null
    or p_auth_intent_version is distinct from 'g5d-2m.auth-delete.v1'
    or p_expected_delete_generation not in (0, 1)
    or p_expected_verification_attempt_count is null
    or p_expected_verification_attempt_count < 1 then
    raise exception using errcode = 'invalid_parameter_value', message = 'auth_finalizer_authority_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
  for update;

  if not found then
    return null;
  end if;

  v_terminal_status := case when p_expected_delete_generation = 0 then 'not_needed' else 'succeeded' end;

  if v_request.auth_sub_finalized_at is not null then
    if v_request.user_id is null
      and v_request.auth_intent_version = 'g5d-2m.auth-delete.v1'
      and v_request.auth_delete_target_user_id is null
      and v_request.auth_delete_generation = p_expected_delete_generation
      and v_request.auth_verification_attempt_count = p_expected_verification_attempt_count
      and v_request.auth_verification_result is null
      and v_request.auth_verification_result_attempt_count is null
      and v_request.auth_verified_absent_at is not null
      and v_request.auth_cleanup_status = v_terminal_status
      and v_request.status in ('confirmed', 'completed')
      and v_request.failure_stage is null
      and v_request.failure_reason_code is null
      and public.account_deletion_auth_prior_stages_terminal(v_request) then
      return v_request;
    end if;
    raise exception using errcode = 'check_violation', message = 'auth_finalizer_terminal_replay_invalid';
  end if;

  if v_request.user_id is not null
    or v_request.status <> 'confirmed'
    or v_request.failure_stage is not null
    or v_request.failure_reason_code is not null
    or v_request.auth_intent_version <> 'g5d-2m.auth-delete.v1'
    or v_request.auth_delete_target_user_id is null
    or v_request.auth_delete_generation <> p_expected_delete_generation
    or v_request.auth_verification_attempt_count <> p_expected_verification_attempt_count
    or v_request.auth_verification_result is distinct from 'absent'
    or v_request.auth_verification_result_attempt_count is distinct from p_expected_verification_attempt_count
    or v_request.auth_verified_absent_at is null
    or v_request.auth_cleanup_status <> 'pending'
    or public.account_deletion_auth_prior_stages_terminal(v_request) is not true then
    return null;
  end if;

  update public.account_deletion_requests
  set status = 'confirmed',
      auth_cleanup_status = v_terminal_status,
      auth_delete_target_user_id = null,
      auth_verification_result = null,
      auth_verification_result_attempt_count = null,
      auth_sub_finalized_at = v_now,
      failure_stage = null,
      failure_reason_code = null,
      last_attempted_at = v_now
  where id = p_deletion_request_id
  returning * into v_request;

  return v_request;
end;
$$;

alter function public.account_deletion_auth_prior_stages_terminal(public.account_deletion_requests)
  owner to postgres;
alter function public.enforce_account_deletion_auth_durable_authority()
  owner to postgres;
alter function public.seal_account_deletion_auth_intent(uuid, uuid, text)
  owner to postgres;
alter function public.begin_account_deletion_auth_verification_attempt(uuid, uuid, text, integer)
  owner to postgres;
alter function public.record_account_deletion_auth_verification_result(uuid, uuid, text, integer, text)
  owner to postgres;
alter function public.authorize_account_deletion_auth_delete_dispatch(uuid, uuid, text, integer)
  owner to postgres;
alter function public.record_account_deletion_auth_dispatch_outcome(uuid, uuid, text, text)
  owner to postgres;
alter function public.finalize_account_deletion_auth_stage(uuid, text, integer, integer)
  owner to postgres;

revoke all on function public.account_deletion_auth_prior_stages_terminal(public.account_deletion_requests)
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_auth_durable_authority()
  from public, anon, authenticated, service_role;
revoke all on function public.seal_account_deletion_auth_intent(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_account_deletion_auth_verification_attempt(uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_auth_verification_result(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_account_deletion_auth_delete_dispatch(uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_auth_dispatch_outcome(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_account_deletion_auth_stage(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.seal_account_deletion_auth_intent(uuid, uuid, text)
  to service_role;
grant execute on function public.begin_account_deletion_auth_verification_attempt(uuid, uuid, text, integer)
  to service_role;
grant execute on function public.record_account_deletion_auth_verification_result(uuid, uuid, text, integer, text)
  to service_role;
grant execute on function public.authorize_account_deletion_auth_delete_dispatch(uuid, uuid, text, integer)
  to service_role;
grant execute on function public.record_account_deletion_auth_dispatch_outcome(uuid, uuid, text, text)
  to service_role;
grant execute on function public.finalize_account_deletion_auth_stage(uuid, text, integer, integer)
  to service_role;

-- The temporary exact target must not inherit the table-level application-role
-- SELECT privilege. Authenticated status reads use only this existing safe view
-- surface; service_role retains full server-side SELECT for the durable runner.
revoke select on table public.account_deletion_requests from public, anon, authenticated;
grant select on table public.account_deletion_requests to service_role;
grant select (
  id, user_id, request_source, status, failure_stage, failure_reason_code,
  provider_cleanup_status, storage_cleanup_status, db_cleanup_status,
  auth_cleanup_status, notification_status, retry_count, requested_at,
  confirmed_at, processing_started_at, completed_at, cancelled_at,
  expires_at, last_attempted_at, created_at, updated_at
) on public.account_deletion_requests to authenticated;

-- Preserve existing service-role writers while removing every direct route to
-- Auth durable/terminal authority and the prior DB finalizer evidence.
revoke update on table public.account_deletion_requests from public, anon, authenticated, service_role;
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
  storage_sub_finalized_at, storage_locator_scrubbed_at, notification_status,
  retry_count, requested_at, confirmed_at, processing_started_at, completed_at, cancelled_at,
  expires_at, last_attempted_at, metadata, created_at, updated_at
) on public.account_deletion_requests to service_role;

comment on function public.finalize_account_deletion_auth_stage(uuid, text, integer, integer) is
  'Focused G5D-2M Auth sub-finalizer. Requires strict persisted absence plus owner-null and never advances overall completion.';
