create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  anonymized_user_ref text not null default ('adr_' || encode(gen_random_bytes(16), 'hex')),
  request_source text not null default 'in_app',
  status text not null default 'requested',
  failure_stage text,
  failure_reason_code text,
  provider_cleanup_status text not null default 'pending',
  storage_cleanup_status text not null default 'pending',
  db_cleanup_status text not null default 'pending',
  auth_cleanup_status text not null default 'pending',
  notification_status text not null default 'pending',
  retry_count integer not null default 0,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  last_attempted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_requests_request_source_check check (
    request_source in ('in_app', 'support_web', 'admin')
  ),
  constraint account_deletion_requests_status_check check (
    status in (
      'requested',
      'confirmed',
      'processing',
      'provider_cleanup_failed',
      'storage_cleanup_failed',
      'db_cleanup_failed',
      'auth_cleanup_failed',
      'completed',
      'cancelled',
      'expired'
    )
  ),
  constraint account_deletion_requests_failure_stage_check check (
    failure_stage is null
    or failure_stage in (
      'provider_cleanup',
      'storage_cleanup',
      'db_cleanup',
      'auth_cleanup',
      'notification'
    )
  ),
  constraint account_deletion_requests_provider_cleanup_status_check check (
    provider_cleanup_status in ('pending', 'not_needed', 'succeeded', 'failed', 'manual_required')
  ),
  constraint account_deletion_requests_storage_cleanup_status_check check (
    storage_cleanup_status in ('pending', 'not_needed', 'succeeded', 'failed', 'manual_required')
  ),
  constraint account_deletion_requests_db_cleanup_status_check check (
    db_cleanup_status in ('pending', 'not_needed', 'succeeded', 'failed', 'manual_required')
  ),
  constraint account_deletion_requests_auth_cleanup_status_check check (
    auth_cleanup_status in ('pending', 'not_needed', 'succeeded', 'failed', 'manual_required')
  ),
  constraint account_deletion_requests_notification_status_check check (
    notification_status in ('pending', 'not_needed', 'succeeded', 'failed', 'manual_required')
  ),
  constraint account_deletion_requests_retry_count_check check (retry_count >= 0),
  constraint account_deletion_requests_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint account_deletion_requests_confirmed_after_requested_check check (
    confirmed_at is null or confirmed_at >= requested_at
  ),
  constraint account_deletion_requests_processing_after_requested_check check (
    processing_started_at is null or processing_started_at >= requested_at
  ),
  constraint account_deletion_requests_completed_after_requested_check check (
    completed_at is null or completed_at >= requested_at
  ),
  constraint account_deletion_requests_cancelled_after_requested_check check (
    cancelled_at is null or cancelled_at >= requested_at
  )
);

comment on table public.account_deletion_requests is
  'Request-based account deletion state. Creation and deletion execution are handled server-side; this table must not store raw audio, raw script/transcript text, raw provider responses, signed URLs, secrets, auth headers, or email addresses.';

comment on column public.account_deletion_requests.anonymized_user_ref is
  'Opaque non-reversible reference for short-term support/audit tracking after auth user deletion.';

comment on column public.account_deletion_requests.metadata is
  'Allowlist-only operational metadata such as app version, locale, safe failure code, support ticket id, and cleanup counts. Do not store raw content, storage object paths, provider payloads, signed URLs, secrets, or email.';

drop trigger if exists set_updated_at_account_deletion_requests on public.account_deletion_requests;
create trigger set_updated_at_account_deletion_requests
  before update on public.account_deletion_requests
  for each row
  execute function public.set_updated_at();

create index if not exists account_deletion_requests_user_id_requested_at_idx
  on public.account_deletion_requests (user_id, requested_at desc)
  where user_id is not null;

create index if not exists account_deletion_requests_anonymized_user_ref_idx
  on public.account_deletion_requests (anonymized_user_ref);

create index if not exists account_deletion_requests_status_requested_at_idx
  on public.account_deletion_requests (status, requested_at desc);

create index if not exists account_deletion_requests_status_last_attempted_at_idx
  on public.account_deletion_requests (status, last_attempted_at)
  where last_attempted_at is not null;

create unique index if not exists account_deletion_requests_user_active_unique_idx
  on public.account_deletion_requests (user_id)
  where user_id is not null
    and status in (
      'requested',
      'confirmed',
      'processing',
      'provider_cleanup_failed',
      'storage_cleanup_failed',
      'db_cleanup_failed',
      'auth_cleanup_failed'
    );

alter table public.account_deletion_requests enable row level security;

drop policy if exists "account_deletion_requests_select_own" on public.account_deletion_requests;
create policy "account_deletion_requests_select_own"
  on public.account_deletion_requests
  for select
  to authenticated
  using (auth.uid() = user_id);
