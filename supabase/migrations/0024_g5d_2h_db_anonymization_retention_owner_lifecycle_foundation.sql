-- G5D-2H: schema foundation for the future atomic account-deletion DB stage.
-- This migration does not delete or anonymize product rows, add the DB finalizer,
-- advance Auth/completion, or change the closed Provider/Storage authorities.

-- ---------------------------------------------------------------------------
-- Completed voice-deletion audit owner lifecycle and retention.
-- ---------------------------------------------------------------------------

alter table public.voice_deletion_targets
  drop constraint if exists voice_deletion_targets_operation_owner_fkey;

alter table public.voice_deletion_operations
  drop constraint if exists voice_deletion_operations_user_id_fkey;

alter table public.voice_deletion_operations
  alter column user_id drop not null,
  add constraint voice_deletion_operations_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.voice_deletion_targets
  alter column user_id drop not null,
  add constraint voice_deletion_targets_operation_fkey
    foreign key (operation_id)
    references public.voice_deletion_operations(id)
    on delete cascade,
  add constraint voice_deletion_targets_operation_owner_fkey
    foreign key (operation_id, user_id)
    references public.voice_deletion_operations(id, user_id)
    on update cascade
    on delete cascade;

alter table public.voice_deletion_operations
  add constraint voice_deletion_operations_anonymized_owner_shape_check check (
    user_id is not null
    or (
      status = 'completed'
      and current_stage is null
      and snapshot_status = 'succeeded'
      and consent_withdrawal_status in ('succeeded', 'not_needed')
      and post_delete_verification_status = 'succeeded'
      and completed_at is not null
      and sensitive_snapshot_scrubbed_at is not null
      and consent_snapshot_id is null
      and cardinality(consent_snapshot_ids) = 0
      and lease_token is null
      and lease_expires_at is null
      and audit_expires_at = completed_at + interval '90 days'
    )
  );

alter table public.voice_deletion_targets
  add constraint voice_deletion_targets_anonymized_owner_shape_check check (
    user_id is not null
    or (
      status = 'verified_absent'
      and locator_scrubbed_at is not null
      and source_row_id is null
      and provider_name is null
      and provider_resource_id is null
      and storage_bucket is null
      and storage_object_key is null
      and target_fingerprint is null
    )
  );

create index if not exists voice_deletion_operations_audit_expires_at_idx
  on public.voice_deletion_operations(audit_expires_at)
  where status = 'completed' and audit_expires_at is not null;

create or replace function public.enforce_voice_deletion_operation_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_anonymization boolean :=
    old.user_id is not null and new.user_id is null;
begin
  if new.user_id is distinct from old.user_id then
    if not v_owner_anonymization
      or old.status <> 'completed'
      or new.status <> 'completed'
      or new.current_stage is not null
      or new.snapshot_status <> 'succeeded'
      or new.consent_withdrawal_status not in ('succeeded', 'not_needed')
      or new.post_delete_verification_status <> 'succeeded'
      or new.completed_at is null
      or new.sensitive_snapshot_scrubbed_at is null
      or new.consent_snapshot_id is not null
      or cardinality(new.consent_snapshot_ids) <> 0
      or new.lease_token is not null
      or new.lease_expires_at is not null
      or new.audit_expires_at is distinct from new.completed_at + interval '90 days'
      or exists (
        select 1
        from public.voice_deletion_targets as target
        where target.operation_id = new.id
          and (
            target.user_id is distinct from old.user_id
            or target.status <> 'verified_absent'
            or target.locator_scrubbed_at is null
            or target.source_row_id is not null
            or target.provider_name is not null
            or target.provider_resource_id is not null
            or target.storage_bucket is not null
            or target.storage_object_key is not null
            or target.target_fingerprint is not null
          )
      ) then
      raise exception using
        errcode = 'check_violation',
        message = 'voice deletion audit owner anonymization requires a completed verified scrubbed audit';
    end if;
  end if;

  if old.status = 'completed' then
    if new.status <> 'completed' then
      raise exception using
        errcode = 'check_violation',
        message = 'completed voice deletion operations cannot transition to a non-completed status';
    end if;

    if new.current_stage is distinct from old.current_stage
      or new.snapshot_version is distinct from old.snapshot_version
      or new.snapshot_status is distinct from old.snapshot_status
      or new.consent_snapshot_id is distinct from old.consent_snapshot_id
      or new.consent_snapshot_state is distinct from old.consent_snapshot_state
      or new.consent_withdrawal_status is distinct from old.consent_withdrawal_status
      or new.post_delete_verification_status is distinct from old.post_delete_verification_status
      or new.runner_attempt_count is distinct from old.runner_attempt_count
      or new.snapshot_attempt_count is distinct from old.snapshot_attempt_count
      or new.consent_attempt_count is distinct from old.consent_attempt_count
      or new.verification_attempt_count is distinct from old.verification_attempt_count
      or new.last_failure_stage is distinct from old.last_failure_stage
      or new.last_failure_category is distinct from old.last_failure_category
      or new.next_retry_at is distinct from old.next_retry_at
      or new.manual_reason_category is distinct from old.manual_reason_category
      or new.manual_required_at is distinct from old.manual_required_at
      or new.lease_token is distinct from old.lease_token
      or new.lease_expires_at is distinct from old.lease_expires_at
      or new.requested_at is distinct from old.requested_at
      or new.snapshot_at is distinct from old.snapshot_at
      or new.processing_started_at is distinct from old.processing_started_at
      or new.destructive_started_at is distinct from old.destructive_started_at
      or new.last_attempted_at is distinct from old.last_attempted_at
      or new.completed_at is distinct from old.completed_at
      or new.failed_at is distinct from old.failed_at
      or new.sensitive_snapshot_scrubbed_at is distinct from old.sensitive_snapshot_scrubbed_at
      or new.audit_expires_at is distinct from old.audit_expires_at then
      raise exception using
        errcode = 'check_violation',
        message = 'completed voice deletion operations are immutable outside owner anonymization or retention purge';
    end if;
  end if;

  if old.destructive_started_at is not null
    and new.destructive_started_at is distinct from old.destructive_started_at then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion destructive_started_at is monotonic';
  end if;

  if new.status = 'failed'
    and (old.destructive_started_at is not null or new.destructive_started_at is not null) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion cannot transition to failed after destructive work starts';
  end if;

  if new.status = 'completed' then
    if new.snapshot_status <> 'succeeded'
      or new.consent_withdrawal_status not in ('succeeded', 'not_needed')
      or new.post_delete_verification_status <> 'succeeded'
      or new.completed_at is null
      or new.sensitive_snapshot_scrubbed_at is null
      or new.consent_snapshot_id is not null
      or cardinality(new.consent_snapshot_ids) <> 0
      or new.audit_expires_at <> new.completed_at + interval '90 days' then
      raise exception using
        errcode = 'check_violation',
        message = 'voice deletion completion prerequisites are not satisfied';
    end if;

    if exists (
      select 1
      from public.voice_deletion_targets
      where operation_id = new.id
        and (
          status <> 'verified_absent'
          or locator_scrubbed_at is null
          or source_row_id is not null
          or provider_name is not null
          or provider_resource_id is not null
          or storage_bucket is not null
          or storage_object_key is not null
          or target_fingerprint is not null
        )
    ) then
      raise exception using
        errcode = 'check_violation',
        message = 'voice deletion completion requires every target to be verified absent and scrubbed';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_voice_deletion_target_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_locator_changed boolean;
  v_owner_null_cascade boolean := false;
begin
  if old.user_id is not null
    and new.user_id is null
    and pg_trigger_depth() > 1 then
    select exists (
      select 1
      from public.voice_deletion_operations as operation
      where operation.id = new.operation_id
        and operation.user_id is null
        and operation.status = 'completed'
        and operation.current_stage is null
        and operation.snapshot_status = 'succeeded'
        and operation.consent_withdrawal_status in ('succeeded', 'not_needed')
        and operation.post_delete_verification_status = 'succeeded'
        and operation.completed_at is not null
        and operation.sensitive_snapshot_scrubbed_at is not null
        and operation.consent_snapshot_id is null
        and cardinality(operation.consent_snapshot_ids) = 0
        and operation.lease_token is null
        and operation.lease_expires_at is null
        and operation.audit_expires_at = operation.completed_at + interval '90 days'
    ) into v_owner_null_cascade;
  end if;

  if new.operation_id is distinct from old.operation_id
    or new.target_kind is distinct from old.target_kind
    or (
      new.user_id is distinct from old.user_id
      and not v_owner_null_cascade
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion target ownership and kind are immutable outside eligible owner-null cascade';
  end if;

  v_locator_changed := new.source_row_id is distinct from old.source_row_id
    or new.provider_name is distinct from old.provider_name
    or new.provider_resource_id is distinct from old.provider_resource_id
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_object_key is distinct from old.storage_object_key
    or new.target_fingerprint is distinct from old.target_fingerprint;

  if old.locator_scrubbed_at is not null then
    if v_locator_changed
      or new.locator_scrubbed_at is distinct from old.locator_scrubbed_at
      or new.status is distinct from old.status
      or new.delete_outcome is distinct from old.delete_outcome
      or new.reconciliation_status is distinct from old.reconciliation_status
      or new.verification_status is distinct from old.verification_status
      or new.delete_attempt_count is distinct from old.delete_attempt_count
      or new.verification_attempt_count is distinct from old.verification_attempt_count
      or new.last_failure_category is distinct from old.last_failure_category
      or new.last_attempted_at is distinct from old.last_attempted_at
      or new.delete_succeeded_at is distinct from old.delete_succeeded_at
      or new.verified_absent_at is distinct from old.verified_absent_at
      or new.manual_required_at is distinct from old.manual_required_at then
      raise exception using
        errcode = 'check_violation',
        message = 'completed voice deletion targets are immutable';
    end if;

    return new;
  end if;

  if v_locator_changed
    and (
      new.status <> 'verified_absent'
      or new.source_row_id is not null
      or new.provider_name is not null
      or new.provider_resource_id is not null
      or new.storage_bucket is not null
      or new.storage_object_key is not null
      or new.target_fingerprint is not null
      or new.locator_scrubbed_at is null
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion target locators can only transition to a scrubbed state';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_voice_deletion_operation_transition()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_voice_deletion_target_immutability()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Quota identifier anonymization and attempted-at anchored retention.
-- ---------------------------------------------------------------------------

alter table public.quota_events
  add column if not exists identifier_scrubbed_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

-- Avoid changing updated_at while adding retention metadata to existing rows.
alter table public.quota_events disable trigger set_updated_at_quota_events;
do $$
declare
  v_backfilled_count bigint;
begin
  update public.quota_events
  set retention_expires_at = attempted_at + interval '90 days'
  where retention_expires_at is null;
  get diagnostics v_backfilled_count = row_count;
  raise notice 'G5D-2H quota retention metadata backfill rows: %', v_backfilled_count;
end;
$$;
alter table public.quota_events enable trigger set_updated_at_quota_events;

alter table public.quota_events
  alter column user_id drop not null,
  alter column retention_expires_at set not null,
  drop constraint if exists quota_events_user_id_fkey,
  add constraint quota_events_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null,
  add constraint quota_events_retention_expiry_check check (
    retention_expires_at = attempted_at + interval '90 days'
  ),
  add constraint quota_events_anonymized_retained_shape_check check (
    (
      user_id is not null
      and identifier_scrubbed_at is null
    )
    or (
      user_id is null
      and identifier_scrubbed_at is not null
      and subject_id is null
      and target_resource_id is null
      and idempotency_key is null
      and dedupe_key is null
      and request_fingerprint is null
      and provider_request_id is null
      and metadata = '{}'::jsonb
    )
  );

create index if not exists quota_events_retention_expires_at_idx
  on public.quota_events(retention_expires_at);

create or replace function public.enforce_quota_event_retention_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.retention_expires_at is null then
      new.retention_expires_at := new.attempted_at + interval '90 days';
    elsif new.retention_expires_at is distinct from new.attempted_at + interval '90 days' then
      raise exception using
        errcode = 'check_violation',
        message = 'quota retention expiry must remain anchored to attempted_at';
    end if;

    return new;
  end if;

  if new.attempted_at is distinct from old.attempted_at
    or new.retention_expires_at is distinct from old.retention_expires_at then
    raise exception using
      errcode = 'check_violation',
      message = 'quota retention anchor and expiry are immutable';
  end if;

  if old.user_id is null and new.user_id is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'anonymized quota ownership cannot be restored';
  end if;

  if old.identifier_scrubbed_at is not null
    and new.identifier_scrubbed_at is distinct from old.identifier_scrubbed_at then
    raise exception using
      errcode = 'check_violation',
      message = 'quota identifier scrub timestamp is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_quota_event_retention_lifecycle on public.quota_events;
create trigger enforce_quota_event_retention_lifecycle
  before insert or update on public.quota_events
  for each row
  execute function public.enforce_quota_event_retention_lifecycle();

revoke all on function public.enforce_quota_event_retention_lifecycle()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Account request DB evidence and fail-closed pre-finalizer terminal authority.
-- ---------------------------------------------------------------------------

alter table public.account_deletion_requests
  add column if not exists db_inventory_version text not null default 'g5d-2h.account-db.v1',
  add column if not exists db_observed_row_count integer not null default 0,
  add column if not exists db_deleted_row_count integer not null default 0,
  add column if not exists db_anonymized_row_count integer not null default 0,
  add column if not exists db_retained_row_count integer not null default 0,
  add column if not exists db_sub_finalized_at timestamptz;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_db_inventory_version_check check (
    db_inventory_version = 'g5d-2h.account-db.v1'
  ),
  add constraint account_deletion_requests_db_counts_check check (
    db_observed_row_count >= 0
    and db_deleted_row_count >= 0
    and db_anonymized_row_count >= 0
    and db_retained_row_count >= 0
  ),
  add constraint account_deletion_requests_db_terminal_shape_check check (
    (
      db_cleanup_status not in ('succeeded', 'not_needed')
      and db_sub_finalized_at is null
    )
    or (
      db_cleanup_status in ('succeeded', 'not_needed')
      and db_sub_finalized_at is not null
      and db_inventory_version = 'g5d-2h.account-db.v1'
    )
  );

create or replace function public.enforce_account_deletion_db_terminal_foundation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.db_cleanup_status in ('succeeded', 'not_needed')
      or new.db_sub_finalized_at is not null then
      raise exception using
        errcode = 'insufficient_privilege',
        message = 'account deletion DB terminal state is unavailable before focused finalizer installation';
    end if;

    return new;
  end if;

  if old.db_cleanup_status not in ('succeeded', 'not_needed')
    and new.db_cleanup_status in ('succeeded', 'not_needed') then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'account deletion DB terminal state is unavailable before focused finalizer installation';
  end if;

  if old.db_sub_finalized_at is null and new.db_sub_finalized_at is not null then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'account deletion DB sub-finalization is unavailable before focused finalizer installation';
  end if;

  if old.db_cleanup_status in ('succeeded', 'not_needed')
    and (
      new.db_cleanup_status is distinct from old.db_cleanup_status
      or new.db_inventory_version is distinct from old.db_inventory_version
      or new.db_observed_row_count is distinct from old.db_observed_row_count
      or new.db_deleted_row_count is distinct from old.db_deleted_row_count
      or new.db_anonymized_row_count is distinct from old.db_anonymized_row_count
      or new.db_retained_row_count is distinct from old.db_retained_row_count
      or new.db_sub_finalized_at is distinct from old.db_sub_finalized_at
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'account deletion DB terminal evidence is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_account_deletion_db_terminal_foundation
  on public.account_deletion_requests;
create trigger enforce_account_deletion_db_terminal_foundation
  before insert or update on public.account_deletion_requests
  for each row
  execute function public.enforce_account_deletion_db_terminal_foundation();

revoke all on function public.enforce_account_deletion_db_terminal_foundation()
  from public, anon, authenticated, service_role;

comment on column public.account_deletion_requests.db_inventory_version is
  'Exact 18-table DB-stage inventory contract version. Terminal writes remain unavailable until the focused atomic DB finalizer is installed.';
comment on column public.quota_events.retention_expires_at is
  'Rolling retention expiry anchored to attempted_at + 90 days; account deletion must not restart this period.';
