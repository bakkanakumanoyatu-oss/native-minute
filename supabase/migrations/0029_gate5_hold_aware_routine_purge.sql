-- R2 only. Forward durable linkage; independent clocks; no backfill or scheduler.
-- Existing finalizer, completion predicate, R3 scopes/CAS, and cascades remain authoritative.
alter table public.quota_events
  add column retention_account_deletion_request_id uuid references public.account_deletion_requests(id)
    on delete restrict on update restrict;
alter table public.voice_deletion_operations
  add column retention_account_deletion_request_id uuid references public.account_deletion_requests(id)
    on delete restrict on update restrict;
create index quota_events_retention_request_idx on public.quota_events(retention_account_deletion_request_id)
  where retention_account_deletion_request_id is not null;
create index voice_deletion_operations_retention_request_idx on public.voice_deletion_operations(retention_account_deletion_request_id)
  where retention_account_deletion_request_id is not null;
comment on column public.quota_events.retention_account_deletion_request_id is
  'Finalizer-owned internal retention/hold authority only. Not product ownership or raw identity. Legacy NULL is not backfilled.';
comment on column public.voice_deletion_operations.retention_account_deletion_request_id is
  'Finalizer-owned internal retention/hold authority only; targets resolve through operation_id. Independent completion + 90 days.';
comment on column public.account_deletion_requests.legal_hold_scope is
  'Existing sorted unique scopes. retained_audit protects request/Account targets and related safe Quota/completed Voice audit through persisted owner or finalizer linkage. Other scopes keep their existing stage/resource meaning; no recovery of purged evidence.';

create function public.retention_audit_hold_blocks(p_request public.account_deletion_requests)
returns boolean language sql stable security invoker set search_path = pg_catalog, public as $$
  select case when p_request.legal_hold_active is false then false
    when p_request.legal_hold_active is null or public.account_deletion_legal_hold_scope_valid(p_request.legal_hold_scope) is not true then true
    else p_request.legal_hold_scope && array['retained_audit','database']::text[] end;
$$;

-- INSERT authority joins the existing owner fence before any request exists.
create function public.enforce_retention_request_creation_fence()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.user_id is not null then perform public.g5c_b4_lock_voice_asset_user(new.user_id); end if;
  return new;
end;
$$;
create trigger enforce_retention_request_creation_fence before insert on public.account_deletion_requests
for each row execute function public.enforce_retention_request_creation_fence();

-- Invoker privilege mirrors existing finalizer-only DB evidence authority.
-- No application role can supply the binding; legacy NULL may only remain NULL.
create function public.enforce_retention_binding()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare r public.account_deletion_requests;
begin
  if tg_op = 'INSERT' then
    if new.user_id is null or new.retention_account_deletion_request_id is not null then
      raise exception using errcode = '23514', message = 'retention_binding_requires_finalizer';
    end if;
  elsif new.retention_account_deletion_request_id is distinct from old.retention_account_deletion_request_id
    or (old.user_id is not null and new.user_id is null) then
    if current_user <> 'postgres' or old.user_id is null or new.user_id is not null
      or old.retention_account_deletion_request_id is not null or new.retention_account_deletion_request_id is null then
      raise exception using errcode = '23514', message = 'retention_binding_requires_finalizer';
    end if;
    select * into r from public.account_deletion_requests where id = new.retention_account_deletion_request_id;
    if not found or r.user_id is distinct from old.user_id
      or r.status not in ('confirmed','db_cleanup_failed') or r.db_cleanup_status not in ('pending','failed')
      or r.db_sub_finalized_at is not null or r.provider_sub_finalized_at is null or r.storage_sub_finalized_at is null then
      raise exception using errcode = '23514', message = 'retention_binding_invalid';
    end if;
  elsif old.retention_account_deletion_request_id is not null and new.user_id is not null then
    raise exception using errcode = '23514', message = 'retention_binding_immutable';
  end if;
  return new;
end;
$$;
create trigger enforce_retention_binding before insert or update on public.quota_events
for each row execute function public.enforce_retention_binding();
create trigger enforce_retention_binding before insert or update on public.voice_deletion_operations
for each row execute function public.enforce_retention_binding();

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
  v_retained_hold boolean := false;
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

  -- All same-owner requests precede evidence locks, in UUID order.
  perform 1 from public.account_deletion_requests where user_id = v_owned_user_id order by id for update;
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

  v_retained_hold := exists (select 1 from public.account_deletion_requests r
    where r.user_id = v_owned_user_id and public.retention_audit_hold_blocks(r));
  perform 1 from public.quota_events where user_id = v_owned_user_id order by id for update;
  perform 1 from public.voice_deletion_operations where user_id = v_owned_user_id order by id for update;
  perform 1 from public.voice_deletion_targets where user_id = v_owned_user_id order by id for update;
  if exists (select 1 from public.quota_events where user_id = v_owned_user_id
      and (retention_account_deletion_request_id is not null or attempted_at > v_now))
    or exists (select 1 from public.voice_deletion_operations where user_id = v_owned_user_id
      and (retention_account_deletion_request_id is not null or completed_at > v_now)) then
    raise exception using errcode = 'check_violation', message = 'retention_binding_invalid';
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
      filter (where operation.audit_expires_at > v_now or v_retained_hold), '{}'::uuid[]),
    coalesce(array_agg(operation.id order by operation.id)
      filter (where operation.audit_expires_at <= v_now and not v_retained_hold), '{}'::uuid[])
  into v_voice_retain_ids, v_voice_expired_ids
  from public.voice_deletion_operations as operation
  where operation.user_id = v_owned_user_id;
  select count(*) into v_voice_retain_targets from public.voice_deletion_targets
    where operation_id = any(v_voice_retain_ids);
  select count(*) into v_voice_expired_targets from public.voice_deletion_targets
    where operation_id = any(v_voice_expired_ids);

  select
    coalesce(array_agg(event.id order by event.id)
      filter (where event.retention_expires_at > v_now or v_retained_hold), '{}'::uuid[]),
    coalesce(array_agg(event.id order by event.id)
      filter (where event.retention_expires_at <= v_now and not v_retained_hold), '{}'::uuid[])
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

  update public.voice_deletion_operations set user_id = null, retention_account_deletion_request_id = p_deletion_request_id where id = any(v_voice_retain_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_voice_retain_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_anonymization_drift'; end if;

  delete from public.voice_asset_write_intents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_write_intents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_write_intent_drift'; end if;

  delete from public.quota_events where id = any(v_quota_expired_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_quota_expired_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_expiry_drift'; end if;

  update public.quota_events
  set user_id = null, retention_account_deletion_request_id = p_deletion_request_id, subject_id = null, target_resource_id = null,
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
      and user_id is null and status = 'completed'
      and retention_account_deletion_request_id = p_deletion_request_id) <> cardinality(v_voice_retain_ids)
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
      and metadata = '{}'::jsonb and (retention_expires_at > v_now or v_retained_hold)
      and retention_account_deletion_request_id = p_deletion_request_id) <> cardinality(v_quota_retain_ids)
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


-- Owner fence coordination only; existing R3 input, scopes and CAS are unchanged.
create or replace function public.apply_account_deletion_legal_hold(
  p_deletion_request_id uuid, p_scope text[], p_authority_ref text,
  p_expected_set_authority_ref text default null
)
returns text language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_request public.account_deletion_requests; v_owner uuid;
begin
  if p_deletion_request_id is null or p_authority_ref is null
    or p_authority_ref !~ '^lh_[0-9a-f]{32}$'
    or public.account_deletion_legal_hold_scope_valid(p_scope) is not true then
    raise exception using errcode = 'invalid_parameter_value', message = 'legal_hold_input_invalid';
  end if;
  select user_id into v_owner from public.account_deletion_requests where id = p_deletion_request_id;
  if v_owner is not null and p_scope && array['retained_audit']::text[] then
    perform public.g5c_b4_lock_voice_asset_user(v_owner);
  end if;
  select * into v_request from public.account_deletion_requests
    where id = p_deletion_request_id for update;
  if not found then
    raise exception using errcode = 'insufficient_privilege', message = 'legal_hold_request_not_found';
  end if;
  if v_request.user_id is distinct from v_owner then
    raise exception using errcode = '40001', message = 'retention_authority_changed';
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

-- The lock helper is internal. Caller must read persisted owner/link before
-- calling, then re-fetch the target. NOWAIT prevents reverse-order direct SQL
-- from waiting on a finalizer/hold already holding the owner/request fence.
create function public.lock_retention_authority(p_owner uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.account_deletion_requests; held boolean := false; seen boolean := false;
begin
  if p_owner is null and p_request_id is null then
    raise exception using errcode = '23514', message = 'legacy_hold_linkage_unresolved';
  end if;
  if p_owner is not null then
    if p_request_id is not null then
      raise exception using errcode = '23514', message = 'retention_binding_invalid';
    end if;
    if not pg_try_advisory_xact_lock(hashtextextended('g5c-b4-voice-assets:' || p_owner::text, 0)) then
      raise exception using errcode = '55P03', message = 'retention_authority_busy';
    end if;
  end if;
  for r in select * from public.account_deletion_requests
    where id = p_request_id or (p_owner is not null and user_id = p_owner)
    order by id for update nowait
  loop
    seen := true;
    held := held or public.retention_audit_hold_blocks(r);
  end loop;
  if p_request_id is not null and not seen then
    raise exception using errcode = '23514', message = 'retention_linkage_unavailable';
  end if;
  return held;
end;
$$;

create function public.retention_voice_safe(o public.voice_deletion_operations)
returns boolean language sql stable security invoker set search_path = pg_catalog, public as $$
  select coalesce(o.status = 'completed' and o.current_stage is null
    and o.snapshot_version = 'g5c-b.voice-only.v1' and o.snapshot_status = 'succeeded'
    and o.consent_withdrawal_status in ('succeeded','not_needed')
    and o.post_delete_verification_status = 'succeeded'
    and o.completed_at is not null and o.sensitive_snapshot_scrubbed_at is not null
    and o.consent_snapshot_id is null and cardinality(o.consent_snapshot_ids) = 0
    and o.lease_token is null and o.lease_expires_at is null
    and o.audit_expires_at = o.completed_at + interval '90 days'
    and not exists (select 1 from public.voice_deletion_targets t where t.operation_id = o.id and (
      t.user_id is distinct from o.user_id or t.status <> 'verified_absent' or t.locator_scrubbed_at is null
      or t.source_row_id is not null or t.provider_name is not null or t.provider_resource_id is not null
      or t.storage_bucket is not null or t.storage_object_key is not null or t.target_fingerprint is not null)), false);
$$;

create function public.retention_quota_safe(q public.quota_events)
returns boolean language sql stable security invoker set search_path = pg_catalog, public as $$
  select coalesce(q.retention_expires_at = q.attempted_at + interval '90 days' and (
    (q.user_id is not null and q.identifier_scrubbed_at is null and q.retention_account_deletion_request_id is null)
    or (q.user_id is null and q.identifier_scrubbed_at is not null
      and q.subject_id is null and q.target_resource_id is null and q.idempotency_key is null
      and q.dedupe_key is null and q.request_fingerprint is null and q.provider_request_id is null
      and q.metadata = '{}'::jsonb)), false);
$$;

create function public.enforce_retention_evidence_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if public.lock_retention_authority(old.user_id, old.retention_account_deletion_request_id) then
    raise exception using errcode = '23514', message = 'legal_hold_active';
  end if;
  if tg_table_name = 'quota_events' then
    if public.retention_quota_safe(old) is not true or old.retention_expires_at > transaction_timestamp() then
      raise exception using errcode = '23514', message = 'retention_purge_unsafe';
    end if;
  else
    if public.retention_voice_safe(old) is not true or old.audit_expires_at > transaction_timestamp() then
      raise exception using errcode = '23514', message = 'retention_purge_unsafe';
    end if;
  end if;
  return old;
end;
$$;
create trigger enforce_retention_evidence_delete before delete on public.quota_events
for each row execute function public.enforce_retention_evidence_delete();
create trigger enforce_retention_evidence_delete before delete on public.voice_deletion_operations
for each row execute function public.enforce_retention_evidence_delete();

-- Retained targets only disappear through a checked parent purge. Also blocks
-- direct target DELETE and indirect paths through owner FKs while parent exists.
create function public.enforce_retention_voice_target_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if pg_trigger_depth() <= 1 or exists (select 1 from public.voice_deletion_operations where id = old.operation_id) then
    raise exception using errcode = '23514', message = 'retention_target_requires_parent_purge';
  end if;
  return old;
end;
$$;
create trigger enforce_retention_voice_target_delete before delete on public.voice_deletion_targets
for each row execute function public.enforce_retention_voice_target_delete();

-- Preserve existing Completion + 2160 hours; reject inconsistent forward clocks.
create function public.enforce_retention_completion_lifetime()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and (
    new.completed_at < new.db_sub_finalized_at
    or exists (select 1 from public.quota_events where retention_account_deletion_request_id = new.id
      and (attempted_at > new.db_sub_finalized_at or retention_expires_at > new.expires_at))
    or exists (select 1 from public.voice_deletion_operations where retention_account_deletion_request_id = new.id
      and (completed_at > new.db_sub_finalized_at or audit_expires_at > new.expires_at))) then
    raise exception using errcode = '23514', message = 'retention_lifetime_invalid';
  end if;
  return new;
end;
$$;
create trigger enforce_retention_completion_lifetime before update on public.account_deletion_requests
for each row execute function public.enforce_retention_completion_lifetime();

-- One candidate per transaction is the hard DB batch limit. Cursor order is
-- UUID order, INCLUDING unexpired/unsafe rows so exceptions cannot starve later
-- rows. End-of-sweep returns examined=0,next_after_id=NULL. A later sweep starts
-- at NULL (including after hold release). Each table has an independent cursor.
-- No client timestamp or candidate shape grants DELETE authority.
create function public.routine_purge_retained_evidence(p_resource text, p_after_id uuid default null)
returns table(examined integer, purged integer, skipped_hold integer, skipped_not_expired integer,
  skipped_unsafe integer, legacy_hold_linkage_unresolved integer, next_after_id uuid)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  candidate record; q public.quota_events; o public.voice_deletion_operations;
  r public.account_deletion_requests; held boolean;
begin
  if p_resource is null or p_resource not in ('quota','voice','account') then
    raise exception using errcode = '22023', message = 'retention_resource_invalid';
  end if;
  examined := 0; purged := 0; skipped_hold := 0; skipped_not_expired := 0;
  skipped_unsafe := 0; legacy_hold_linkage_unresolved := 0; next_after_id := null;
  if p_resource = 'quota' then
    select id,user_id,retention_account_deletion_request_id as link into candidate from public.quota_events
      where p_after_id is null or id > p_after_id order by id limit 1;
  elsif p_resource = 'voice' then
    select id,user_id,retention_account_deletion_request_id as link into candidate from public.voice_deletion_operations
      where p_after_id is null or id > p_after_id order by id limit 1;
  else
    select id,user_id,id as link into candidate from public.account_deletion_requests
      where p_after_id is null or id > p_after_id order by id limit 1;
  end if;
  if not found then return next; return; end if;
  examined := 1; next_after_id := candidate.id;
  if p_resource <> 'account' and candidate.user_id is null and candidate.link is null then
    legacy_hold_linkage_unresolved := 1; return next; return;
  end if;
  begin
    -- All owner requests precede target; owner-null uses only durable FK.
    if p_resource = 'account' and candidate.user_id is not null then
      held := public.lock_retention_authority(candidate.user_id, null);
    else
      held := public.lock_retention_authority(candidate.user_id, candidate.link);
    end if;
    if p_resource = 'quota' then
      select * into q from public.quota_events where id = candidate.id for update nowait;
      if not found then skipped_unsafe := 1;
      elsif q.user_id is distinct from candidate.user_id or q.retention_account_deletion_request_id is distinct from candidate.link then skipped_unsafe := 1;
      elsif public.retention_quota_safe(q) is not true then skipped_unsafe := 1;
      elsif held then skipped_hold := 1;
      elsif q.retention_expires_at > transaction_timestamp() then skipped_not_expired := 1;
      else delete from public.quota_events where id = q.id; purged := 1;
      end if;
    elsif p_resource = 'voice' then
      select * into o from public.voice_deletion_operations where id = candidate.id for update nowait;
      if not found then skipped_unsafe := 1;
      elsif o.user_id is distinct from candidate.user_id or o.retention_account_deletion_request_id is distinct from candidate.link then skipped_unsafe := 1;
      else
        perform 1 from public.voice_deletion_targets where operation_id = o.id order by id for update nowait;
        if public.retention_voice_safe(o) is not true then skipped_unsafe := 1;
        elsif held then skipped_hold := 1;
        elsif o.audit_expires_at > transaction_timestamp() then skipped_not_expired := 1;
        else delete from public.voice_deletion_operations where id = o.id; purged := 1;
        end if;
      end if;
    else
      select * into r from public.account_deletion_requests where id = candidate.id for update nowait;
      if not found then skipped_unsafe := 1;
      elsif r.user_id is distinct from candidate.user_id then skipped_unsafe := 1;
      else
        -- Abandon ownership drift BEFORE acquiring any target lock.
        perform 1 from public.account_deletion_provider_targets where deletion_request_id = candidate.id order by id for update nowait;
        perform 1 from public.account_deletion_storage_targets where deletion_request_id = candidate.id order by id for update nowait;
        if r.legal_hold_active then skipped_hold := 1;
        elsif r.status <> 'completed' or public.account_deletion_completion_prerequisites_terminal(r) is not true
          or r.completed_at is null or r.expires_at is distinct from r.completed_at + interval '2160 hours'
          or r.last_attempted_at is distinct from r.completed_at or r.notification_status <> 'not_needed' then skipped_unsafe := 1;
        elsif r.expires_at > transaction_timestamp() then skipped_not_expired := 1;
        elsif exists (select 1 from public.quota_events where retention_account_deletion_request_id = r.id)
          or exists (select 1 from public.voice_deletion_operations where retention_account_deletion_request_id = r.id) then skipped_unsafe := 1;
        else delete from public.account_deletion_requests where id = r.id; purged := 1;
        end if;
      end if;
    end if;
  exception when lock_not_available or serialization_failure then
    -- Subtransaction rolls back any mutation and releases its acquired locks.
    purged := 0; skipped_hold := 0; skipped_not_expired := 0; skipped_unsafe := 1;
  end;
  return next;
end;
$$;

-- Exact-evidence hold entrypoint. Existing request-only RPC protects remaining
-- evidence; it does not assert availability of a caller's specified evidence.
create function public.apply_retained_evidence_legal_hold(
  p_deletion_request_id uuid, p_quota_ids uuid[], p_voice_ids uuid[],
  p_authority_ref text, p_expected_set_authority_ref text default null)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.account_deletion_requests; owner_id uuid;
begin
  if p_quota_ids is null or p_voice_ids is null or cardinality(p_quota_ids) + cardinality(p_voice_ids) not between 1 and 100
    or array_position(p_quota_ids,null) is not null or array_position(p_voice_ids,null) is not null then
    raise exception using errcode = '22023', message = 'legal_hold_input_invalid';
  end if;
  select user_id into owner_id from public.account_deletion_requests where id = p_deletion_request_id;
  if owner_id is not null then perform public.g5c_b4_lock_voice_asset_user(owner_id); end if;
  select * into r from public.account_deletion_requests where id = p_deletion_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'legal_hold_request_not_found'; end if;
  if r.user_id is distinct from owner_id then raise exception using errcode = '40001', message = 'retention_authority_changed'; end if;
  perform 1 from public.quota_events where id = any(p_quota_ids) order by id for update nowait;
  perform 1 from public.voice_deletion_operations where id = any(p_voice_ids) order by id for update nowait;
  perform 1 from public.voice_deletion_targets where operation_id = any(p_voice_ids) order by id for update nowait;
  if (select count(*) from public.quota_events where id = any(p_quota_ids)
      and public.retention_quota_safe(quota_events)
      and (retention_account_deletion_request_id = r.id or
        (retention_account_deletion_request_id is null and user_id = r.user_id))) <> cardinality(p_quota_ids)
    or (select count(*) from public.voice_deletion_operations where id = any(p_voice_ids)
      and public.retention_voice_safe(voice_deletion_operations)
      and (retention_account_deletion_request_id = r.id or
        (retention_account_deletion_request_id is null and user_id = r.user_id))) <> cardinality(p_voice_ids) then
    raise exception using errcode = '23514', message = 'legal_hold_scope_unavailable';
  end if;
  return public.apply_account_deletion_legal_hold(r.id,array['retained_audit'],p_authority_ref,p_expected_set_authority_ref);
end;
$$;

-- No direct application binding UPDATE, even when default table grants exist.
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols from pg_attribute
    where attrelid = 'public.quota_events'::regclass and attnum > 0 and not attisdropped
      and attname <> 'retention_account_deletion_request_id';
  revoke update on public.quota_events from public, anon, authenticated, service_role;
  execute 'grant update (' || cols || ') on public.quota_events to service_role';
end;
$$;
revoke delete on public.quota_events, public.voice_deletion_operations, public.voice_deletion_targets
  from public, anon, authenticated, service_role;

alter function public.finalize_account_deletion_database_stage(uuid,uuid,text) owner to postgres;
revoke all on function public.finalize_account_deletion_database_stage(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_account_deletion_database_stage(uuid,uuid,text) to service_role;

create function public.enforce_retention_account_purge()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if old.status = 'completed' and (old.expires_at > transaction_timestamp()
    or public.account_deletion_completion_prerequisites_terminal(old) is not true) then
    raise exception using errcode = '23514', message = 'retention_purge_unsafe';
  end if;
  return old;
end;
$$;
create trigger enforce_retention_account_purge before delete on public.account_deletion_requests
for each row execute function public.enforce_retention_account_purge();
alter function public.retention_audit_hold_blocks(public.account_deletion_requests) owner to postgres;
revoke all on function public.retention_audit_hold_blocks(public.account_deletion_requests) from public, anon, authenticated, service_role;
alter function public.enforce_retention_request_creation_fence() owner to postgres;
revoke all on function public.enforce_retention_request_creation_fence() from public, anon, authenticated, service_role;
alter function public.enforce_retention_binding() owner to postgres;
revoke all on function public.enforce_retention_binding() from public, anon, authenticated, service_role;
alter function public.lock_retention_authority(uuid,uuid) owner to postgres;
revoke all on function public.lock_retention_authority(uuid,uuid) from public, anon, authenticated, service_role;
alter function public.retention_voice_safe(public.voice_deletion_operations) owner to postgres;
revoke all on function public.retention_voice_safe(public.voice_deletion_operations) from public, anon, authenticated, service_role;
alter function public.retention_quota_safe(public.quota_events) owner to postgres;
revoke all on function public.retention_quota_safe(public.quota_events) from public, anon, authenticated, service_role;
alter function public.enforce_retention_evidence_delete() owner to postgres;
revoke all on function public.enforce_retention_evidence_delete() from public, anon, authenticated, service_role;
alter function public.enforce_retention_voice_target_delete() owner to postgres;
revoke all on function public.enforce_retention_voice_target_delete() from public, anon, authenticated, service_role;
alter function public.enforce_retention_completion_lifetime() owner to postgres;
revoke all on function public.enforce_retention_completion_lifetime() from public, anon, authenticated, service_role;
alter function public.routine_purge_retained_evidence(text,uuid) owner to postgres;
revoke all on function public.routine_purge_retained_evidence(text,uuid) from public, anon, authenticated, service_role;
alter function public.apply_retained_evidence_legal_hold(uuid,uuid[],uuid[],text,text) owner to postgres;
revoke all on function public.apply_retained_evidence_legal_hold(uuid,uuid[],uuid[],text,text) from public, anon, authenticated, service_role;
alter function public.enforce_retention_account_purge() owner to postgres;
revoke all on function public.enforce_retention_account_purge() from public, anon, authenticated, service_role;
grant execute on function public.routine_purge_retained_evidence(text,uuid) to service_role;
grant execute on function public.apply_retained_evidence_legal_hold(uuid,uuid[],uuid[],text,text) to service_role;
