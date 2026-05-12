create table if not exists public.quota_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  category text not null default 'text_generation_quota',
  status text not null,
  failure_stage text,
  failure_code text,
  billing_status text not null default 'not_evaluated',
  subject_type text not null,
  subject_id uuid,
  target_resource_type text not null default 'none',
  target_resource_id uuid,
  idempotency_key text,
  dedupe_key text,
  request_fingerprint text,
  provider text,
  provider_model text,
  provider_request_id text,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quota_events_event_type_check check (
    event_type in ('script_generation_attempt')
  ),
  constraint quota_events_category_check check (
    category in ('text_generation_quota')
  ),
  constraint quota_events_status_check check (
    status in ('attempted', 'succeeded', 'failed', 'skipped', 'not_billable')
  ),
  constraint quota_events_failure_stage_check check (
    failure_stage is null
    or failure_stage in (
      'provider_selection',
      'provider_config',
      'provider_request',
      'provider_response_parse',
      'pipeline_validation',
      'pipeline_rejected',
      'response_shaping',
      'quota_event_write'
    )
  ),
  constraint quota_events_billing_status_check check (
    billing_status in (
      'not_evaluated',
      'non_billable',
      'billable_candidate',
      'refund_candidate'
    )
  ),
  constraint quota_events_subject_type_check check (
    subject_type in ('script_studio')
  ),
  constraint quota_events_target_resource_type_check check (
    target_resource_type in ('none')
  ),
  constraint quota_events_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint quota_events_completed_after_attempted_check check (
    completed_at is null or completed_at >= attempted_at
  )
);

create trigger set_updated_at_quota_events
  before update on public.quota_events
  for each row
  execute function public.set_updated_at();

create index if not exists quota_events_user_attempted_at_idx
  on public.quota_events (user_id, attempted_at desc);

create index if not exists quota_events_user_event_type_attempted_at_idx
  on public.quota_events (user_id, event_type, attempted_at desc);

create index if not exists quota_events_user_status_attempted_at_idx
  on public.quota_events (user_id, status, attempted_at desc);

create index if not exists quota_events_user_request_fingerprint_idx
  on public.quota_events (user_id, request_fingerprint)
  where request_fingerprint is not null;

create unique index if not exists quota_events_user_dedupe_key_unique_idx
  on public.quota_events (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists quota_events_provider_request_id_idx
  on public.quota_events (provider_request_id)
  where provider_request_id is not null;

alter table public.quota_events enable row level security;

create policy "Users can read their own quota events"
  on public.quota_events
  for select
  to authenticated
  using (auth.uid() = user_id);
