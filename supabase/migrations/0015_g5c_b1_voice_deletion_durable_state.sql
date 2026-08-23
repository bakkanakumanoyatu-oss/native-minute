create table if not exists public.voice_deletion_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  current_stage text,
  snapshot_version text not null default 'g5c-b.voice-only.v1',
  snapshot_status text not null default 'pending',
  consent_snapshot_id uuid,
  consent_snapshot_state text not null default 'unknown',
  consent_withdrawal_status text not null default 'pending',
  post_delete_verification_status text not null default 'pending',
  runner_attempt_count integer not null default 0,
  snapshot_attempt_count integer not null default 0,
  consent_attempt_count integer not null default 0,
  verification_attempt_count integer not null default 0,
  last_failure_stage text,
  last_failure_category text,
  next_retry_at timestamptz,
  manual_reason_category text,
  manual_required_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  requested_at timestamptz not null default now(),
  snapshot_at timestamptz,
  processing_started_at timestamptz,
  destructive_started_at timestamptz,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  sensitive_snapshot_scrubbed_at timestamptz,
  audit_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_deletion_operations_user_id_unique unique (id, user_id),
  constraint voice_deletion_operations_status_check check (
    status in ('pending', 'processing', 'partial_failure', 'manual_required', 'completed', 'failed')
  ),
  constraint voice_deletion_operations_current_stage_check check (
    current_stage is null
    or current_stage in (
      'snapshot',
      'consent_withdrawal',
      'provider_cleanup',
      'storage_cleanup',
      'database_cleanup',
      'post_delete_verification'
    )
  ),
  constraint voice_deletion_operations_snapshot_status_check check (
    snapshot_status in ('pending', 'processing', 'succeeded', 'not_needed', 'failed', 'manual_required')
  ),
  constraint voice_deletion_operations_consent_withdrawal_status_check check (
    consent_withdrawal_status in ('pending', 'processing', 'succeeded', 'not_needed', 'failed', 'manual_required')
  ),
  constraint voice_deletion_operations_verification_status_check check (
    post_delete_verification_status in ('pending', 'processing', 'succeeded', 'not_needed', 'failed', 'manual_required')
  ),
  constraint voice_deletion_operations_attempt_counts_check check (
    runner_attempt_count >= 0
    and snapshot_attempt_count >= 0
    and consent_attempt_count >= 0
    and verification_attempt_count >= 0
  ),
  constraint voice_deletion_operations_failure_stage_check check (
    last_failure_stage is null
    or last_failure_stage in (
      'snapshot',
      'consent_withdrawal',
      'provider_cleanup',
      'storage_cleanup',
      'database_cleanup',
      'post_delete_verification'
    )
  ),
  constraint voice_deletion_operations_lease_pair_check check (
    (lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null)
  ),
  constraint voice_deletion_operations_completed_safety_check check (
    status <> 'completed'
    or (
      snapshot_status = 'succeeded'
      and consent_withdrawal_status in ('succeeded', 'not_needed')
      and post_delete_verification_status = 'succeeded'
      and completed_at is not null
      and sensitive_snapshot_scrubbed_at is not null
      and consent_snapshot_id is null
      and audit_expires_at = completed_at + interval '90 days'
    )
  ),
  constraint voice_deletion_operations_failed_before_destructive_check check (
    status <> 'failed' or destructive_started_at is null
  )
);

create table if not exists public.voice_deletion_targets (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null,
  target_kind text not null,
  source_row_id uuid,
  provider_name text,
  provider_resource_id text,
  storage_bucket text,
  storage_object_key text,
  target_fingerprint text,
  status text not null default 'pending',
  delete_outcome text not null default 'not_attempted',
  reconciliation_status text not null default 'not_applicable',
  verification_status text not null default 'pending',
  delete_attempt_count integer not null default 0,
  verification_attempt_count integer not null default 0,
  last_failure_category text,
  last_attempted_at timestamptz,
  delete_succeeded_at timestamptz,
  verified_absent_at timestamptz,
  manual_required_at timestamptz,
  locator_scrubbed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_deletion_targets_operation_owner_fkey
    foreign key (operation_id, user_id)
    references public.voice_deletion_operations (id, user_id)
    on delete cascade,
  constraint voice_deletion_targets_kind_check check (
    target_kind in (
      'provider_voice',
      'voice_sample',
      'voice_consent_recording',
      'script_audio_storage',
      'script_audio',
      'saved_model_audio',
      'voice_binding'
    )
  ),
  constraint voice_deletion_targets_status_check check (
    status in ('pending', 'delete_requested', 'deleted', 'verified_absent', 'manual_required')
  ),
  constraint voice_deletion_targets_delete_outcome_check check (
    delete_outcome in ('not_attempted', 'succeeded', 'not_found', 'timed_out', 'unavailable', 'rejected', 'not_needed')
  ),
  constraint voice_deletion_targets_reconciliation_status_check check (
    reconciliation_status in ('not_applicable', 'pending', 'verified_absent', 'present', 'unavailable', 'manual_required')
  ),
  constraint voice_deletion_targets_verification_status_check check (
    verification_status in ('not_applicable', 'pending', 'verified_absent', 'present', 'unavailable', 'manual_required')
  ),
  constraint voice_deletion_targets_attempt_counts_check check (
    delete_attempt_count >= 0 and verification_attempt_count >= 0
  ),
  constraint voice_deletion_targets_deleted_requires_success_check check (
    status <> 'deleted' or delete_outcome = 'succeeded'
  ),
  constraint voice_deletion_targets_verified_absent_check check (
    status <> 'verified_absent'
    or (
      (reconciliation_status = 'verified_absent' or verification_status = 'verified_absent')
      and verified_absent_at is not null
    )
  ),
  constraint voice_deletion_targets_scrubbed_locator_check check (
    locator_scrubbed_at is null
    or (
      source_row_id is null
      and provider_name is null
      and provider_resource_id is null
      and storage_bucket is null
      and storage_object_key is null
      and target_fingerprint is null
    )
  ),
  constraint voice_deletion_targets_locator_required_before_scrub_check check (
    locator_scrubbed_at is not null
    or (
      target_fingerprint is not null
      and btrim(target_fingerprint) <> ''
      and (
        (target_kind = 'provider_voice' and provider_name is not null and btrim(provider_name) <> '' and provider_resource_id is not null and btrim(provider_resource_id) <> '')
        or (target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage') and storage_bucket is not null and btrim(storage_bucket) <> '' and storage_object_key is not null and btrim(storage_object_key) <> '')
        or (target_kind in ('script_audio', 'saved_model_audio', 'voice_binding') and source_row_id is not null)
      )
    )
  )
);

comment on table public.voice_deletion_operations is
  'Server-only durable state for a voice-only deletion operation. It must not be exposed through direct client table access or hold raw provider responses, audio, signed URLs, or secrets.';

comment on table public.voice_deletion_targets is
  'Server-only durable voice-only deletion targets. Raw provider and Storage locators are internal execution data and must be scrubbed after successful completion.';

drop trigger if exists set_updated_at_voice_deletion_operations on public.voice_deletion_operations;
create trigger set_updated_at_voice_deletion_operations
  before update on public.voice_deletion_operations
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_updated_at_voice_deletion_targets on public.voice_deletion_targets;
create trigger set_updated_at_voice_deletion_targets
  before update on public.voice_deletion_targets
  for each row
  execute function public.set_updated_at();

create unique index if not exists voice_deletion_operations_user_active_unique_idx
  on public.voice_deletion_operations (user_id)
  where status in ('pending', 'processing', 'partial_failure', 'manual_required');

create index if not exists voice_deletion_operations_user_requested_at_idx
  on public.voice_deletion_operations (user_id, requested_at desc);

create index if not exists voice_deletion_operations_status_next_retry_at_idx
  on public.voice_deletion_operations (status, next_retry_at);

create index if not exists voice_deletion_operations_lease_expires_at_idx
  on public.voice_deletion_operations (lease_expires_at)
  where lease_token is not null;

create unique index if not exists voice_deletion_targets_operation_fingerprint_unique_idx
  on public.voice_deletion_targets (operation_id, target_fingerprint)
  where target_fingerprint is not null;

create index if not exists voice_deletion_targets_operation_status_idx
  on public.voice_deletion_targets (operation_id, status);

create index if not exists voice_deletion_targets_operation_kind_status_idx
  on public.voice_deletion_targets (operation_id, target_kind, status);

create index if not exists voice_deletion_targets_user_operation_idx
  on public.voice_deletion_targets (user_id, operation_id);

alter table public.voice_deletion_operations enable row level security;
alter table public.voice_deletion_targets enable row level security;

revoke all privileges on table public.voice_deletion_operations from public, anon, authenticated, service_role;
revoke all privileges on table public.voice_deletion_targets from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.voice_deletion_operations to service_role;
grant select, insert, update, delete on table public.voice_deletion_targets to service_role;

create or replace function public.enforce_voice_deletion_operation_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'completed' then
    if new.status <> 'completed' then
      raise exception using
        errcode = 'check_violation',
        message = 'completed voice deletion operations cannot transition to a non-completed status';
    end if;

    if new.user_id is distinct from old.user_id
      or new.current_stage is distinct from old.current_stage
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
        message = 'completed voice deletion operations are immutable outside retention purge';
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

create or replace function public.enforce_voice_deletion_target_locator_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_locator_changed boolean;
  v_finalization_operation_id text;
begin
  v_locator_changed := new.source_row_id is distinct from old.source_row_id
    or new.provider_name is distinct from old.provider_name
    or new.provider_resource_id is distinct from old.provider_resource_id
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_object_key is distinct from old.storage_object_key
    or new.target_fingerprint is distinct from old.target_fingerprint;
  v_finalization_operation_id := current_setting('app.g5c_voice_deletion_finalizing_operation_id', true);

  if old.locator_scrubbed_at is not null then
    if v_locator_changed or new.locator_scrubbed_at is distinct from old.locator_scrubbed_at then
      raise exception using
        errcode = 'check_violation',
        message = 'scrubbed voice deletion target locators are immutable';
    end if;

    return new;
  end if;

  if not v_locator_changed and new.locator_scrubbed_at is null then
    return new;
  end if;

  if new.status <> 'verified_absent'
    or new.source_row_id is not null
    or new.provider_name is not null
    or new.provider_resource_id is not null
    or new.storage_bucket is not null
    or new.storage_object_key is not null
    or new.target_fingerprint is not null
    or new.locator_scrubbed_at is null
    or v_finalization_operation_id is distinct from old.operation_id::text
    or not exists (
      select 1
      from public.voice_deletion_operations
      where id = old.operation_id
        and user_id = old.user_id
        and post_delete_verification_status = 'succeeded'
    ) then
    raise exception using
      errcode = 'check_violation',
      message = 'voice deletion target locators can only be scrubbed by safe finalization';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_voice_deletion_operation_transition on public.voice_deletion_operations;
create trigger enforce_voice_deletion_operation_transition
  before update on public.voice_deletion_operations
  for each row
  execute function public.enforce_voice_deletion_operation_transition();

drop trigger if exists enforce_voice_deletion_target_locator_transition on public.voice_deletion_targets;
create trigger enforce_voice_deletion_target_locator_transition
  before update on public.voice_deletion_targets
  for each row
  execute function public.enforce_voice_deletion_target_locator_transition();

create or replace function public.seal_voice_deletion_snapshot(
  p_operation_id uuid,
  p_user_id uuid,
  p_targets jsonb
)
returns public.voice_deletion_operations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation public.voice_deletion_operations;
begin
  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'voice deletion snapshot targets must be an array';
  end if;

  select *
  into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'voice deletion operation not found or access denied';
  end if;

  if v_operation.snapshot_status <> 'pending' then
    raise exception 'voice deletion snapshot is already sealed or not runnable';
  end if;

  insert into public.voice_deletion_targets (
    operation_id,
    user_id,
    target_kind,
    source_row_id,
    provider_name,
    provider_resource_id,
    storage_bucket,
    storage_object_key,
    target_fingerprint
  )
  select
    p_operation_id,
    p_user_id,
    target.value ->> 'target_kind',
    nullif(target.value ->> 'source_row_id', '')::uuid,
    nullif(target.value ->> 'provider_name', ''),
    nullif(target.value ->> 'provider_resource_id', ''),
    nullif(target.value ->> 'storage_bucket', ''),
    nullif(target.value ->> 'storage_object_key', ''),
    nullif(target.value ->> 'target_fingerprint', '')
  from jsonb_array_elements(p_targets) as target(value);

  update public.voice_deletion_operations
  set snapshot_status = 'succeeded',
      snapshot_at = now(),
      snapshot_attempt_count = snapshot_attempt_count + 1,
      last_attempted_at = now()
  where id = p_operation_id
    and user_id = p_user_id
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.claim_voice_deletion_operation_lease(
  p_operation_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns public.voice_deletion_operations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation public.voice_deletion_operations;
begin
  if p_lease_token is null or p_lease_seconds < 1 or p_lease_seconds > 900 then
    raise exception 'invalid voice deletion lease request';
  end if;

  update public.voice_deletion_operations
  set lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      runner_attempt_count = runner_attempt_count + 1,
      last_attempted_at = now()
  where id = p_operation_id
    and user_id = p_user_id
    and snapshot_status = 'succeeded'
    and status in ('pending', 'processing', 'partial_failure', 'manual_required')
    and (lease_token is null or lease_expires_at <= now())
  returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.finalize_voice_deletion_operation(
  p_operation_id uuid,
  p_user_id uuid
)
returns public.voice_deletion_operations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation public.voice_deletion_operations;
begin
  select *
  into v_operation
  from public.voice_deletion_operations
  where id = p_operation_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'voice deletion operation not found or access denied';
  end if;

  if v_operation.status = 'completed' then
    raise exception 'voice deletion operation is already completed';
  end if;

  if v_operation.snapshot_status <> 'succeeded'
    or v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')
    or v_operation.post_delete_verification_status <> 'succeeded' then
    raise exception 'voice deletion operation is not ready for completion';
  end if;

  if exists (
    select 1
    from public.voice_deletion_targets
    where operation_id = p_operation_id
      and user_id = p_user_id
      and status <> 'verified_absent'
  ) then
    raise exception 'voice deletion operation has unresolved targets';
  end if;

  perform set_config('app.g5c_voice_deletion_finalizing_operation_id', p_operation_id::text, true);

  update public.voice_deletion_targets
  set source_row_id = null,
      provider_name = null,
      provider_resource_id = null,
      storage_bucket = null,
      storage_object_key = null,
      target_fingerprint = null,
      locator_scrubbed_at = now()
  where operation_id = p_operation_id
    and user_id = p_user_id
    and locator_scrubbed_at is null;

  update public.voice_deletion_operations
  set status = 'completed',
      current_stage = null,
      consent_snapshot_id = null,
      lease_token = null,
      lease_expires_at = null,
      completed_at = now(),
      sensitive_snapshot_scrubbed_at = now(),
      audit_expires_at = now() + interval '90 days'
  where id = p_operation_id
    and user_id = p_user_id
  returning * into v_operation;

  perform set_config('app.g5c_voice_deletion_finalizing_operation_id', '', true);

  return v_operation;
end;
$$;

revoke all on function public.seal_voice_deletion_snapshot(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_voice_deletion_operation_lease(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_voice_deletion_operation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.enforce_voice_deletion_operation_transition() from public, anon, authenticated;
revoke all on function public.enforce_voice_deletion_target_locator_transition() from public, anon, authenticated;
grant execute on function public.seal_voice_deletion_snapshot(uuid, uuid, jsonb) to service_role;
grant execute on function public.claim_voice_deletion_operation_lease(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.finalize_voice_deletion_operation(uuid, uuid) to service_role;
