-- G5D-2J: focused atomic account-deletion database finalizer.
-- This migration does not wire the canonical operator, call Provider/Storage/Auth,
-- complete an account deletion, add a scheduler, or change retention periods.

-- ---------------------------------------------------------------------------
-- Narrow post-Storage database writer fence.
-- ---------------------------------------------------------------------------

create or replace function public.account_deletion_db_writer_fence_active(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.account_deletion_requests as request
    where request.user_id = p_user_id
      and request.storage_snapshot_status = 'sealed'
      and request.storage_cleanup_status in ('succeeded', 'not_needed')
      and request.storage_sub_finalized_at is not null
  );
$$;

-- Reuse the existing user-scoped transaction advisory lock so a writer that
-- starts just before Storage terminality must commit before that terminal state
-- can persist. Deterministic ordering keeps ownership-changing updates safe.
create or replace function public.g5d_2j_lock_db_writer_users(p_old_user_id uuid, p_new_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct candidate.user_id
    from unnest(array[p_old_user_id, p_new_user_id]) as candidate(user_id)
    where candidate.user_id is not null
    order by candidate.user_id
  loop
    perform public.g5c_b4_lock_voice_asset_user(v_user_id);
  end loop;
end;
$$;

create or replace function public.enforce_g5d_2j_storage_terminal_db_writer_lock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.storage_cleanup_status in ('succeeded', 'not_needed')
    and new.storage_sub_finalized_at is not null
    and (
      old.storage_cleanup_status not in ('succeeded', 'not_needed')
      or old.storage_sub_finalized_at is null
    ) then
    perform public.g5d_2j_lock_db_writer_users(old.user_id, new.user_id);
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_profile_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(
    case when tg_op = 'UPDATE' then old.id else null end,
    new.id
  );
  if public.account_deletion_db_writer_fence_active(new.id) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_script_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(null, new.user_id);
  if public.account_deletion_db_writer_fence_active(new.user_id) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_processing_consent_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(
    case when tg_op = 'UPDATE' then old.user_id else null end,
    new.user_id
  );
  if public.account_deletion_db_writer_fence_active(new.user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_db_writer_fence_active(old.user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_quota_event_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_finalizer_anonymization boolean := false;
begin
  perform public.g5d_2j_lock_db_writer_users(
    case when tg_op = 'UPDATE' then old.user_id else null end,
    new.user_id
  );
  if tg_op = 'UPDATE' then
    v_finalizer_anonymization :=
      old.user_id is not null and new.user_id is null
      and old.identifier_scrubbed_at is null and new.identifier_scrubbed_at is not null
      and new.subject_id is null and new.target_resource_id is null
      and new.idempotency_key is null and new.dedupe_key is null
      and new.request_fingerprint is null and new.provider_request_id is null
      and new.metadata = '{}'::jsonb
      and new.id is not distinct from old.id
      and new.event_type is not distinct from old.event_type
      and new.category is not distinct from old.category
      and new.status is not distinct from old.status
      and new.failure_stage is not distinct from old.failure_stage
      and new.failure_code is not distinct from old.failure_code
      and new.billing_status is not distinct from old.billing_status
      and new.subject_type is not distinct from old.subject_type
      and new.target_resource_type is not distinct from old.target_resource_type
      and new.provider is not distinct from old.provider
      and new.provider_model is not distinct from old.provider_model
      and new.attempted_at is not distinct from old.attempted_at
      and new.completed_at is not distinct from old.completed_at
      and new.created_at is not distinct from old.created_at
      and new.retention_expires_at is not distinct from old.retention_expires_at;
  end if;

  if not v_finalizer_anonymization and (
    public.account_deletion_db_writer_fence_active(new.user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_db_writer_fence_active(old.user_id))
  ) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_saved_model_audio_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(
    case when tg_op = 'UPDATE' then old.user_id else null end,
    new.user_id
  );
  if public.account_deletion_db_writer_fence_active(new.user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_db_writer_fence_active(old.user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_saved_best_take_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(
    case when tg_op = 'UPDATE' then old.user_id else null end,
    new.user_id
  );
  if public.account_deletion_db_writer_fence_active(new.user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_db_writer_fence_active(old.user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_weak_word_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_new_user_id uuid;
  v_old_user_id uuid;
begin
  select take.user_id into v_new_user_id from public.takes as take where take.id = new.take_id;
  if not found then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  if tg_op = 'UPDATE' then
    select take.user_id into v_old_user_id from public.takes as take where take.id = old.take_id;
    if not found then
      raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
    end if;
  end if;
  perform public.g5d_2j_lock_db_writer_users(v_old_user_id, v_new_user_id);
  if public.account_deletion_db_writer_fence_active(v_new_user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_db_writer_fence_active(v_old_user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_coach_feedback_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_new_user_id uuid;
  v_old_user_id uuid;
begin
  select take.user_id into v_new_user_id from public.takes as take where take.id = new.take_id;
  if not found then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  if tg_op = 'UPDATE' then
    select take.user_id into v_old_user_id from public.takes as take where take.id = old.take_id;
    if not found then
      raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
    end if;
  end if;
  perform public.g5d_2j_lock_db_writer_users(v_old_user_id, v_new_user_id);
  if public.account_deletion_db_writer_fence_active(v_new_user_id)
    or (tg_op = 'UPDATE' and public.account_deletion_db_writer_fence_active(v_old_user_id)) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_voice_operation_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(null, new.user_id);
  if public.account_deletion_db_writer_fence_active(new.user_id) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_account_deletion_voice_target_db_writer_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5d_2j_lock_db_writer_users(null, new.user_id);
  if public.account_deletion_db_writer_fence_active(new.user_id) then
    raise exception using errcode = 'object_in_use', message = 'account deletion database writer fence is active';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_account_deletion_profile_db_writer_fence on public.profiles;
create trigger enforce_account_deletion_profile_db_writer_fence
  before insert or update on public.profiles
  for each row execute function public.enforce_account_deletion_profile_db_writer_fence();

drop trigger if exists enforce_account_deletion_script_db_writer_fence on public.scripts;
create trigger enforce_account_deletion_script_db_writer_fence
  before insert on public.scripts
  for each row execute function public.enforce_account_deletion_script_db_writer_fence();

drop trigger if exists enforce_account_deletion_processing_consent_db_writer_fence on public.processing_consents;
create trigger enforce_account_deletion_processing_consent_db_writer_fence
  before insert or update on public.processing_consents
  for each row execute function public.enforce_account_deletion_processing_consent_db_writer_fence();

drop trigger if exists enforce_account_deletion_quota_event_db_writer_fence on public.quota_events;
create trigger enforce_account_deletion_quota_event_db_writer_fence
  before insert or update on public.quota_events
  for each row execute function public.enforce_account_deletion_quota_event_db_writer_fence();

drop trigger if exists enforce_account_deletion_saved_model_audio_db_writer_fence on public.script_saved_model_audios;
create trigger enforce_account_deletion_saved_model_audio_db_writer_fence
  before insert or update on public.script_saved_model_audios
  for each row execute function public.enforce_account_deletion_saved_model_audio_db_writer_fence();

drop trigger if exists enforce_account_deletion_saved_best_take_db_writer_fence on public.script_saved_best_takes;
create trigger enforce_account_deletion_saved_best_take_db_writer_fence
  before insert or update on public.script_saved_best_takes
  for each row execute function public.enforce_account_deletion_saved_best_take_db_writer_fence();

drop trigger if exists enforce_account_deletion_weak_word_db_writer_fence on public.weak_words;
create trigger enforce_account_deletion_weak_word_db_writer_fence
  before insert or update of take_id on public.weak_words
  for each row execute function public.enforce_account_deletion_weak_word_db_writer_fence();

drop trigger if exists enforce_account_deletion_coach_feedback_db_writer_fence on public.coach_feedback;
create trigger enforce_account_deletion_coach_feedback_db_writer_fence
  before insert or update of take_id on public.coach_feedback
  for each row execute function public.enforce_account_deletion_coach_feedback_db_writer_fence();

drop trigger if exists enforce_account_deletion_voice_operation_db_writer_fence on public.voice_deletion_operations;
create trigger enforce_account_deletion_voice_operation_db_writer_fence
  before insert on public.voice_deletion_operations
  for each row execute function public.enforce_account_deletion_voice_operation_db_writer_fence();

drop trigger if exists enforce_account_deletion_voice_target_db_writer_fence on public.voice_deletion_targets;
create trigger enforce_account_deletion_voice_target_db_writer_fence
  before insert on public.voice_deletion_targets
  for each row execute function public.enforce_account_deletion_voice_target_db_writer_fence();

drop trigger if exists enforce_g5d_2j_storage_terminal_db_writer_lock on public.account_deletion_requests;
create trigger enforce_g5d_2j_storage_terminal_db_writer_lock
  before update of user_id, storage_cleanup_status, storage_sub_finalized_at
  on public.account_deletion_requests
  for each row execute function public.enforce_g5d_2j_storage_terminal_db_writer_lock();

-- Trigger helpers are not callable application APIs.
revoke all on function public.account_deletion_db_writer_fence_active(uuid) from public, anon, authenticated, service_role;
revoke all on function public.g5d_2j_lock_db_writer_users(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.enforce_g5d_2j_storage_terminal_db_writer_lock() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_profile_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_script_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_processing_consent_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_quota_event_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_saved_model_audio_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_saved_best_take_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_weak_word_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_coach_feedback_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_voice_operation_db_writer_fence() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_voice_target_db_writer_fence() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permanent DB terminal shape and direct-column authority.
-- ---------------------------------------------------------------------------

drop trigger if exists enforce_account_deletion_db_terminal_foundation on public.account_deletion_requests;
drop function if exists public.enforce_account_deletion_db_terminal_foundation();

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_db_terminal_shape_check;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_db_terminal_shape_check check (
    (
      db_cleanup_status not in ('succeeded', 'not_needed')
      and db_sub_finalized_at is null
      and db_observed_row_count = 0
      and db_deleted_row_count = 0
      and db_anonymized_row_count = 0
      and db_retained_row_count = 0
    )
    or (
      db_cleanup_status in ('succeeded', 'not_needed')
      and db_sub_finalized_at is not null
      and db_inventory_version = 'g5d-2h.account-db.v1'
      and db_observed_row_count = db_deleted_row_count + db_anonymized_row_count + db_retained_row_count
      and (
        (db_cleanup_status = 'not_needed' and db_deleted_row_count = 0 and db_anonymized_row_count = 0)
        or
        (db_cleanup_status = 'succeeded' and db_deleted_row_count + db_anonymized_row_count > 0)
      )
    )
  );

create or replace function public.enforce_account_deletion_db_terminal_authority()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_db_evidence_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.db_cleanup_status in ('succeeded', 'not_needed')
      or new.db_sub_finalized_at is not null
      or new.db_observed_row_count <> 0
      or new.db_deleted_row_count <> 0
      or new.db_anonymized_row_count <> 0
      or new.db_retained_row_count <> 0 then
      raise exception using errcode = 'insufficient_privilege', message = 'account deletion DB terminal state requires focused finalization';
    end if;
    return new;
  end if;

  v_db_evidence_changed :=
    new.db_cleanup_status is distinct from old.db_cleanup_status
    or new.db_inventory_version is distinct from old.db_inventory_version
    or new.db_observed_row_count is distinct from old.db_observed_row_count
    or new.db_deleted_row_count is distinct from old.db_deleted_row_count
    or new.db_anonymized_row_count is distinct from old.db_anonymized_row_count
    or new.db_retained_row_count is distinct from old.db_retained_row_count
    or new.db_sub_finalized_at is distinct from old.db_sub_finalized_at;

  if old.db_cleanup_status in ('succeeded', 'not_needed') and (
    v_db_evidence_changed or new.metadata is distinct from old.metadata
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion DB terminal evidence is immutable';
  end if;

  if v_db_evidence_changed and not (
    old.db_cleanup_status not in ('succeeded', 'not_needed')
    and old.db_sub_finalized_at is null
    and old.db_observed_row_count = 0
    and old.db_deleted_row_count = 0
    and old.db_anonymized_row_count = 0
    and old.db_retained_row_count = 0
    and new.status = 'confirmed'
    and new.failure_stage is null
    and new.failure_reason_code is null
    and new.provider_cleanup_status in ('succeeded', 'not_needed')
    and new.provider_sub_finalized_at is not null
    and new.storage_cleanup_status in ('succeeded', 'not_needed')
    and new.storage_sub_finalized_at is not null
    and new.db_cleanup_status in ('succeeded', 'not_needed')
    and new.db_inventory_version = 'g5d-2h.account-db.v1'
    and new.db_sub_finalized_at is not null
    and new.last_attempted_at = new.db_sub_finalized_at
    and new.metadata = '{}'::jsonb
    and new.db_observed_row_count = new.db_deleted_row_count + new.db_anonymized_row_count + new.db_retained_row_count
    and (
      (new.db_cleanup_status = 'not_needed' and new.db_deleted_row_count = 0 and new.db_anonymized_row_count = 0)
      or
      (new.db_cleanup_status = 'succeeded' and new.db_deleted_row_count + new.db_anonymized_row_count > 0)
    )
  ) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion DB terminal state requires focused finalization';
  end if;

  return new;
end;
$$;

create trigger enforce_account_deletion_db_terminal_authority
  before insert or update on public.account_deletion_requests
  for each row execute function public.enforce_account_deletion_db_terminal_authority();

revoke all on function public.enforce_account_deletion_db_terminal_authority()
  from public, anon, authenticated, service_role;

-- Keep existing server-side request/status writers working, but remove direct
-- authority over the seven focused DB terminal columns.
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
  storage_sub_finalized_at, storage_locator_scrubbed_at, auth_cleanup_status, notification_status,
  retry_count, requested_at, confirmed_at, processing_started_at, completed_at, cancelled_at,
  expires_at, last_attempted_at, metadata, created_at, updated_at
) on public.account_deletion_requests to service_role;

-- ---------------------------------------------------------------------------
-- Exact one-transaction, 18-table finalizer.
-- ---------------------------------------------------------------------------

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

alter function public.finalize_account_deletion_database_stage(uuid, uuid, text) owner to postgres;
revoke all on function public.finalize_account_deletion_database_stage(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_account_deletion_database_stage(uuid, uuid, text)
  to service_role;

comment on function public.finalize_account_deletion_database_stage(uuid, uuid, text) is
  'Focused one-transaction G5D-2J DB/anonymization finalizer. It returns aggregate D/A/R evidence only and does not advance Auth or completion.';
