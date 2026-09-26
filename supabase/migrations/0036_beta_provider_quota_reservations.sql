-- Beta provider quota authority. No existing rows are rewritten.
begin;

create table public.beta_quota_global_usage (
  kind text not null check (kind in ('reference_audio_generation', 'pronunciation_evaluation', 'voice_creation')),
  period_id text not null,
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, period_id)
);

create table public.beta_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null check (length(operation_id) between 1 and 160),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('reference_audio_generation', 'pronunciation_evaluation', 'voice_creation')),
  period_id text not null,
  reserved_expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  status text not null check (status in ('reserved', 'provider_started', 'consumed', 'failed_or_unknown', 'released')),
  provider_started_at timestamptz,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_quota_reservations_status_shape check (
    (status = 'reserved' and provider_started_at is null and consumed_at is null and released_at is null)
    or (status = 'provider_started' and provider_started_at is not null and consumed_at is null and released_at is null)
    or (status = 'consumed' and provider_started_at is not null and consumed_at is not null and released_at is null)
    or (status = 'failed_or_unknown' and provider_started_at is not null and consumed_at is null and released_at is null)
    or (status = 'released' and provider_started_at is null and consumed_at is null and released_at is not null)
  )
);

create index beta_quota_reservations_user_period_charged_idx
  on public.beta_quota_reservations (user_id, kind, period_id)
  where status <> 'released';
create index beta_quota_reservations_stale_period_idx
  on public.beta_quota_reservations (kind, period_id, reserved_expires_at)
  where status = 'reserved';
-- A released, never-dispatched attempt may be retried with its original ID.
-- The new attempt gets a new reservation ID, so delayed transitions for the
-- released attempt cannot change the retry.
create unique index beta_quota_reservations_active_operation_idx
  on public.beta_quota_reservations (kind, operation_id)
  where status <> 'released';

alter table public.beta_quota_global_usage enable row level security;
alter table public.beta_quota_reservations enable row level security;
revoke all on table public.beta_quota_global_usage, public.beta_quota_reservations
  from public, anon, authenticated, service_role;

create function public.beta_quota_period_id(p_period_kind text, p_at timestamptz)
returns text language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_period_kind = 'account_lifetime' then return 'account_lifetime'; end if;
  if p_period_kind = 'calendar_month_utc' then
    return 'calendar_month_utc:' || to_char(p_at at time zone 'UTC', 'YYYY-MM');
  end if;
  raise exception using errcode = 'invalid_parameter_value', message = 'quota_period_invalid';
end;
$$;
revoke all on function public.beta_quota_period_id(text, timestamptz) from public, anon, authenticated, service_role;

create function public.beta_quota_expire_stale_period(p_kind text, p_period_id text)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_released integer;
begin
  -- Caller holds the global row. SKIP LOCKED avoids waiting on a transition
  -- that holds a reservation row and is waiting for that same global row.
  with stale as (
    select id from public.beta_quota_reservations
      where kind = p_kind and period_id = p_period_id and status = 'reserved'
        and reserved_expires_at <= clock_timestamp()
      for update skip locked
  ), released as (
    update public.beta_quota_reservations set status = 'released',
      released_at = clock_timestamp(), updated_at = clock_timestamp()
      where id in (select id from stale) returning id
  ) select count(*) into v_released from released;
  if v_released > 0 then
    update public.beta_quota_global_usage set used_count = used_count - v_released,
      updated_at = clock_timestamp()
      where kind = p_kind and period_id = p_period_id and used_count >= v_released;
    if not found then
      raise exception using errcode = 'check_violation', message = 'quota_global_usage_invalid';
    end if;
  end if;
  return v_released;
end;
$$;
revoke all on function public.beta_quota_expire_stale_period(text, text) from public, anon, authenticated, service_role;

create function public.beta_quota_expire_stale_for_user(p_user_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.beta_quota_reservations; v_released integer := 0;
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  for v_row in select * from public.beta_quota_reservations
    where user_id = p_user_id and status = 'reserved'
      and reserved_expires_at <= clock_timestamp()
    order by kind, period_id, id for update
  loop
    update public.beta_quota_global_usage set used_count = used_count - 1,
      updated_at = clock_timestamp()
      where kind = v_row.kind and period_id = v_row.period_id and used_count > 0;
    if not found then
      raise exception using errcode = 'check_violation', message = 'quota_global_usage_invalid';
    end if;
    update public.beta_quota_reservations set status = 'released',
      released_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_row.id;
    v_released := v_released + 1;
  end loop;
  return v_released;
end;
$$;
revoke all on function public.beta_quota_expire_stale_for_user(uuid) from public, anon, authenticated, service_role;

create function public.reserve_beta_provider_quota(
  p_user_id uuid, p_kind text, p_operation_id text, p_period_kind text,
  p_user_limit integer, p_global_limit integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_existing public.beta_quota_reservations;
  v_period_id text;
  v_global_used integer;
  v_user_used integer;
  v_new public.beta_quota_reservations;
begin
  if p_user_id is null or p_kind is null or p_kind not in ('reference_audio_generation', 'pronunciation_evaluation', 'voice_creation')
    or p_operation_id is null or length(p_operation_id) not between 1 and 160
    or p_period_kind is null or p_period_kind not in ('calendar_month_utc', 'account_lifetime')
    or p_user_limit is null or p_user_limit < 1 or p_global_limit is null or p_global_limit < 1 then
    raise exception using errcode = 'invalid_parameter_value', message = 'quota_policy_invalid';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  if exists (
    select 1 from public.account_deletion_requests where user_id = p_user_id
      and status in ('requested', 'confirmed', 'processing', 'provider_cleanup_failed',
        'storage_cleanup_failed', 'db_cleanup_failed', 'auth_cleanup_failed')
  ) then
    raise exception using errcode = 'object_in_use', message = 'account_deletion_active';
  end if;
  -- Recover the caller's expired, never-dispatched operation before checking
  -- idempotency, so an intentional retry with the same ID can rebook safely.
  perform public.beta_quota_expire_stale_for_user(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('beta-quota-operation:' || p_kind || ':' || p_operation_id, 0));
  select * into v_existing from public.beta_quota_reservations
    where kind = p_kind and operation_id = p_operation_id and status <> 'released';
  if found then
    if v_existing.user_id <> p_user_id then
      raise exception using errcode = 'unique_violation', message = 'quota_operation_owner_conflict';
    end if;
    return jsonb_build_object('result', 'duplicate', 'reservation_id', v_existing.id,
      'status', v_existing.status, 'period_id', v_existing.period_id);
  end if;

  -- The period is derived by the DB, never supplied by a client. Operation
  -- identity is checked first, so a retry across a UTC month does not rebook.
  v_period_id := public.beta_quota_period_id(p_period_kind, transaction_timestamp());
  insert into public.beta_quota_global_usage (kind, period_id)
    values (p_kind, v_period_id) on conflict do nothing;
  select used_count into v_global_used from public.beta_quota_global_usage
    where kind = p_kind and period_id = v_period_id for update;
  perform public.beta_quota_expire_stale_period(p_kind, v_period_id);
  select used_count into v_global_used from public.beta_quota_global_usage
    where kind = p_kind and period_id = v_period_id;
  select count(*) into v_user_used from public.beta_quota_reservations
    where user_id = p_user_id and kind = p_kind and period_id = v_period_id and status <> 'released';
  if v_user_used >= p_user_limit or v_global_used >= p_global_limit then
    return jsonb_build_object('result', 'limit_reached', 'period_id', v_period_id);
  end if;

  insert into public.beta_quota_reservations (operation_id, user_id, kind, period_id, status)
    values (p_operation_id, p_user_id, p_kind, v_period_id, 'reserved') returning * into v_new;
  update public.beta_quota_global_usage set used_count = used_count + 1, updated_at = now()
    where kind = p_kind and period_id = v_period_id;
  return jsonb_build_object('result', 'reserved', 'reservation_id', v_new.id,
    'status', v_new.status, 'period_id', v_period_id);
end;
$$;

create function public.transition_beta_provider_quota(
  p_user_id uuid, p_reservation_id uuid, p_transition text
) returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.beta_quota_reservations;
begin
  if p_user_id is null or p_reservation_id is null or p_transition is null
    or p_transition not in ('provider_started', 'consumed', 'failed_or_unknown', 'released') then
    raise exception using errcode = 'invalid_parameter_value', message = 'quota_transition_invalid';
  end if;
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  if p_transition = 'provider_started' and exists (
    select 1 from public.account_deletion_requests where user_id = p_user_id
      and status in ('requested', 'confirmed', 'processing', 'provider_cleanup_failed',
        'storage_cleanup_failed', 'db_cleanup_failed', 'auth_cleanup_failed')
  ) then
    raise exception using errcode = 'object_in_use', message = 'account_deletion_active';
  end if;
  select * into v_row from public.beta_quota_reservations
    where id = p_reservation_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'no_data_found', message = 'quota_reservation_missing';
  end if;
  if v_row.status = p_transition then return v_row.status; end if;
  if v_row.status = 'reserved' and p_transition = 'provider_started'
    and v_row.reserved_expires_at <= clock_timestamp() then
    raise exception using errcode = 'object_not_in_prerequisite_state', message = 'quota_reservation_expired';
  end if;
  if (v_row.status = 'reserved' and p_transition not in ('provider_started', 'released'))
    or (v_row.status = 'provider_started' and p_transition not in ('consumed', 'failed_or_unknown'))
    or v_row.status not in ('reserved', 'provider_started') then
    raise exception using errcode = 'check_violation', message = 'quota_transition_conflict';
  end if;
  if p_transition = 'released' then
    perform 1 from public.beta_quota_global_usage
      where kind = v_row.kind and period_id = v_row.period_id for update;
    update public.beta_quota_global_usage set used_count = used_count - 1, updated_at = now()
      where kind = v_row.kind and period_id = v_row.period_id and used_count > 0;
    if not found then
      raise exception using errcode = 'check_violation', message = 'quota_global_usage_invalid';
    end if;
  end if;
  update public.beta_quota_reservations set status = p_transition,
    provider_started_at = case when p_transition = 'provider_started' then now() else provider_started_at end,
    consumed_at = case when p_transition = 'consumed' then now() else consumed_at end,
    released_at = case when p_transition = 'released' then now() else released_at end,
    updated_at = now() where id = p_reservation_id;
  return p_transition;
end;
$$;

-- Voice registration's durable dispatch admission and quota provider-start
-- record must commit together. A failed second step rolls back dispatch.
create function public.begin_voice_registration_with_beta_quota(
  p_user_id uuid, p_reservation_id uuid, p_intent_id uuid, p_lease_token uuid
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.beta_quota_reservations;
begin
  if p_user_id is null or p_reservation_id is null or p_intent_id is null or p_lease_token is null then
    raise exception using errcode = 'invalid_parameter_value', message = 'quota_voice_registration_invalid';
  end if;
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  select * into v_row from public.beta_quota_reservations
    where id = p_reservation_id and user_id = p_user_id and kind = 'voice_creation' for update;
  if not found or v_row.status <> 'reserved' or v_row.reserved_expires_at <= clock_timestamp() then
    raise exception using errcode = 'object_not_in_prerequisite_state', message = 'quota_voice_registration_rejected';
  end if;
  perform public.begin_voice_source_registration(p_intent_id, p_user_id, p_lease_token);
  perform public.transition_beta_provider_quota(p_user_id, p_reservation_id, 'provider_started');
  return true;
end;
$$;

create function public.beta_quota_guard_profile_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.g5c_b4_lock_voice_asset_user(old.id);
  if exists (select 1 from public.beta_quota_reservations
    where user_id = old.id and status in ('reserved', 'provider_started')) then
    raise exception using errcode = 'object_in_use', message = 'quota_active_profile_delete_blocked';
  end if;
  return old;
end;
$$;
revoke all on function public.beta_quota_guard_profile_delete() from public, anon, authenticated, service_role;
create trigger beta_quota_guard_profile_delete before delete on public.profiles
  for each row execute function public.beta_quota_guard_profile_delete();

revoke all on function public.reserve_beta_provider_quota(uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.transition_beta_provider_quota(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.begin_voice_registration_with_beta_quota(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_beta_provider_quota(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.transition_beta_provider_quota(uuid, uuid, text) to service_role;
grant execute on function public.begin_voice_registration_with_beta_quota(uuid, uuid, uuid, uuid) to service_role;


-- New requests inventory owned quota rows; anonymous global usage survives deletion.
-- Old terminal v1/v2 evidence remains immutable under the prior finalizer.
alter table public.account_deletion_requests alter column db_inventory_version set default 'beta-quota.account-db.v3';
alter table public.account_deletion_requests drop constraint account_deletion_requests_db_inventory_version_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_db_inventory_version_check
 check(db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3'));
alter table public.account_deletion_requests drop constraint account_deletion_requests_db_terminal_shape_check;


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
      and db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3')
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
    and new.db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3')
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
    and p_request.db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3')
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

    and p_request.db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3')
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

alter function public.finalize_account_deletion_database_stage(uuid,uuid,text)
  rename to beta_quota_legacy_v2_finalizer;
revoke all on function public.beta_quota_legacy_v2_finalizer(uuid,uuid,text)
  from public, anon, authenticated, service_role;

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

  v_revisions bigint; v_source_uses bigint;
  v_profiles bigint; v_scripts bigint; v_script_audios bigint; v_takes bigint;
  v_weak_words bigint; v_coach_feedback bigint; v_saved_model bigint; v_saved_best bigint;
  v_voices bigint; v_voice_consents bigint; v_processing_consents bigint;
  v_voice_operations bigint; v_voice_targets bigint; v_write_intents bigint;
  v_requests bigint; v_provider_targets bigint; v_quota_events bigint; v_storage_targets bigint;
  v_quota_reservations bigint;

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
  if p_expected_db_inventory_version in ('g5d-2h.account-db.v1', 'script-revision.account-db.v2') then
    if exists (select 1 from public.beta_quota_reservations where user_id = p_expected_user_id) then
      raise exception using errcode = 'check_violation', message = 'quota_legacy_inventory_has_new_rows';
    end if;
    return query select * from public.beta_quota_legacy_v2_finalizer(
      p_deletion_request_id, p_expected_user_id, p_expected_db_inventory_version);
    return;
  end if;
  if p_deletion_request_id is null or p_expected_user_id is null
    or p_expected_db_inventory_version is distinct from 'beta-quota.account-db.v3' then
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
      or v_request.db_inventory_version <> 'beta-quota.account-db.v3'
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
      or v_request.db_inventory_version <> 'beta-quota.account-db.v3'
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
    or exists (select 1 from public.script_revisions r join public.scripts s on s.id=r.script_id where s.user_id=v_owned_user_id)
    or exists (select 1 from public.voice_source_uses where user_id=v_owned_user_id)
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
      or exists (select 1 from public.beta_quota_reservations where user_id = v_owned_user_id)
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

  perform public.beta_quota_expire_stale_for_user(v_owned_user_id);
  if exists (select 1 from public.beta_quota_reservations
    where user_id = v_owned_user_id and status in ('reserved', 'provider_started')) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_quota_operation_active';
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

  select count(*) into v_quota_reservations from public.beta_quota_reservations where user_id = v_owned_user_id;
  select count(*) into v_revisions from public.script_revisions r join public.scripts s on s.id=r.script_id where s.user_id=v_owned_user_id;
  select count(*) into v_source_uses from public.voice_source_uses where user_id=v_owned_user_id;
  -- v2 inventories the two additional cascade children explicitly.
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

  v_deleted := v_revisions + v_source_uses + v_profiles + v_scripts + v_script_audios + v_takes + v_weak_words
    + v_coach_feedback + v_saved_model + v_saved_best + v_voices + v_voice_consents
    + v_processing_consents + cardinality(v_voice_expired_ids) + v_voice_expired_targets
    + v_write_intents + v_quota_reservations + cardinality(v_prior_request_ids) + v_prior_provider_targets
    + v_prior_storage_targets + cardinality(v_quota_expired_ids);
  v_anonymized := cardinality(v_voice_retain_ids) + v_voice_retain_targets
    + cardinality(v_quota_retain_ids);
  v_retained := 1 + v_current_provider_targets + v_current_storage_targets;
  v_observed := v_revisions + v_source_uses + v_profiles + v_scripts + v_script_audios + v_takes + v_weak_words
    + v_coach_feedback + v_saved_model + v_saved_best + v_voices + v_voice_consents
    + v_processing_consents + v_voice_operations + v_voice_targets + v_write_intents
    + v_requests + v_provider_targets + v_quota_events + v_storage_targets + v_quota_reservations;

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

  delete from public.beta_quota_reservations where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_quota_reservations then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_reservation_drift'; end if;

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
    or exists (select 1 from public.script_revisions r join public.scripts s on s.id=r.script_id where s.user_id=v_owned_user_id)
    or exists (select 1 from public.voice_source_uses where user_id=v_owned_user_id)
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
    or exists (select 1 from public.beta_quota_reservations where user_id = v_owned_user_id)
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
      db_inventory_version = 'beta-quota.account-db.v3',
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

revoke all on function public.finalize_account_deletion_database_stage(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_account_deletion_database_stage(uuid,uuid,text) to service_role;

commit;
