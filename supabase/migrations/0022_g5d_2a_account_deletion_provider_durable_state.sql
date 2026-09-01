-- G5D-2A: account-deletion-specific durable provider authority.
-- This migration does not reuse voice_deletion_operations / voice_deletion_targets,
-- call ElevenLabs, advance Storage/DB/Auth, complete an account deletion, or define
-- retention. Provider locators remain server-only and are scrubbed by the focused
-- provider sub-finalizer after strict verified absence for every sealed target.

alter table public.account_deletion_requests
  add column if not exists provider_snapshot_version text not null default 'g5d-2a.account-provider.v1',
  add column if not exists provider_snapshot_status text not null default 'pending',
  add column if not exists provider_snapshot_seal_version integer not null default 0,
  add column if not exists provider_snapshot_sealed_at timestamptz,
  add column if not exists provider_snapshot_target_count integer not null default 0,
  add column if not exists provider_verified_absent_count integer not null default 0,
  add column if not exists provider_runner_attempt_count integer not null default 0,
  add column if not exists provider_runner_lease_token uuid,
  add column if not exists provider_runner_lease_expires_at timestamptz,
  add column if not exists provider_destructive_started_at timestamptz,
  add column if not exists provider_sub_finalized_at timestamptz,
  add column if not exists provider_locator_scrubbed_at timestamptz;

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_id_user_id_unique;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_id_user_id_unique unique (id, user_id),
  add constraint account_deletion_requests_provider_snapshot_version_check check (
    provider_snapshot_version = 'g5d-2a.account-provider.v1'
  ),
  add constraint account_deletion_requests_provider_snapshot_status_check check (
    provider_snapshot_status in ('pending', 'sealed')
  ),
  add constraint account_deletion_requests_provider_snapshot_counts_check check (
    provider_snapshot_seal_version >= 0
    and provider_snapshot_target_count >= 0
    and provider_verified_absent_count >= 0
    and provider_verified_absent_count <= provider_snapshot_target_count
    and provider_runner_attempt_count >= 0
  ),
  add constraint account_deletion_requests_provider_snapshot_shape_check check (
    (
      provider_snapshot_status = 'pending'
      and provider_snapshot_seal_version = 0
      and provider_snapshot_sealed_at is null
      and provider_snapshot_target_count = 0
      and provider_verified_absent_count = 0
      and provider_destructive_started_at is null
      and provider_sub_finalized_at is null
      and provider_locator_scrubbed_at is null
    )
    or (
      provider_snapshot_status = 'sealed'
      and provider_snapshot_seal_version = 1
      and provider_snapshot_sealed_at is not null
    )
  ),
  add constraint account_deletion_requests_provider_runner_lease_pair_check check (
    (provider_runner_lease_token is null and provider_runner_lease_expires_at is null)
    or (provider_runner_lease_token is not null and provider_runner_lease_expires_at is not null)
  ),
  add constraint account_deletion_requests_provider_sub_finalized_shape_check check (
    provider_sub_finalized_at is null
    or (
      provider_snapshot_status = 'sealed'
      and provider_cleanup_status in ('succeeded', 'not_needed')
      and provider_verified_absent_count = provider_snapshot_target_count
      and provider_locator_scrubbed_at = provider_sub_finalized_at
      and provider_runner_lease_token is null
      and provider_runner_lease_expires_at is null
    )
  );

create table if not exists public.account_deletion_provider_targets (
  id uuid primary key default gen_random_uuid(),
  deletion_request_id uuid not null,
  user_id uuid,
  source_voice_id uuid,
  provider_name text,
  provider_resource_id text,
  target_fingerprint text,
  status text not null default 'pending',
  delete_outcome text not null default 'not_attempted',
  reconciliation_status text not null default 'not_applicable',
  delete_attempt_count integer not null default 0,
  reconciliation_attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_failure_category text,
  last_attempted_at timestamptz,
  delete_succeeded_at timestamptz,
  verified_absent_at timestamptz,
  manual_required_at timestamptz,
  locator_scrubbed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_provider_targets_request_fkey
    foreign key (deletion_request_id)
    references public.account_deletion_requests (id)
    on delete cascade,
  constraint account_deletion_provider_targets_request_owner_fkey
    foreign key (deletion_request_id, user_id)
    references public.account_deletion_requests (id, user_id)
    on update cascade
    on delete cascade,
  constraint account_deletion_provider_targets_status_check check (
    status in ('pending', 'delete_requested', 'deleted', 'verified_absent', 'manual_required')
  ),
  constraint account_deletion_provider_targets_delete_outcome_check check (
    delete_outcome in ('not_attempted', 'succeeded', 'not_found', 'timed_out', 'unavailable', 'rejected')
  ),
  constraint account_deletion_provider_targets_reconciliation_status_check check (
    reconciliation_status in ('not_applicable', 'pending', 'verified_absent', 'present', 'unavailable', 'manual_required')
  ),
  constraint account_deletion_provider_targets_attempt_counts_check check (
    delete_attempt_count in (0, 1) and reconciliation_attempt_count >= 0
  ),
  constraint account_deletion_provider_targets_deleted_requires_success_check check (
    status <> 'deleted' or delete_outcome = 'succeeded'
  ),
  constraint account_deletion_provider_targets_verified_absent_check check (
    status <> 'verified_absent'
    or (
      reconciliation_status = 'verified_absent'
      and verified_absent_at is not null
    )
  ),
  constraint account_deletion_provider_targets_locator_shape_check check (
    (user_id is not null or locator_scrubbed_at is not null)
    and (
      locator_scrubbed_at is not null
      or (
        source_voice_id is not null
        and provider_name = 'elevenlabs'
        and provider_resource_id is not null
        and btrim(provider_resource_id) <> ''
        and char_length(provider_resource_id) <= 128
        and provider_resource_id ~ '^[A-Za-z0-9_-]+$'
        and target_fingerprint is not null
        and btrim(target_fingerprint) <> ''
      )
    )
  ),
  constraint account_deletion_provider_targets_scrubbed_locator_check check (
    locator_scrubbed_at is null
    or (
      status = 'verified_absent'
      and source_voice_id is null
      and provider_name is null
      and provider_resource_id is null
      and target_fingerprint is null
    )
  )
);

comment on table public.account_deletion_provider_targets is
  'Server-only account-deletion provider target authority. It must not be exposed through direct client table access or hold raw provider responses, credentials, Storage locators, audio, or signed URLs.';

comment on column public.account_deletion_provider_targets.provider_resource_id is
  'Internal sealed provider locator. Never return it to clients, operator output, or proof artifacts; scrub it only in the provider sub-finalizer.';

drop trigger if exists set_updated_at_account_deletion_provider_targets on public.account_deletion_provider_targets;
create trigger set_updated_at_account_deletion_provider_targets
  before update on public.account_deletion_provider_targets
  for each row
  execute function public.set_updated_at();

create unique index if not exists account_deletion_provider_targets_request_voice_unique_idx
  on public.account_deletion_provider_targets (deletion_request_id, source_voice_id)
  where source_voice_id is not null;

create unique index if not exists account_deletion_provider_targets_request_fingerprint_unique_idx
  on public.account_deletion_provider_targets (deletion_request_id, target_fingerprint)
  where target_fingerprint is not null;

create unique index if not exists account_deletion_provider_targets_request_locator_unique_idx
  on public.account_deletion_provider_targets (deletion_request_id, provider_name, provider_resource_id)
  where provider_name is not null and provider_resource_id is not null;

create index if not exists account_deletion_provider_targets_request_status_idx
  on public.account_deletion_provider_targets (deletion_request_id, status);

create index if not exists account_deletion_provider_targets_request_retry_idx
  on public.account_deletion_provider_targets (deletion_request_id, next_retry_at)
  where next_retry_at is not null;

create index if not exists account_deletion_requests_provider_runner_lease_idx
  on public.account_deletion_requests (provider_runner_lease_expires_at)
  where provider_runner_lease_token is not null;

alter table public.account_deletion_provider_targets enable row level security;
revoke all privileges on table public.account_deletion_provider_targets from public, anon, authenticated, service_role;
grant select on table public.account_deletion_provider_targets to service_role;

create or replace function public.enforce_account_deletion_provider_parent_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mutation text := current_setting('native_minute.account_deletion_provider_mutation', true);
  v_provider_status_changed boolean;
  v_snapshot_changed boolean;
  v_lease_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.provider_cleanup_status in ('succeeded', 'not_needed') then
      raise exception using errcode = 'check_violation', message = 'account deletion provider terminal status is forbidden on insert';
    end if;

    return new;
  end if;

  v_provider_status_changed := new.provider_cleanup_status is distinct from old.provider_cleanup_status;
  v_snapshot_changed := new.provider_snapshot_status is distinct from old.provider_snapshot_status
    or new.provider_snapshot_version is distinct from old.provider_snapshot_version
    or new.provider_snapshot_seal_version is distinct from old.provider_snapshot_seal_version
    or new.provider_snapshot_sealed_at is distinct from old.provider_snapshot_sealed_at
    or new.provider_snapshot_target_count is distinct from old.provider_snapshot_target_count;
  v_lease_changed := new.provider_runner_attempt_count is distinct from old.provider_runner_attempt_count
    or new.provider_runner_lease_token is distinct from old.provider_runner_lease_token
    or new.provider_runner_lease_expires_at is distinct from old.provider_runner_lease_expires_at;

  if v_provider_status_changed
    and new.provider_cleanup_status in ('succeeded', 'not_needed')
    and v_mutation is distinct from 'finalize' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider terminal status requires focused finalization';
  end if;

  if v_snapshot_changed and v_mutation is distinct from 'seal' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider snapshot requires focused authority';
  end if;

  if v_lease_changed
    and (v_mutation is null or v_mutation not in ('claim_lease', 'release_lease', 'finalize')) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider lease requires focused authority';
  end if;

  if new.provider_destructive_started_at is distinct from old.provider_destructive_started_at
    and v_mutation is distinct from 'begin_delete' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider destructive marker requires focused authority';
  end if;

  if new.provider_verified_absent_count is distinct from old.provider_verified_absent_count
    and (v_mutation is null or v_mutation not in ('record_reconciliation', 'finalize')) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider verified count requires focused authority';
  end if;

  if (
    new.provider_sub_finalized_at is distinct from old.provider_sub_finalized_at
    or new.provider_locator_scrubbed_at is distinct from old.provider_locator_scrubbed_at
  ) and v_mutation is distinct from 'finalize' then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider finalization requires focused authority';
  end if;

  if v_provider_status_changed
    and (old.provider_snapshot_status = 'sealed' or new.provider_snapshot_status = 'sealed')
    and (
      v_mutation is null
      or v_mutation not in (
        'seal', 'begin_delete', 'record_delete', 'begin_reconciliation', 'record_reconciliation', 'finalize'
      )
    ) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider status requires focused authority';
  end if;

  if old.provider_snapshot_status = 'sealed'
    and v_snapshot_changed then
    raise exception using errcode = 'check_violation', message = 'account deletion provider snapshot is immutable';
  end if;

  if old.provider_snapshot_status = 'sealed'
    and old.provider_cleanup_status = 'manual_required'
    and v_provider_status_changed then
    raise exception using errcode = 'check_violation', message = 'account deletion provider manual state is sticky';
  end if;

  if old.provider_destructive_started_at is not null
    and new.provider_destructive_started_at is distinct from old.provider_destructive_started_at then
    raise exception using errcode = 'check_violation', message = 'account deletion provider destructive marker is monotonic';
  end if;

  if old.provider_sub_finalized_at is not null
    and (
      new.provider_cleanup_status is distinct from old.provider_cleanup_status
      or new.provider_verified_absent_count is distinct from old.provider_verified_absent_count
      or new.provider_sub_finalized_at is distinct from old.provider_sub_finalized_at
      or new.provider_locator_scrubbed_at is distinct from old.provider_locator_scrubbed_at
      or new.provider_runner_lease_token is not null
      or new.provider_runner_lease_expires_at is not null
    ) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider sub-finalization is immutable';
  end if;

  if new.provider_snapshot_status = 'sealed'
    and new.provider_cleanup_status in ('succeeded', 'not_needed')
    and new.provider_sub_finalized_at is null then
    raise exception using errcode = 'check_violation', message = 'account deletion provider terminal status requires focused finalization';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_account_deletion_provider_target_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mutation text := current_setting('native_minute.account_deletion_provider_mutation', true);
  v_locator_changed boolean;
begin
  if new.deletion_request_id is distinct from old.deletion_request_id then
    raise exception using errcode = 'check_violation', message = 'account deletion provider target ownership is immutable';
  end if;

  if new.user_id is distinct from old.user_id
    and not (old.locator_scrubbed_at is not null and new.user_id is null) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider target ownership is immutable';
  end if;

  v_locator_changed := new.source_voice_id is distinct from old.source_voice_id
    or new.provider_name is distinct from old.provider_name
    or new.provider_resource_id is distinct from old.provider_resource_id
    or new.target_fingerprint is distinct from old.target_fingerprint;

  if new.delete_attempt_count is distinct from old.delete_attempt_count
    and not (
      v_mutation = 'begin_delete'
      and old.delete_attempt_count = 0
      and new.delete_attempt_count = 1
    ) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion provider DELETE generation requires focused begin authority';
  end if;

  if old.status = 'manual_required'
    and (
      new.status is distinct from old.status
      or new.reconciliation_status is distinct from old.reconciliation_status
      or new.manual_required_at is distinct from old.manual_required_at
      or v_locator_changed
    ) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider target manual state is sticky';
  end if;

  if old.locator_scrubbed_at is not null then
    if v_locator_changed
      or new.locator_scrubbed_at is distinct from old.locator_scrubbed_at
      or new.status is distinct from old.status
      or new.delete_outcome is distinct from old.delete_outcome
      or new.reconciliation_status is distinct from old.reconciliation_status
      or new.delete_attempt_count is distinct from old.delete_attempt_count
      or new.reconciliation_attempt_count is distinct from old.reconciliation_attempt_count
      or new.next_retry_at is distinct from old.next_retry_at
      or new.last_failure_category is distinct from old.last_failure_category
      or new.last_attempted_at is distinct from old.last_attempted_at
      or new.delete_succeeded_at is distinct from old.delete_succeeded_at
      or new.verified_absent_at is distinct from old.verified_absent_at
      or new.manual_required_at is distinct from old.manual_required_at then
      raise exception using errcode = 'check_violation', message = 'finalized account deletion provider targets are immutable';
    end if;
    return new;
  end if;

  if v_locator_changed
    and (
      new.status <> 'verified_absent'
      or new.source_voice_id is not null
      or new.provider_name is not null
      or new.provider_resource_id is not null
      or new.target_fingerprint is not null
      or new.locator_scrubbed_at is null
    ) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider locators can only transition to scrubbed';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_account_deletion_provider_parent_immutability on public.account_deletion_requests;
create trigger enforce_account_deletion_provider_parent_immutability
  before insert or update on public.account_deletion_requests
  for each row
  execute function public.enforce_account_deletion_provider_parent_immutability();

drop trigger if exists enforce_account_deletion_provider_target_immutability on public.account_deletion_provider_targets;
create trigger enforce_account_deletion_provider_target_immutability
  before update on public.account_deletion_provider_targets
  for each row
  execute function public.enforce_account_deletion_provider_target_immutability();

create or replace function public.seal_account_deletion_provider_snapshot(
  p_deletion_request_id uuid,
  p_expected_user_id uuid
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_target_count integer;
begin
  if p_deletion_request_id is null or p_expected_user_id is null then
    raise exception using errcode = 'invalid_parameter_value', message = 'account deletion provider seal identity is required';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(p_expected_user_id);

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id
    and user_id = p_expected_user_id
  for update;

  if not found
    or v_request.status not in ('confirmed', 'provider_cleanup_failed')
    or v_request.provider_cleanup_status not in ('pending', 'failed') then
    raise exception using errcode = 'check_violation', message = 'account deletion provider request is stale or not runnable';
  end if;

  if v_request.provider_snapshot_status <> 'pending'
    or v_request.provider_snapshot_seal_version <> 0
    or v_request.provider_snapshot_sealed_at is not null
    or v_request.provider_destructive_started_at is not null
    or exists (
      select 1 from public.account_deletion_provider_targets
      where deletion_request_id = p_deletion_request_id
    ) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider reseal conflict';
  end if;

  if exists (
    select 1 from public.voice_asset_write_intents
    where user_id = p_expected_user_id and status in ('reserved', 'manual_required')
  ) then
    raise exception using errcode = 'object_in_use', message = 'account deletion provider seal blocked by writer intent';
  end if;

  lock table public.voices in share row exclusive mode;

  if exists (
    select 1
    from public.voices as voice
    where voice.user_id = p_expected_user_id
      and voice.provider = 'elevenlabs'
      and (
        voice.provider_voice_id is null
        or btrim(voice.provider_voice_id) = ''
        or char_length(btrim(voice.provider_voice_id)) > 128
        or btrim(voice.provider_voice_id) !~ '^[A-Za-z0-9_-]+$'
      )
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider target missing or invalid';
  end if;

  if exists (
    select 1
    from public.voices as owned_voice
    join public.voices as other_voice
      on other_voice.provider = 'elevenlabs'
      and btrim(other_voice.provider_voice_id) = btrim(owned_voice.provider_voice_id)
      and other_voice.id <> owned_voice.id
    where owned_voice.user_id = p_expected_user_id
      and owned_voice.provider = 'elevenlabs'
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion provider target duplicate or cross-user locator';
  end if;

  insert into public.account_deletion_provider_targets (
    deletion_request_id,
    user_id,
    source_voice_id,
    provider_name,
    provider_resource_id,
    target_fingerprint
  )
  select
    p_deletion_request_id,
    p_expected_user_id,
    voice.id,
    'elevenlabs',
    btrim(voice.provider_voice_id),
    encode(extensions.digest('elevenlabs:' || btrim(voice.provider_voice_id), 'sha256'), 'hex')
  from public.voices as voice
  where voice.user_id = p_expected_user_id
    and voice.provider = 'elevenlabs'
  order by voice.created_at, voice.id;

  get diagnostics v_target_count = row_count;

  if v_target_count <> (
    select count(*)::integer from public.voices
    where user_id = p_expected_user_id and provider = 'elevenlabs'
  ) then
    raise exception using errcode = 'serialization_failure', message = 'account deletion provider target universe changed';
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'seal', true);

  update public.account_deletion_requests
  set provider_snapshot_status = 'sealed',
      provider_snapshot_seal_version = 1,
      provider_snapshot_sealed_at = now(),
      provider_snapshot_target_count = v_target_count,
      provider_verified_absent_count = 0,
      provider_cleanup_status = 'pending',
      failure_stage = null,
      failure_reason_code = null,
      last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id
  returning * into v_request;

  return v_request;
end;
$$;

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
    and status in ('confirmed', 'provider_cleanup_failed')
    and provider_snapshot_status = 'sealed'
    and provider_cleanup_status in ('pending', 'failed')
    and provider_sub_finalized_at is null
    and (provider_runner_lease_token is null or provider_runner_lease_expires_at <= now())
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.release_account_deletion_provider_lease(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_lease_token uuid
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
begin
  if p_lease_token is null then
    raise exception using errcode = 'invalid_parameter_value', message = 'account deletion provider lease token is required';
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'release_lease', true);

  update public.account_deletion_requests
  set provider_runner_lease_token = null,
      provider_runner_lease_expires_at = null
  where id = p_deletion_request_id
    and user_id = p_expected_user_id
    and provider_runner_lease_token = p_lease_token
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.begin_account_deletion_provider_delete_attempt(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_delete_attempt_count integer
)
returns public.account_deletion_provider_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_target public.account_deletion_provider_targets;
begin
  if p_target_id is null or p_lease_token is null
    or p_expected_runner_attempt_count is null or p_expected_runner_attempt_count < 1
    or p_expected_delete_attempt_count is null or p_expected_delete_attempt_count < 0 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider delete attempt';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id and user_id = p_expected_user_id
  for update;

  if not found
    or v_request.status not in ('confirmed', 'provider_cleanup_failed')
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_cleanup_status not in ('pending', 'failed')
    or v_request.provider_sub_finalized_at is not null
    or v_request.provider_runner_lease_token is distinct from p_lease_token
    or v_request.provider_runner_lease_expires_at is null
    or v_request.provider_runner_lease_expires_at <= now()
    or v_request.provider_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  select * into v_target
  from public.account_deletion_provider_targets
  where id = p_target_id
    and deletion_request_id = p_deletion_request_id
    and user_id = p_expected_user_id
  for update;

  if not found
    or v_target.provider_name <> 'elevenlabs'
    or v_target.provider_resource_id is null
    or p_expected_delete_attempt_count <> 0
    or v_target.delete_attempt_count <> 0
    or (v_target.next_retry_at is not null and v_target.next_retry_at > now())
    or v_target.status <> 'pending'
    or v_target.delete_outcome <> 'not_attempted'
    or v_target.reconciliation_status <> 'not_applicable' then
    return null;
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'begin_delete', true);

  update public.account_deletion_provider_targets
  set status = 'delete_requested',
      delete_outcome = 'not_attempted',
      reconciliation_status = 'pending',
      delete_attempt_count = 1,
      next_retry_at = null,
      last_failure_category = null,
      last_attempted_at = now()
  where id = p_target_id
  returning * into v_target;

  update public.account_deletion_requests
  set status = 'confirmed',
      provider_cleanup_status = 'pending',
      provider_destructive_started_at = coalesce(provider_destructive_started_at, now()),
      failure_stage = null,
      failure_reason_code = null,
      last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id;

  return v_target;
end;
$$;

create or replace function public.record_account_deletion_provider_delete_result(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_delete_attempt_count integer,
  p_result text,
  p_retry_delay_seconds integer
)
returns public.account_deletion_provider_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_target public.account_deletion_provider_targets;
  v_is_manual boolean;
  v_is_transient boolean;
  v_delete_outcome text;
begin
  if p_target_id is null or p_lease_token is null
    or p_expected_runner_attempt_count is null or p_expected_runner_attempt_count < 1
    or p_expected_delete_attempt_count is distinct from 1
    or p_result is null
    or p_result not in (
      'deleted', 'not_found', 'credential_missing', 'invalid_provider_reference', 'auth_failed',
      'permission_denied', 'rate_limited', 'provider_unavailable', 'timeout', 'network_error',
      'provider_rejected', 'protocol_error'
    )
    or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider delete result';
  end if;

  v_is_manual := p_result in ('credential_missing', 'invalid_provider_reference', 'auth_failed', 'permission_denied');
  v_is_transient := p_result in ('rate_limited', 'provider_unavailable', 'timeout', 'network_error', 'protocol_error');

  if (v_is_transient and p_retry_delay_seconds < 1)
    or (not v_is_transient and p_retry_delay_seconds <> 0) then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider post-DELETE reconciliation delay';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id and user_id = p_expected_user_id
  for update;

  if not found
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_cleanup_status not in ('pending', 'failed')
    or v_request.provider_sub_finalized_at is not null
    or v_request.provider_runner_lease_token is distinct from p_lease_token
    or v_request.provider_runner_lease_expires_at is null
    or v_request.provider_runner_lease_expires_at <= now()
    or v_request.provider_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  select * into v_target
  from public.account_deletion_provider_targets
  where id = p_target_id
    and deletion_request_id = p_deletion_request_id
    and user_id = p_expected_user_id
  for update;

  if not found
    or v_target.status <> 'delete_requested'
    or v_target.reconciliation_status <> 'pending'
    or v_target.delete_attempt_count <> p_expected_delete_attempt_count then
    return null;
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'record_delete', true);

  if p_result = 'deleted' then
    update public.account_deletion_provider_targets
    set status = 'deleted',
        delete_outcome = 'succeeded',
        reconciliation_status = 'pending',
        next_retry_at = null,
        delete_succeeded_at = coalesce(delete_succeeded_at, now()),
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'confirmed', provider_cleanup_status = 'pending',
        failure_stage = null, failure_reason_code = null
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  elsif p_result = 'not_found' then
    update public.account_deletion_provider_targets
    set delete_outcome = 'not_found', reconciliation_status = 'pending',
        next_retry_at = null, last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'confirmed', provider_cleanup_status = 'pending',
        failure_stage = null, failure_reason_code = null
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  elsif p_result = 'provider_rejected' then
    update public.account_deletion_provider_targets
    set status = 'delete_requested', delete_outcome = 'rejected',
        reconciliation_status = 'pending', next_retry_at = null,
        last_failure_category = 'provider_rejected'
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'provider_cleanup_failed', provider_cleanup_status = 'failed',
        failure_stage = 'provider_cleanup', failure_reason_code = 'provider_rejected'
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  elsif v_is_manual then
    update public.account_deletion_provider_targets
    set status = 'manual_required', delete_outcome = 'rejected',
        reconciliation_status = 'manual_required', next_retry_at = null,
        last_failure_category = p_result,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'provider_cleanup_failed', provider_cleanup_status = 'manual_required',
        failure_stage = 'provider_cleanup', failure_reason_code = p_result,
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  else
    v_delete_outcome := case
      when p_result = 'timeout' then 'timed_out'
      when p_result = 'protocol_error' then 'rejected'
      else 'unavailable'
    end;

    update public.account_deletion_provider_targets
    set status = 'delete_requested', delete_outcome = v_delete_outcome,
        reconciliation_status = 'unavailable',
        next_retry_at = now() + make_interval(secs => p_retry_delay_seconds),
        last_failure_category = p_result
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'provider_cleanup_failed', provider_cleanup_status = 'failed',
        failure_stage = 'provider_cleanup', failure_reason_code = p_result,
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  end if;

  return v_target;
end;
$$;

create or replace function public.begin_account_deletion_provider_reconciliation_attempt(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_reconciliation_attempt_count integer
)
returns public.account_deletion_provider_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_target public.account_deletion_provider_targets;
begin
  if p_target_id is null or p_lease_token is null
    or p_expected_runner_attempt_count is null or p_expected_runner_attempt_count < 1
    or p_expected_reconciliation_attempt_count is null or p_expected_reconciliation_attempt_count < 0 then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider reconciliation attempt';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id and user_id = p_expected_user_id
  for update;

  if not found
    or v_request.status not in ('confirmed', 'provider_cleanup_failed')
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_cleanup_status not in ('pending', 'failed')
    or v_request.provider_sub_finalized_at is not null
    or v_request.provider_runner_lease_token is distinct from p_lease_token
    or v_request.provider_runner_lease_expires_at is null
    or v_request.provider_runner_lease_expires_at <= now()
    or v_request.provider_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  select * into v_target
  from public.account_deletion_provider_targets
  where id = p_target_id
    and deletion_request_id = p_deletion_request_id
    and user_id = p_expected_user_id
  for update;

  if not found
    or v_target.provider_name <> 'elevenlabs'
    or v_target.provider_resource_id is null
    or v_target.delete_attempt_count <> 1
    or v_target.reconciliation_attempt_count <> p_expected_reconciliation_attempt_count
    or (v_target.next_retry_at is not null and v_target.next_retry_at > now())
    or not (
      v_target.status in ('delete_requested', 'deleted')
      and v_target.reconciliation_status in ('pending', 'unavailable')
    ) then
    return null;
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'begin_reconciliation', true);

  if v_target.reconciliation_attempt_count >= 5 then
    update public.account_deletion_provider_targets
    set status = 'manual_required', reconciliation_status = 'manual_required',
        next_retry_at = null, last_failure_category = 'retry_budget_exhausted',
        manual_required_at = coalesce(manual_required_at, now()), last_attempted_at = now()
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'provider_cleanup_failed', provider_cleanup_status = 'manual_required',
        failure_stage = 'provider_cleanup', failure_reason_code = 'provider_reconciliation_retry_budget_exhausted',
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;

    return v_target;
  end if;

  update public.account_deletion_provider_targets
  set reconciliation_status = 'pending',
      reconciliation_attempt_count = reconciliation_attempt_count + 1,
      next_retry_at = null,
      last_attempted_at = now()
  where id = p_target_id
  returning * into v_target;

  update public.account_deletion_requests
  set status = 'confirmed', provider_cleanup_status = 'pending',
      failure_stage = null, failure_reason_code = null, last_attempted_at = now()
  where id = p_deletion_request_id and user_id = p_expected_user_id;

  return v_target;
end;
$$;

create or replace function public.record_account_deletion_provider_reconciliation_result(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_target_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer,
  p_expected_reconciliation_attempt_count integer,
  p_result text,
  p_owner_signal text,
  p_retry_delay_seconds integer
)
returns public.account_deletion_provider_targets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_target public.account_deletion_provider_targets;
  v_is_manual boolean;
  v_is_transient boolean;
begin
  if p_target_id is null or p_lease_token is null
    or p_expected_runner_attempt_count is null or p_expected_runner_attempt_count < 1
    or p_expected_reconciliation_attempt_count is null or p_expected_reconciliation_attempt_count < 1
    or p_result is null
    or p_result not in (
      'present', 'verified_absent', 'credential_missing', 'invalid_provider_reference', 'auth_failed',
      'permission_denied', 'rate_limited', 'provider_unavailable', 'timeout', 'network_error',
      'provider_rejected', 'protocol_error'
    )
    or p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 300
    or (p_result = 'present' and (p_owner_signal is null or p_owner_signal not in ('true', 'false', 'unknown')))
    or (p_result <> 'present' and p_owner_signal is not null) then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider reconciliation result';
  end if;

  v_is_manual := p_result in ('credential_missing', 'invalid_provider_reference', 'auth_failed', 'permission_denied', 'provider_rejected');
  v_is_transient := p_result in ('rate_limited', 'provider_unavailable', 'timeout', 'network_error', 'protocol_error');

  if (v_is_transient and p_retry_delay_seconds < 1)
    or (not v_is_transient and p_retry_delay_seconds <> 0) then
    raise exception using errcode = 'invalid_parameter_value', message = 'invalid account deletion provider reconciliation retry delay';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id and user_id = p_expected_user_id
  for update;

  if not found
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_cleanup_status not in ('pending', 'failed')
    or v_request.provider_sub_finalized_at is not null
    or v_request.provider_runner_lease_token is distinct from p_lease_token
    or v_request.provider_runner_lease_expires_at is null
    or v_request.provider_runner_lease_expires_at <= now()
    or v_request.provider_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  select * into v_target
  from public.account_deletion_provider_targets
  where id = p_target_id
    and deletion_request_id = p_deletion_request_id
    and user_id = p_expected_user_id
  for update;

  if not found
    or v_target.status not in ('delete_requested', 'deleted')
    or v_target.delete_attempt_count <> 1
    or v_target.reconciliation_status <> 'pending'
    or v_target.reconciliation_attempt_count <> p_expected_reconciliation_attempt_count then
    return null;
  end if;

  perform set_config('native_minute.account_deletion_provider_mutation', 'record_reconciliation', true);

  if p_result = 'verified_absent' then
    update public.account_deletion_provider_targets
    set status = 'verified_absent', reconciliation_status = 'verified_absent',
        next_retry_at = null, verified_absent_at = coalesce(verified_absent_at, now()),
        last_failure_category = null
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'confirmed', provider_cleanup_status = 'pending',
        provider_verified_absent_count = (
          select count(*) from public.account_deletion_provider_targets
          where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
            and status = 'verified_absent'
        ),
        failure_stage = null, failure_reason_code = null
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  elsif p_result = 'present' or v_is_manual then
    update public.account_deletion_provider_targets
    set status = 'manual_required', reconciliation_status = 'manual_required',
        next_retry_at = null,
        last_failure_category = case when p_result = 'present' then 'provider_resource_present' else p_result end,
        manual_required_at = coalesce(manual_required_at, now())
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'provider_cleanup_failed', provider_cleanup_status = 'manual_required',
        failure_stage = 'provider_cleanup',
        failure_reason_code = case when p_result = 'present' then 'provider_resource_present_manual_required' else p_result end,
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  else
    update public.account_deletion_provider_targets
    set reconciliation_status = 'unavailable',
        next_retry_at = now() + make_interval(secs => p_retry_delay_seconds),
        last_failure_category = case
          when v_target.last_failure_category = 'provider_rejected' then 'provider_rejected'
          else p_result
        end
    where id = p_target_id
    returning * into v_target;

    update public.account_deletion_requests
    set status = 'provider_cleanup_failed', provider_cleanup_status = 'failed',
        failure_stage = 'provider_cleanup', failure_reason_code = p_result,
        last_attempted_at = now()
    where id = p_deletion_request_id and user_id = p_expected_user_id;
  end if;

  return v_target;
end;
$$;

create or replace function public.finalize_account_deletion_provider_stage(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_lease_token uuid,
  p_expected_runner_attempt_count integer
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_finalized_at timestamptz;
  v_target_count integer;
  v_verified_count integer;
begin
  select * into v_request
  from public.account_deletion_requests
  where id = p_deletion_request_id and user_id = p_expected_user_id
  for update;

  if not found
    or p_lease_token is null
    or p_expected_runner_attempt_count is null or p_expected_runner_attempt_count < 1
    or v_request.status not in ('confirmed', 'provider_cleanup_failed')
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_cleanup_status not in ('pending', 'failed')
    or v_request.provider_sub_finalized_at is not null
    or v_request.provider_runner_lease_token is distinct from p_lease_token
    or v_request.provider_runner_lease_expires_at is null
    or v_request.provider_runner_lease_expires_at <= now()
    or v_request.provider_runner_attempt_count <> p_expected_runner_attempt_count then
    return null;
  end if;

  select count(*), count(*) filter (where status = 'verified_absent')
  into v_target_count, v_verified_count
  from public.account_deletion_provider_targets
  where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id;

  if v_target_count <> v_request.provider_snapshot_target_count
    or v_verified_count <> v_target_count
    or exists (
      select 1 from public.account_deletion_provider_targets
      where deletion_request_id = p_deletion_request_id and user_id = p_expected_user_id
        and (
          status <> 'verified_absent'
          or reconciliation_status <> 'verified_absent'
          or locator_scrubbed_at is not null
        )
    ) then
    return null;
  end if;

  v_finalized_at := now();

  perform set_config('native_minute.account_deletion_provider_mutation', 'finalize', true);

  update public.account_deletion_provider_targets
  set source_voice_id = null,
      provider_name = null,
      provider_resource_id = null,
      target_fingerprint = null,
      locator_scrubbed_at = v_finalized_at
  where deletion_request_id = p_deletion_request_id
    and user_id = p_expected_user_id;

  update public.account_deletion_requests
  set status = 'confirmed',
      provider_cleanup_status = case when v_target_count = 0 then 'not_needed' else 'succeeded' end,
      provider_verified_absent_count = v_verified_count,
      failure_stage = null,
      failure_reason_code = null,
      provider_runner_lease_token = null,
      provider_runner_lease_expires_at = null,
      provider_sub_finalized_at = v_finalized_at,
      provider_locator_scrubbed_at = v_finalized_at,
      last_attempted_at = v_finalized_at
  where id = p_deletion_request_id and user_id = p_expected_user_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.seal_account_deletion_provider_snapshot(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_account_deletion_provider_lease(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.release_account_deletion_provider_lease(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.begin_account_deletion_provider_delete_attempt(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_provider_delete_result(uuid, uuid, uuid, uuid, integer, integer, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.begin_account_deletion_provider_reconciliation_attempt(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_provider_reconciliation_result(uuid, uuid, uuid, uuid, integer, integer, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.finalize_account_deletion_provider_stage(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_provider_parent_immutability() from public, anon, authenticated, service_role;
revoke all on function public.enforce_account_deletion_provider_target_immutability() from public, anon, authenticated, service_role;

grant execute on function public.seal_account_deletion_provider_snapshot(uuid, uuid) to service_role;
grant execute on function public.claim_account_deletion_provider_lease(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.release_account_deletion_provider_lease(uuid, uuid, uuid) to service_role;
grant execute on function public.begin_account_deletion_provider_delete_attempt(uuid, uuid, uuid, uuid, integer, integer) to service_role;
grant execute on function public.record_account_deletion_provider_delete_result(uuid, uuid, uuid, uuid, integer, integer, text, integer) to service_role;
grant execute on function public.begin_account_deletion_provider_reconciliation_attempt(uuid, uuid, uuid, uuid, integer, integer) to service_role;
grant execute on function public.record_account_deletion_provider_reconciliation_result(uuid, uuid, uuid, uuid, integer, integer, text, text, integer) to service_role;
grant execute on function public.finalize_account_deletion_provider_stage(uuid, uuid, uuid, integer) to service_role;
