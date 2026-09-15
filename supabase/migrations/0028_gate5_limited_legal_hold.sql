-- R3: manual, narrowly scoped preservation on the existing request authority.
-- No purge worker, retention extension, reopen, notification or external action.
alter table public.account_deletion_requests
  add column legal_hold_active boolean not null default false,
  add column legal_hold_scope text[],
  add column legal_hold_set_at timestamptz,
  add column legal_hold_set_authority_ref text,
  add column legal_hold_released_at timestamptz,
  add column legal_hold_release_authority_ref text;

create or replace function public.account_deletion_legal_hold_scope_valid(p_scope text[])
returns boolean language sql immutable security invoker
set search_path = pg_catalog, public as $$
  select coalesce(
    cardinality(p_scope) between 1 and 5
    and p_scope <@ array['retained_audit', 'provider', 'storage', 'database', 'owner_linkage']::text[]
    and array_position(p_scope, null) is null
    and p_scope = array(select distinct s from unnest(p_scope) s order by s), false);
$$;

alter table public.account_deletion_requests
  add constraint account_deletion_legal_hold_shape check (
    (not legal_hold_active and legal_hold_scope is null and legal_hold_set_at is null
      and legal_hold_set_authority_ref is null and legal_hold_released_at is null
      and legal_hold_release_authority_ref is null)
    or
    (public.account_deletion_legal_hold_scope_valid(legal_hold_scope)
      and legal_hold_set_at is not null
      and legal_hold_set_authority_ref is not null
      and legal_hold_set_authority_ref ~ '^lh_[0-9a-f]{32}$'
      and ((legal_hold_active and legal_hold_released_at is null and legal_hold_release_authority_ref is null)
        or (not legal_hold_active and legal_hold_released_at is not null
          and legal_hold_released_at >= legal_hold_set_at
          and legal_hold_release_authority_ref is not null
          and legal_hold_release_authority_ref ~ '^lh_[0-9a-f]{32}$')))
  );

-- This predicate is the stable future R2 contract. Expiry remains Completion + 2160 hours.
comment on column public.account_deletion_requests.legal_hold_active is
  'Future R2: expires_at <= now() AND NOT legal_hold_active. Explicit release never purges or extends expiry.';
comment on column public.account_deletion_requests.legal_hold_scope is
  'Sorted unique resource scopes. retained_audit protects this request and its retained account target evidence only. Other scopes preserve the named remaining resource; owner_linkage preserves request/Auth linkage. No recovery of deleted data.';
comment on column public.account_deletion_requests.legal_hold_set_authority_ref is
  'Opaque random authority reference only; no case details, identity, email, UUID, secrets or legal notes.';

create or replace function public.account_deletion_legal_hold_blocks(
  p_request public.account_deletion_requests, p_stage text
)
returns boolean language sql stable security invoker
set search_path = pg_catalog, public as $$
  select case
    when p_request.legal_hold_active is false then false
    when p_request.legal_hold_active is null
      or public.account_deletion_legal_hold_scope_valid(p_request.legal_hold_scope) is not true then true
    when p_stage = 'provider' then p_request.legal_hold_scope && array['provider']
    when p_stage = 'storage' then p_request.legal_hold_scope && array['storage']
    when p_stage = 'database' then p_request.legal_hold_scope && array['provider','storage','database']
    when p_stage in ('auth','completion') then p_request.legal_hold_scope && array['provider','storage','database','owner_linkage']
    else true
  end;
$$;

-- Columns have no application UPDATE grant. INSERT cannot manufacture hold state.
create or replace function public.enforce_account_deletion_legal_hold()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.legal_hold_active or new.legal_hold_scope is not null
      or new.legal_hold_set_at is not null or new.legal_hold_set_authority_ref is not null
      or new.legal_hold_released_at is not null or new.legal_hold_release_authority_ref is not null then
      raise exception using errcode = 'insufficient_privilege', message = 'legal_hold_requires_manual_control';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.legal_hold_active then
      raise exception using errcode = 'check_violation', message = 'legal_hold_active';
    end if;
    return old;
  end if;
  -- A held resource request must keep its active owner fence. Cancelling or
  -- expiring it would let a replacement request destroy the same held data.
  if old.legal_hold_active and old.legal_hold_scope <> array['retained_audit']::text[]
    and new.status in ('cancelled', 'expired') and new.status is distinct from old.status then
    raise exception using errcode = 'check_violation', message = 'legal_hold_active';
  end if;
  -- Prevent direct stage-authority writes as well as the guarded canonical RPCs.
  if (public.account_deletion_legal_hold_blocks(old, 'provider') and (
      new.provider_runner_lease_token is distinct from old.provider_runner_lease_token
      or new.provider_destructive_started_at is distinct from old.provider_destructive_started_at
      or new.provider_sub_finalized_at is distinct from old.provider_sub_finalized_at))
    or (public.account_deletion_legal_hold_blocks(old, 'storage') and (
      new.storage_runner_lease_token is distinct from old.storage_runner_lease_token
      or new.storage_destructive_started_at is distinct from old.storage_destructive_started_at
      or new.storage_sub_finalized_at is distinct from old.storage_sub_finalized_at))
    or (public.account_deletion_legal_hold_blocks(old, 'database')
      and new.db_sub_finalized_at is distinct from old.db_sub_finalized_at)
    or (public.account_deletion_legal_hold_blocks(old, 'auth') and (
      new.auth_delete_generation is distinct from old.auth_delete_generation
      or new.user_id is distinct from old.user_id
      or new.auth_sub_finalized_at is distinct from old.auth_sub_finalized_at))
    or (public.account_deletion_legal_hold_blocks(old, 'completion')
      and new.status = 'completed' and old.status <> 'completed') then
    raise exception using errcode = 'check_violation', message = 'legal_hold_active';
  end if;
  return new;
end;
$$;
create trigger enforce_account_deletion_legal_hold
  before insert or update or delete on public.account_deletion_requests
  for each row execute function public.enforce_account_deletion_legal_hold();

-- A child cannot be purged independently while its account audit is held.
create or replace function public.enforce_account_deletion_held_target_delete()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests;
begin
  select * into v_request from public.account_deletion_requests
    where id = old.deletion_request_id for update;
  if found and v_request.legal_hold_active then
    raise exception using errcode = 'check_violation', message = 'legal_hold_active';
  end if;
  return old;
end;
$$;
create trigger enforce_account_deletion_held_target_delete
  before delete on public.account_deletion_provider_targets
  for each row execute function public.enforce_account_deletion_held_target_delete();
create trigger enforce_account_deletion_held_target_delete
  before delete on public.account_deletion_storage_targets
  for each row execute function public.enforce_account_deletion_held_target_delete();

create or replace function public.apply_account_deletion_legal_hold(
  p_deletion_request_id uuid, p_scope text[], p_authority_ref text,
  p_expected_set_authority_ref text default null
)
returns text language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null or p_authority_ref is null
    or p_authority_ref !~ '^lh_[0-9a-f]{32}$'
    or public.account_deletion_legal_hold_scope_valid(p_scope) is not true then
    raise exception using errcode = 'invalid_parameter_value', message = 'legal_hold_input_invalid';
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id for update;
  if not found then
    raise exception using errcode = 'insufficient_privilege', message = 'legal_hold_request_not_found';
  end if;
  if v_request.legal_hold_set_authority_ref = p_authority_ref then
    if v_request.legal_hold_scope is distinct from p_scope then
      raise exception using errcode = 'check_violation', message = 'legal_hold_authority_conflict';
    end if;
    return case when v_request.legal_hold_active then 'already_applied' else 'already_released' end;
  end if;
  if v_request.legal_hold_active
    or v_request.legal_hold_set_authority_ref is distinct from p_expected_set_authority_ref then
    raise exception using errcode = 'check_violation', message = 'legal_hold_authority_conflict';
  end if;
  -- No claim to restore data. Reject scopes after relevant destruction or dispatch.
  -- A lease (including expired but unreleased) can still own an external action.
  if (p_scope <> array['retained_audit']::text[] and (
      v_request.status not in ('requested','confirmed','processing','provider_cleanup_failed',
        'storage_cleanup_failed','db_cleanup_failed','auth_cleanup_failed') or v_request.user_id is null
      or v_request.auth_delete_generation <> 0 or v_request.auth_verified_absent_at is not null))
    or (p_scope && array['provider'] and (
      v_request.provider_destructive_started_at is not null
      or v_request.provider_sub_finalized_at is not null
      or v_request.provider_runner_lease_token is not null
      or exists (select 1 from public.account_deletion_provider_targets
        where deletion_request_id = v_request.id and (delete_attempt_count > 0 or status <> 'pending'))))
    or (p_scope && array['storage'] and (
      v_request.storage_destructive_started_at is not null
      or v_request.storage_sub_finalized_at is not null
      or v_request.storage_runner_lease_token is not null
      or exists (select 1 from public.account_deletion_storage_targets
        where deletion_request_id = v_request.id and (delete_attempt_count > 0 or status <> 'pending'))))
    or (p_scope && array['database'] and v_request.db_sub_finalized_at is not null)
    or (p_scope && array['provider','storage','database'] and exists (
      select 1 from public.voice_deletion_operations where user_id = v_request.user_id
        and status in ('pending','processing','partial_failure','manual_required'))) then
    raise exception using errcode = 'check_violation', message = 'legal_hold_scope_unavailable';
  end if;
  update public.account_deletion_requests set
    legal_hold_active = true, legal_hold_scope = p_scope,
    legal_hold_set_at = clock_timestamp(), legal_hold_set_authority_ref = p_authority_ref,
    legal_hold_released_at = null, legal_hold_release_authority_ref = null
    where id = p_deletion_request_id;
  return 'applied';
end;
$$;

create or replace function public.release_account_deletion_legal_hold(
  p_deletion_request_id uuid, p_expected_set_authority_ref text, p_authority_ref text
)
returns text language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null or p_authority_ref is null
    or p_authority_ref !~ '^lh_[0-9a-f]{32}$' or p_expected_set_authority_ref is null
    or p_expected_set_authority_ref !~ '^lh_[0-9a-f]{32}$' then
    raise exception using errcode = 'invalid_parameter_value', message = 'legal_hold_input_invalid';
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id for update;
  if not found then
    raise exception using errcode = 'insufficient_privilege', message = 'legal_hold_request_not_found';
  end if;
  if v_request.legal_hold_set_authority_ref is distinct from p_expected_set_authority_ref then
    raise exception using errcode = 'check_violation', message = 'legal_hold_authority_conflict';
  end if;
  if not v_request.legal_hold_active then
    if v_request.legal_hold_release_authority_ref = p_authority_ref then return 'already_released'; end if;
    raise exception using errcode = 'check_violation', message = 'legal_hold_not_active';
  end if;
  update public.account_deletion_requests set
    legal_hold_active = false, legal_hold_released_at = clock_timestamp(),
    legal_hold_release_authority_ref = p_authority_ref
    where id = p_deletion_request_id;
  return 'released';
end;
$$;

-- Preserve 0027 first-Completion authority; only completed hold-only updates differ.
create or replace function public.enforce_account_deletion_completion_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' or new.completed_at is not null then
      raise exception using
        errcode = 'insufficient_privilege',
        message = 'account deletion completion requires focused finalization';
    end if;
    return new;
  end if;

  if old.status = 'completed' then
    -- Exact row comparison also protects future non-hold columns by default.
    -- set_updated_at_account_deletion_requests sorts AFTER this trigger; no
    -- caller-authored updated_at exception is needed or permitted here.
    if (to_jsonb(new) - array['legal_hold_active','legal_hold_scope','legal_hold_set_at',
        'legal_hold_set_authority_ref','legal_hold_released_at','legal_hold_release_authority_ref'])
      is not distinct from
      (to_jsonb(old) - array['legal_hold_active','legal_hold_scope','legal_hold_set_at',
        'legal_hold_set_authority_ref','legal_hold_released_at','legal_hold_release_authority_ref'])
      and (new.legal_hold_active, new.legal_hold_scope, new.legal_hold_set_at,
        new.legal_hold_set_authority_ref, new.legal_hold_released_at, new.legal_hold_release_authority_ref)
      is distinct from (old.legal_hold_active, old.legal_hold_scope, old.legal_hold_set_at,
        old.legal_hold_set_authority_ref, old.legal_hold_released_at, old.legal_hold_release_authority_ref) then
      return new;
    end if;
    raise exception using errcode = 'check_violation',
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

-- Existing lease CAS, with scope guard in the same atomic UPDATE.
create or replace function public.claim_account_deletion_provider_lease(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
begin
  if p_deletion_request_id is null or p_expected_user_id is null or p_lease_token is null
    or p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 900 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider lease request';
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'claim_lease', true);

  update public.account_deletion_requests
  set provider_runner_lease_token = p_lease_token,
      provider_runner_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      provider_runner_attempt_count = provider_runner_attempt_count + 1,
      last_attempted_at = now()
  where id = p_deletion_request_id
    and user_id = p_expected_user_id
    and not public.account_deletion_legal_hold_blocks(account_deletion_requests, 'provider')
    and status in ('confirmed', 'provider_cleanup_failed')
    and provider_snapshot_status = 'sealed'
    and provider_cleanup_status in ('pending', 'failed')
    and provider_sub_finalized_at is null
    and (provider_runner_lease_token is null or provider_runner_lease_expires_at <= now())
  returning * into v_request;

  return v_request;
end;
$$;

-- Existing lease CAS, with scope guard in the same atomic UPDATE.
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
    and not public.account_deletion_legal_hold_blocks(account_deletion_requests, 'storage')
    and status in ('confirmed', 'storage_cleanup_failed')
    and provider_sub_finalized_at is not null and provider_cleanup_status in ('succeeded', 'not_needed')
    and storage_snapshot_status = 'sealed' and storage_cleanup_status in ('pending', 'failed')
    and storage_sub_finalized_at is null
    and (storage_runner_lease_token is null or storage_runner_lease_expires_at <= now())
  returning * into v_request;
  return v_request;
end;
$$;

-- Existing Auth generation CAS; held linkage cannot authorize dispatch.
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
    or public.account_deletion_legal_hold_blocks(v_request, 'auth')
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

-- Existing atomic DB finalizer: guard after its established user/row locks,
-- before inventory or mutation. All original evidence and D/A/R logic retained.
create or replace function public.finalize_account_deletion_database_stage(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_expected_db_inventory_version text
)
returns table(
  db_cleanup_status text,
  safe_reason text,
  db_observed_row_count integer,
  db_deleted_row_count integer,
  db_anonymized_row_count integer,
  db_retained_row_count integer,
  already_finalized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_owned_user_id uuid;
  v_now timestamptz := transaction_timestamp();
  v_int_max constant bigint := 2147483647;
  v_changed bigint;

  v_profiles bigint; v_scripts bigint; v_script_audios bigint; v_takes bigint;
  v_weak_words bigint; v_coach_feedback bigint; v_saved_model bigint; v_saved_best bigint;
  v_voices bigint; v_voice_consents bigint; v_processing_consents bigint;
  v_voice_operations bigint; v_voice_targets bigint; v_write_intents bigint;
  v_requests bigint; v_provider_targets bigint; v_quota_events bigint; v_storage_targets bigint;

  v_current_provider_targets bigint; v_current_storage_targets bigint;
  v_prior_request_ids uuid[] := '{}'::uuid[];
  v_prior_provider_targets bigint := 0; v_prior_storage_targets bigint := 0;
  v_voice_retain_ids uuid[] := '{}'::uuid[]; v_voice_expired_ids uuid[] := '{}'::uuid[];
  v_voice_retain_targets bigint := 0; v_voice_expired_targets bigint := 0;
  v_quota_retain_ids uuid[] := '{}'::uuid[]; v_quota_expired_ids uuid[] := '{}'::uuid[];
  v_deleted bigint; v_anonymized bigint; v_retained bigint; v_observed bigint;
  v_terminal_status text;
  v_already_finalized boolean := false;
begin
  if p_deletion_request_id is null or p_expected_user_id is null
    or p_expected_db_inventory_version is distinct from 'g5d-2h.account-db.v1' then
    raise exception using errcode = 'invalid_parameter_value', message = 'db_finalizer_identity_or_version_invalid';
  end if;

  -- Resolve lock identity from persisted ownership before taking the user lock;
  -- a caller cannot use a request ID to lock a different user.
  select request.user_id into v_owned_user_id
  from public.account_deletion_requests as request
  where request.id = p_deletion_request_id;
  if not found or v_owned_user_id is distinct from p_expected_user_id then
    raise exception using errcode = 'insufficient_privilege', message = 'db_finalizer_request_owner_mismatch';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(v_owned_user_id);

  select * into v_request
  from public.account_deletion_requests as request
  where request.id = p_deletion_request_id and request.user_id = v_owned_user_id
  for update;
  if not found then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_request_changed';
  end if;

  if public.account_deletion_legal_hold_blocks(v_request, 'database') then
    raise exception using errcode = 'check_violation', message = 'legal_hold_active';
  end if;

  if v_request.db_cleanup_status in ('succeeded', 'not_needed') then
    if v_request.db_sub_finalized_at is null
      or v_request.db_inventory_version <> 'g5d-2h.account-db.v1'
      or v_request.db_observed_row_count < 0 or v_request.db_deleted_row_count < 0
      or v_request.db_anonymized_row_count < 0 or v_request.db_retained_row_count < 0
      or v_request.db_observed_row_count <>
        v_request.db_deleted_row_count + v_request.db_anonymized_row_count + v_request.db_retained_row_count
      or (v_request.db_cleanup_status = 'not_needed'
        and (v_request.db_deleted_row_count <> 0 or v_request.db_anonymized_row_count <> 0))
      or (v_request.db_cleanup_status = 'succeeded'
        and v_request.db_deleted_row_count + v_request.db_anonymized_row_count = 0) then
      raise exception using errcode = 'check_violation', message = 'db_finalizer_terminal_evidence_inconsistent';
    end if;
    v_already_finalized := true;
  else
    if v_request.status not in ('confirmed', 'db_cleanup_failed')
      or v_request.db_cleanup_status not in ('pending', 'failed')
      or v_request.db_sub_finalized_at is not null
      or v_request.db_inventory_version <> 'g5d-2h.account-db.v1'
      or v_request.db_observed_row_count <> 0 or v_request.db_deleted_row_count <> 0
      or v_request.db_anonymized_row_count <> 0 or v_request.db_retained_row_count <> 0 then
      raise exception using errcode = 'check_violation', message = 'db_finalizer_request_not_runnable';
    end if;
  end if;

  select count(*) into v_current_provider_targets
  from public.account_deletion_provider_targets as target
  where target.deletion_request_id = p_deletion_request_id;
  if v_request.provider_snapshot_version <> 'g5d-2a.account-provider.v1'
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_snapshot_seal_version <> 1
    or v_request.provider_snapshot_sealed_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_locator_scrubbed_at is distinct from v_request.provider_sub_finalized_at
    or v_request.provider_runner_lease_token is not null or v_request.provider_runner_lease_expires_at is not null
    or v_request.provider_snapshot_target_count <> v_current_provider_targets
    or v_request.provider_verified_absent_count <> v_current_provider_targets
    or (v_request.provider_cleanup_status = 'not_needed' and v_current_provider_targets <> 0)
    or (v_request.provider_cleanup_status = 'succeeded' and v_current_provider_targets = 0)
    or exists (
      select 1 from public.account_deletion_provider_targets as target
      where target.deletion_request_id = p_deletion_request_id and (
        target.user_id is distinct from v_owned_user_id
        or target.status <> 'verified_absent' or target.reconciliation_status <> 'verified_absent'
        or target.verified_absent_at is null
        or target.source_voice_id is not null or target.provider_name is not null
        or target.provider_resource_id is not null or target.target_fingerprint is not null
        or target.locator_scrubbed_at is distinct from v_request.provider_sub_finalized_at
        or target.next_retry_at is not null or target.last_failure_category is not null
        or target.manual_required_at is not null
      )
    ) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_provider_prerequisite_invalid';
  end if;

  select count(*) into v_current_storage_targets
  from public.account_deletion_storage_targets as target
  where target.deletion_request_id = p_deletion_request_id;
  if v_request.storage_snapshot_version <> 'g5d-2e.account-storage.v1'
    or v_request.storage_snapshot_status <> 'sealed'
    or v_request.storage_snapshot_seal_version <> 1
    or v_request.storage_snapshot_collection_token is not null
    or v_request.storage_snapshot_collection_started_at is null
    or v_request.storage_snapshot_sealed_at is null
    or v_request.storage_snapshot_fingerprint is not null
    or v_request.storage_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_sub_finalized_at is null
    or v_request.storage_locator_scrubbed_at is distinct from v_request.storage_sub_finalized_at
    or v_request.storage_runner_lease_token is not null or v_request.storage_runner_lease_expires_at is not null
    or v_request.storage_snapshot_target_count <> v_current_storage_targets
    or v_request.storage_verified_absent_count <> v_current_storage_targets
    or (v_request.storage_cleanup_status = 'not_needed' and v_current_storage_targets <> 0)
    or (v_request.storage_cleanup_status = 'succeeded' and v_current_storage_targets = 0)
    or exists (
      select 1 from public.account_deletion_storage_targets as target
      where target.deletion_request_id = p_deletion_request_id and (
        target.user_id is distinct from v_owned_user_id
        or target.status <> 'verified_absent' or target.verification_status <> 'verified_absent'
        or target.verified_absent_at is null
        or target.storage_bucket is not null or target.storage_object_key is not null
        or target.target_fingerprint is not null or target.source_refs is not null
        or target.locator_scrubbed_at is distinct from v_request.storage_sub_finalized_at
        or target.next_retry_at is not null or target.last_failure_category is not null
        or target.manual_required_at is not null
      )
    ) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_storage_prerequisite_invalid';
  end if;

  -- A terminal replay is a read-only proof of the same current prerequisites,
  -- exact owned post-state, and retained count shape required at first commit.
  -- It never repairs evidence or newly introduced rows.
  if v_already_finalized then
    if v_request.status <> 'confirmed'
      or v_request.failure_stage is not null or v_request.failure_reason_code is not null
      or v_request.last_attempted_at is distinct from v_request.db_sub_finalized_at
      or v_request.metadata <> '{}'::jsonb
      or v_request.db_retained_row_count <>
        1 + v_current_provider_targets + v_current_storage_targets
      or exists (select 1 from public.profiles where id = v_owned_user_id)
      or exists (select 1 from public.scripts where user_id = v_owned_user_id)
      or exists (select 1 from public.script_audios audio join public.scripts s on s.id = audio.script_id where s.user_id = v_owned_user_id)
      or exists (select 1 from public.takes where user_id = v_owned_user_id)
      or exists (select 1 from public.weak_words word join public.takes take on take.id = word.take_id where take.user_id = v_owned_user_id)
      or exists (select 1 from public.coach_feedback feedback join public.takes take on take.id = feedback.take_id where take.user_id = v_owned_user_id)
      or exists (select 1 from public.script_saved_model_audios where user_id = v_owned_user_id)
      or exists (select 1 from public.script_saved_best_takes where user_id = v_owned_user_id)
      or exists (select 1 from public.voices where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_consents where user_id = v_owned_user_id)
      or exists (select 1 from public.processing_consents where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_deletion_operations where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_deletion_targets where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_asset_write_intents where user_id = v_owned_user_id)
      or exists (select 1 from public.quota_events where user_id = v_owned_user_id)
      or exists (select 1 from public.account_deletion_requests where user_id = v_owned_user_id and id <> p_deletion_request_id)
      or (select count(*) from public.account_deletion_requests where id = p_deletion_request_id and user_id = v_owned_user_id) <> 1
      or (select count(*) from public.account_deletion_provider_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_provider_targets
      or (select count(*) from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_storage_targets then
      raise exception using errcode = 'check_violation', message = 'db_terminal_post_state_invalid';
    end if;

    return query select v_request.db_cleanup_status, 'already_finalized'::text,
      v_request.db_observed_row_count, v_request.db_deleted_row_count,
      v_request.db_anonymized_row_count, v_request.db_retained_row_count, true;
    return;
  end if;

  -- Every non-current owned request must be a safely classifiable cancelled or
  -- expired row. Active, manual, failed, or ambiguous prior authority blocks.
  select coalesce(array_agg(request.id order by request.id), '{}'::uuid[])
  into v_prior_request_ids
  from public.account_deletion_requests as request
  where request.user_id = v_owned_user_id and request.id <> p_deletion_request_id;

  if exists (
    select 1 from public.account_deletion_requests as prior
    where prior.id = any(v_prior_request_ids) and not (
      (
        (prior.status = 'cancelled' and prior.cancelled_at is not null)
        or (prior.status = 'expired' and prior.expires_at is not null and prior.expires_at <= v_now)
      )
      and prior.provider_cleanup_status in ('pending', 'succeeded', 'not_needed')
      and prior.storage_cleanup_status in ('pending', 'succeeded', 'not_needed')
      and prior.db_cleanup_status in ('pending', 'succeeded', 'not_needed')
      and prior.auth_cleanup_status = 'pending'
      and prior.provider_runner_lease_token is null and prior.provider_runner_lease_expires_at is null
      and prior.storage_runner_lease_token is null and prior.storage_runner_lease_expires_at is null
      and (
        (
          prior.provider_cleanup_status = 'pending'
          and prior.provider_snapshot_status = 'pending' and prior.provider_snapshot_seal_version = 0
          and prior.provider_snapshot_target_count = 0 and prior.provider_verified_absent_count = 0
          and prior.provider_sub_finalized_at is null and prior.provider_locator_scrubbed_at is null
          and not exists (select 1 from public.account_deletion_provider_targets t where t.deletion_request_id = prior.id)
        ) or (
          prior.provider_cleanup_status in ('succeeded', 'not_needed')
          and prior.provider_snapshot_version = 'g5d-2a.account-provider.v1'
          and prior.provider_snapshot_status = 'sealed' and prior.provider_snapshot_seal_version = 1
          and prior.provider_snapshot_sealed_at is not null and prior.provider_sub_finalized_at is not null
          and prior.provider_locator_scrubbed_at = prior.provider_sub_finalized_at
          and prior.provider_snapshot_target_count = (
            select count(*) from public.account_deletion_provider_targets t where t.deletion_request_id = prior.id
          )
          and prior.provider_verified_absent_count = prior.provider_snapshot_target_count
          and (
            (prior.provider_cleanup_status = 'not_needed' and prior.provider_snapshot_target_count = 0)
            or (prior.provider_cleanup_status = 'succeeded' and prior.provider_snapshot_target_count > 0)
          )
          and not exists (
            select 1 from public.account_deletion_provider_targets t where t.deletion_request_id = prior.id and (
              t.user_id is distinct from v_owned_user_id or t.status <> 'verified_absent'
              or t.reconciliation_status <> 'verified_absent' or t.verified_absent_at is null
              or t.locator_scrubbed_at is distinct from prior.provider_sub_finalized_at
              or t.source_voice_id is not null or t.provider_name is not null
              or t.provider_resource_id is not null or t.target_fingerprint is not null
              or t.next_retry_at is not null or t.last_failure_category is not null
              or t.manual_required_at is not null
            )
          )
        )
      )
      and (
        (
          prior.storage_cleanup_status = 'pending'
          and prior.storage_snapshot_status = 'pending' and prior.storage_snapshot_seal_version = 0
          and prior.storage_snapshot_target_count = 0 and prior.storage_verified_absent_count = 0
          and prior.storage_sub_finalized_at is null and prior.storage_locator_scrubbed_at is null
          and not exists (select 1 from public.account_deletion_storage_targets t where t.deletion_request_id = prior.id)
        ) or (
          prior.storage_cleanup_status in ('succeeded', 'not_needed')
          and prior.storage_snapshot_version = 'g5d-2e.account-storage.v1'
          and prior.storage_snapshot_status = 'sealed' and prior.storage_snapshot_seal_version = 1
          and prior.storage_snapshot_collection_token is null and prior.storage_snapshot_fingerprint is null
          and prior.storage_snapshot_collection_started_at is not null
          and prior.storage_snapshot_sealed_at is not null and prior.storage_sub_finalized_at is not null
          and prior.storage_locator_scrubbed_at = prior.storage_sub_finalized_at
          and prior.storage_snapshot_target_count = (
            select count(*) from public.account_deletion_storage_targets t where t.deletion_request_id = prior.id
          )
          and prior.storage_verified_absent_count = prior.storage_snapshot_target_count
          and (
            (prior.storage_cleanup_status = 'not_needed' and prior.storage_snapshot_target_count = 0)
            or (prior.storage_cleanup_status = 'succeeded' and prior.storage_snapshot_target_count > 0)
          )
          and not exists (
            select 1 from public.account_deletion_storage_targets t where t.deletion_request_id = prior.id and (
              t.user_id is distinct from v_owned_user_id or t.status <> 'verified_absent'
              or t.verification_status <> 'verified_absent' or t.verified_absent_at is null
              or t.locator_scrubbed_at is distinct from prior.storage_sub_finalized_at
              or t.storage_bucket is not null or t.storage_object_key is not null
              or t.target_fingerprint is not null or t.source_refs is not null
              or t.next_retry_at is not null or t.last_failure_category is not null
              or t.manual_required_at is not null
            )
          )
        )
      )
      and (
        (prior.db_cleanup_status = 'pending' and prior.db_sub_finalized_at is null
          and prior.db_observed_row_count = 0 and prior.db_deleted_row_count = 0
          and prior.db_anonymized_row_count = 0 and prior.db_retained_row_count = 0)
        or
        (prior.db_cleanup_status in ('succeeded', 'not_needed') and prior.db_sub_finalized_at is not null
          and prior.db_observed_row_count = prior.db_deleted_row_count
            + prior.db_anonymized_row_count + prior.db_retained_row_count)
      )
    )
  ) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_prior_request_blocked';
  end if;

  select count(*) into v_prior_provider_targets from public.account_deletion_provider_targets
    where deletion_request_id = any(v_prior_request_ids);
  select count(*) into v_prior_storage_targets from public.account_deletion_storage_targets
    where deletion_request_id = any(v_prior_request_ids);

  -- Cross-owner FK anomalies could make a classified parent delete mutate User B.
  if exists (
    select 1 from public.scripts s join public.takes t on t.script_id = s.id
      where s.user_id = v_owned_user_id and t.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.scripts s join public.script_saved_model_audios saved on saved.script_id = s.id
      where s.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.scripts s join public.script_saved_best_takes saved on saved.script_id = s.id
      where s.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.takes t join public.script_saved_best_takes saved on saved.take_id = t.id
      where t.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.script_audios audio
      join public.scripts s on s.id = audio.script_id
      join public.script_saved_model_audios saved on saved.script_audio_id = audio.id
      where s.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.script_audios audio join public.scripts s on s.id = audio.script_id
      join public.voices voice on voice.id = audio.voice_id
      where (s.user_id = v_owned_user_id and voice.user_id <> v_owned_user_id)
         or (voice.user_id = v_owned_user_id and s.user_id <> v_owned_user_id)
  ) or exists (
    select 1 from public.voice_consents consent join public.voices voice on voice.consent_id = consent.id
      where consent.user_id = v_owned_user_id and voice.user_id <> v_owned_user_id
  ) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_cross_owner_relation_invalid';
  end if;

  if exists (select 1 from public.voice_asset_write_intents
    where user_id = v_owned_user_id and status in ('reserved', 'manual_required')) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_write_intent_blocked';
  end if;
  if exists (select 1 from public.voice_asset_write_intents
    where user_id = v_owned_user_id and status not in ('completed', 'cancelled')) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_write_intent_invalid';
  end if;

  -- Failed voice operations cannot be mapped uniquely to the already-scrubbed
  -- account Provider/Storage target locators, so they remain fail-closed.
  if exists (
    select 1 from public.voice_deletion_operations as operation
    where operation.user_id = v_owned_user_id and not (
      operation.status = 'completed'
      and operation.current_stage is null
      and operation.snapshot_version = 'g5c-b.voice-only.v1'
      and operation.snapshot_status = 'succeeded'
      and operation.consent_withdrawal_status in ('succeeded', 'not_needed')
      and operation.post_delete_verification_status = 'succeeded'
      and operation.completed_at is not null
      and operation.sensitive_snapshot_scrubbed_at is not null
      and operation.consent_snapshot_id is null
      and cardinality(operation.consent_snapshot_ids) = 0
      and operation.lease_token is null and operation.lease_expires_at is null
      and operation.audit_expires_at = operation.completed_at + interval '90 days'
      and not exists (
        select 1 from public.voice_deletion_targets as target
        where target.operation_id = operation.id and (
          target.user_id is distinct from v_owned_user_id
          or target.status <> 'verified_absent' or target.locator_scrubbed_at is null
          or target.source_row_id is not null or target.provider_name is not null
          or target.provider_resource_id is not null or target.storage_bucket is not null
          or target.storage_object_key is not null or target.target_fingerprint is not null
        )
      )
    )
  ) or exists (
    select 1 from public.voice_deletion_targets as target
    left join public.voice_deletion_operations as operation on operation.id = target.operation_id
    where target.user_id = v_owned_user_id and operation.user_id is distinct from v_owned_user_id
  ) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_voice_operation_blocked';
  end if;

  select
    coalesce(array_agg(operation.id order by operation.id)
      filter (where operation.audit_expires_at > v_now), '{}'::uuid[]),
    coalesce(array_agg(operation.id order by operation.id)
      filter (where operation.audit_expires_at <= v_now), '{}'::uuid[])
  into v_voice_retain_ids, v_voice_expired_ids
  from public.voice_deletion_operations as operation
  where operation.user_id = v_owned_user_id;
  select count(*) into v_voice_retain_targets from public.voice_deletion_targets
    where operation_id = any(v_voice_retain_ids);
  select count(*) into v_voice_expired_targets from public.voice_deletion_targets
    where operation_id = any(v_voice_expired_ids);

  select
    coalesce(array_agg(event.id order by event.id)
      filter (where event.retention_expires_at > v_now), '{}'::uuid[]),
    coalesce(array_agg(event.id order by event.id)
      filter (where event.retention_expires_at <= v_now), '{}'::uuid[])
  into v_quota_retain_ids, v_quota_expired_ids
  from public.quota_events as event
  where event.user_id = v_owned_user_id;

  -- Exact static inventory of all 18 current tables.
  select
    (select count(*) from public.profiles where id = v_owned_user_id),
    (select count(*) from public.scripts where user_id = v_owned_user_id),
    (select count(*) from public.script_audios audio join public.scripts s on s.id = audio.script_id
      where s.user_id = v_owned_user_id),
    (select count(*) from public.takes where user_id = v_owned_user_id),
    (select count(*) from public.weak_words word join public.takes take on take.id = word.take_id
      where take.user_id = v_owned_user_id),
    (select count(*) from public.coach_feedback feedback join public.takes take on take.id = feedback.take_id
      where take.user_id = v_owned_user_id),
    (select count(*) from public.script_saved_model_audios where user_id = v_owned_user_id),
    (select count(*) from public.script_saved_best_takes where user_id = v_owned_user_id),
    (select count(*) from public.voices where user_id = v_owned_user_id),
    (select count(*) from public.voice_consents where user_id = v_owned_user_id),
    (select count(*) from public.processing_consents where user_id = v_owned_user_id),
    (select count(*) from public.voice_deletion_operations where user_id = v_owned_user_id),
    (select count(*) from public.voice_deletion_targets where user_id = v_owned_user_id),
    (select count(*) from public.voice_asset_write_intents where user_id = v_owned_user_id),
    (select count(*) from public.account_deletion_requests where user_id = v_owned_user_id),
    (select count(*) from public.account_deletion_provider_targets where user_id = v_owned_user_id),
    (select count(*) from public.quota_events where user_id = v_owned_user_id),
    (select count(*) from public.account_deletion_storage_targets where user_id = v_owned_user_id)
  into v_profiles, v_scripts, v_script_audios, v_takes, v_weak_words, v_coach_feedback,
    v_saved_model, v_saved_best, v_voices, v_voice_consents, v_processing_consents,
    v_voice_operations, v_voice_targets, v_write_intents, v_requests, v_provider_targets,
    v_quota_events, v_storage_targets;

  v_deleted := v_profiles + v_scripts + v_script_audios + v_takes + v_weak_words
    + v_coach_feedback + v_saved_model + v_saved_best + v_voices + v_voice_consents
    + v_processing_consents + cardinality(v_voice_expired_ids) + v_voice_expired_targets
    + v_write_intents + cardinality(v_prior_request_ids) + v_prior_provider_targets
    + v_prior_storage_targets + cardinality(v_quota_expired_ids);
  v_anonymized := cardinality(v_voice_retain_ids) + v_voice_retain_targets
    + cardinality(v_quota_retain_ids);
  v_retained := 1 + v_current_provider_targets + v_current_storage_targets;
  v_observed := v_profiles + v_scripts + v_script_audios + v_takes + v_weak_words
    + v_coach_feedback + v_saved_model + v_saved_best + v_voices + v_voice_consents
    + v_processing_consents + v_voice_operations + v_voice_targets + v_write_intents
    + v_requests + v_provider_targets + v_quota_events + v_storage_targets;

  if v_observed <> v_deleted + v_anonymized + v_retained
    or greatest(v_observed, v_deleted, v_anonymized, v_retained) > v_int_max then
    raise exception using errcode = 'numeric_value_out_of_range', message = 'db_finalizer_count_partition_invalid';
  end if;

  delete from public.account_deletion_requests where id = any(v_prior_request_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_prior_request_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_prior_request_drift'; end if;

  delete from public.voice_deletion_operations where id = any(v_voice_expired_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_voice_expired_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_expiry_drift'; end if;

  update public.voice_deletion_operations set user_id = null where id = any(v_voice_retain_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_voice_retain_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_anonymization_drift'; end if;

  delete from public.voice_asset_write_intents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_write_intents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_write_intent_drift'; end if;

  delete from public.quota_events where id = any(v_quota_expired_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_quota_expired_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_expiry_drift'; end if;

  update public.quota_events
  set user_id = null, subject_id = null, target_resource_id = null,
      idempotency_key = null, dedupe_key = null, request_fingerprint = null,
      provider_request_id = null, metadata = '{}'::jsonb, identifier_scrubbed_at = v_now
  where id = any(v_quota_retain_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_quota_retain_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_anonymization_drift'; end if;

  -- weak_words, coach_feedback, and saved-best rows disappear through the take
  -- parent; script_audios and saved-model rows disappear through the script
  -- parent. They remain part of D from the pre-inventory above.
  delete from public.takes where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_takes then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_take_drift'; end if;
  delete from public.scripts where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_scripts then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_script_drift'; end if;
  delete from public.voices where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_voices then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_drift'; end if;
  delete from public.voice_consents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_voice_consents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_consent_drift'; end if;
  delete from public.processing_consents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_processing_consents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_processing_consent_drift'; end if;
  delete from public.profiles where id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_profiles then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_profile_drift'; end if;

  -- Re-inventory and retained-shape verification before terminal persistence.
  if exists (select 1 from public.profiles where id = v_owned_user_id)
    or exists (select 1 from public.scripts where user_id = v_owned_user_id)
    or exists (select 1 from public.script_audios audio join public.scripts s on s.id = audio.script_id where s.user_id = v_owned_user_id)
    or exists (select 1 from public.takes where user_id = v_owned_user_id)
    or exists (select 1 from public.weak_words word join public.takes take on take.id = word.take_id where take.user_id = v_owned_user_id)
    or exists (select 1 from public.coach_feedback feedback join public.takes take on take.id = feedback.take_id where take.user_id = v_owned_user_id)
    or exists (select 1 from public.script_saved_model_audios where user_id = v_owned_user_id)
    or exists (select 1 from public.script_saved_best_takes where user_id = v_owned_user_id)
    or exists (select 1 from public.voices where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_consents where user_id = v_owned_user_id)
    or exists (select 1 from public.processing_consents where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_deletion_operations where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_deletion_targets where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_asset_write_intents where user_id = v_owned_user_id)
    or exists (select 1 from public.quota_events where user_id = v_owned_user_id)
    or exists (select 1 from public.account_deletion_requests where user_id = v_owned_user_id and id <> p_deletion_request_id)
    or (select count(*) from public.account_deletion_requests where id = p_deletion_request_id and user_id = v_owned_user_id) <> 1
    or (select count(*) from public.account_deletion_provider_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_provider_targets
    or (select count(*) from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_storage_targets then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_post_state_owned_inventory_invalid';
  end if;

  if (select count(*) from public.voice_deletion_operations where id = any(v_voice_retain_ids)
      and user_id is null and status = 'completed') <> cardinality(v_voice_retain_ids)
    or (select count(*) from public.voice_deletion_targets where operation_id = any(v_voice_retain_ids)
      and user_id is null and status = 'verified_absent' and locator_scrubbed_at is not null
      and source_row_id is null and provider_name is null and provider_resource_id is null
      and storage_bucket is null and storage_object_key is null and target_fingerprint is null) <> v_voice_retain_targets
    or exists (select 1 from public.voice_deletion_operations where id = any(v_voice_expired_ids))
    or exists (select 1 from public.voice_deletion_targets where operation_id = any(v_voice_expired_ids))
    or (select count(*) from public.quota_events where id = any(v_quota_retain_ids)
      and user_id is null and identifier_scrubbed_at = v_now
      and subject_id is null and target_resource_id is null and idempotency_key is null
      and dedupe_key is null and request_fingerprint is null and provider_request_id is null
      and metadata = '{}'::jsonb and retention_expires_at > v_now) <> cardinality(v_quota_retain_ids)
    or exists (select 1 from public.quota_events where id = any(v_quota_expired_ids)) then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_post_state_retention_invalid';
  end if;

  -- Re-check retained current Provider/Storage evidence after every mutation.
  if exists (select 1 from public.account_deletion_provider_targets where deletion_request_id = p_deletion_request_id and (
      user_id is distinct from v_owned_user_id or status <> 'verified_absent'
      or reconciliation_status <> 'verified_absent' or locator_scrubbed_at is null
      or source_voice_id is not null or provider_name is not null
      or provider_resource_id is not null or target_fingerprint is not null))
    or exists (select 1 from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id and (
      user_id is distinct from v_owned_user_id or status <> 'verified_absent'
      or verification_status <> 'verified_absent' or locator_scrubbed_at is null
      or storage_bucket is not null or storage_object_key is not null
      or target_fingerprint is not null or source_refs is not null)) then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_retained_stage_evidence_invalid';
  end if;

  v_terminal_status := case when v_deleted = 0 and v_anonymized = 0 then 'not_needed' else 'succeeded' end;
  update public.account_deletion_requests
  set status = 'confirmed', failure_stage = null, failure_reason_code = null,
      db_cleanup_status = v_terminal_status,
      db_inventory_version = 'g5d-2h.account-db.v1',
      db_observed_row_count = v_observed::integer,
      db_deleted_row_count = v_deleted::integer,
      db_anonymized_row_count = v_anonymized::integer,
      db_retained_row_count = v_retained::integer,
      db_sub_finalized_at = v_now, last_attempted_at = v_now,
      metadata = '{}'::jsonb
  where id = p_deletion_request_id and user_id = v_owned_user_id
  returning * into v_request;
  if not found then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_terminal_write_lost';
  end if;

  return query select v_terminal_status, 'db_cleanup_finalized'::text,
    v_observed::integer, v_deleted::integer, v_anonymized::integer, v_retained::integer, false;
end;
$$;

alter function public.account_deletion_legal_hold_scope_valid(text[]) owner to postgres;
revoke all on function public.account_deletion_legal_hold_scope_valid(text[]) from public, anon, authenticated, service_role;

alter function public.account_deletion_legal_hold_blocks(public.account_deletion_requests, text) owner to postgres;
revoke all on function public.account_deletion_legal_hold_blocks(public.account_deletion_requests, text) from public, anon, authenticated, service_role;

alter function public.enforce_account_deletion_legal_hold() owner to postgres;
revoke all on function public.enforce_account_deletion_legal_hold() from public, anon, authenticated, service_role;

alter function public.enforce_account_deletion_held_target_delete() owner to postgres;
revoke all on function public.enforce_account_deletion_held_target_delete() from public, anon, authenticated, service_role;

alter function public.apply_account_deletion_legal_hold(uuid, text[], text, text) owner to postgres;
revoke all on function public.apply_account_deletion_legal_hold(uuid, text[], text, text) from public, anon, authenticated, service_role;

alter function public.release_account_deletion_legal_hold(uuid, text, text) owner to postgres;
revoke all on function public.release_account_deletion_legal_hold(uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.account_deletion_legal_hold_scope_valid(text[]) to service_role;
grant execute on function public.apply_account_deletion_legal_hold(uuid, text[], text, text) to service_role;
grant execute on function public.release_account_deletion_legal_hold(uuid, text, text) to service_role;

-- R3 P1: Voice-only must obtain the same preservation authority before DELETE.
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
  v_request public.account_deletion_requests;
  v_operation public.voice_deletion_operations;
  v_target public.voice_deletion_targets;
begin
  if p_operation_id is null or p_user_id is null or p_target_id is null or p_lease_token is null
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 0 then
    raise exception 'invalid provider voice delete attempt request';
  end if;

  -- Account Provider snapshots cover all remaining Provider voices of this owner,
  -- including before snapshot seal. Do not narrow preservation to target rows that
  -- may not exist yet. Audit-only/owner-linkage scopes do not preserve Provider.
  -- Lock ALL owned requests (not just currently held rows) before operation/target:
  -- apply/release use this same request lock, so a waiting begin sees the committed
  -- hold. Apply still rejects pre-existing active Voice-only operations. No new
  -- advisory lock or reverse operation -> account request lock order is introduced.
  for v_request in
    select * from public.account_deletion_requests
    where user_id = p_user_id
    order by id
    for update
  loop
    if public.account_deletion_legal_hold_blocks(v_request, 'provider') then
      raise exception using errcode = 'check_violation', message = 'legal_hold_active';
    end if;
  end loop;

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

alter function public.begin_provider_voice_delete_attempt(uuid, uuid, uuid, uuid, integer) owner to postgres;
revoke all on function public.begin_provider_voice_delete_attempt(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.begin_provider_voice_delete_attempt(uuid, uuid, uuid, uuid, integer) to service_role;
