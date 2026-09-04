\set ON_ERROR_STOP on

\if :{?g5d_five_stage_bootstrap}

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean not null default false,
  avif_autodetection boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  user_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(p_name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(p_name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

\else

\if :{?g5d_five_stage_fixture}

create schema if not exists g5d_five_stage_proof;
revoke all on schema g5d_five_stage_proof from public;

create table g5d_five_stage_proof.fixtures (
  scenario_slug text primary key,
  user_id uuid not null unique,
  request_id uuid not null unique,
  auth_delete_calls integer not null default 0 check (auth_delete_calls between 0 and 1)
);

revoke all on all tables in schema g5d_five_stage_proof from public, anon, authenticated, service_role;

insert into auth.users(id, email, created_at, updated_at)
values
  ('71000000-0000-4000-8000-000000000001', 'nm-sensitive-h@example.invalid', now(), now()),
  ('71000000-0000-4000-8000-000000000002', 'nm-sensitive-r@example.invalid', now(), now()),
  ('71000000-0000-4000-8000-000000000003', 'nm-sensitive-m@example.invalid', now(), now());

insert into public.voice_consents(id, user_id, provider, metadata)
values
  ('74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'elevenlabs', '{}'::jsonb),
  ('74000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'elevenlabs', '{}'::jsonb),
  ('74000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', 'elevenlabs', '{}'::jsonb);

insert into public.voices(
  id, user_id, provider, provider_voice_id, label, sample_audio_path, consent_id
)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'elevenlabs',
    'nm_sensitive_provider_h',
    'proof voice h',
    'storage://voice-samples/71000000-0000-4000-8000-000000000001/nm-sensitive-storage-h.wav',
    '74000000-0000-4000-8000-000000000001'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'elevenlabs',
    'nm_sensitive_provider_r',
    'proof voice r',
    'storage://voice-samples/71000000-0000-4000-8000-000000000002/nm-sensitive-storage-r.wav',
    '74000000-0000-4000-8000-000000000002'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000003',
    'elevenlabs',
    'nm_sensitive_provider_m',
    'proof voice m',
    'storage://voice-samples/71000000-0000-4000-8000-000000000003/nm-sensitive-storage-m.wav',
    '74000000-0000-4000-8000-000000000003'
  );

insert into public.account_deletion_requests(
  id, user_id, anonymized_user_ref, status, confirmed_at, metadata
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'adr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'confirmed',
    transaction_timestamp(),
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'adr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'confirmed',
    transaction_timestamp(),
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000003',
    'adr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'confirmed',
    transaction_timestamp(),
    '{}'::jsonb
  );

insert into g5d_five_stage_proof.fixtures(scenario_slug, user_id, request_id)
values
  ('clean', '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001'),
  ('recovery', '71000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002'),
  ('manual', '71000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003');

create or replace function public.g5d_five_stage_proof_auth_user_exists(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from g5d_five_stage_proof.fixtures fixture
    where fixture.user_id = p_target_user_id
      and fixture.scenario_slug in ('clean', 'recovery')
  ) then
    raise exception using errcode = '22023', message = 'proof_auth_target_invalid';
  end if;

  return exists(select 1 from auth.users auth_user where auth_user.id = p_target_user_id);
end;
$$;

create or replace function public.g5d_five_stage_proof_delete_auth_user(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_deleted integer;
begin
  select request_value.*
  into v_request
  from g5d_five_stage_proof.fixtures fixture
  join public.account_deletion_requests request_value on request_value.id = fixture.request_id
  where fixture.user_id = p_target_user_id
    and fixture.scenario_slug in ('clean', 'recovery')
    and fixture.auth_delete_calls = 0;

  if v_request.id is null
    or v_request.user_id is distinct from p_target_user_id
    or v_request.db_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.db_sub_finalized_at is null
    or v_request.auth_delete_generation is distinct from 1 then
    raise exception using errcode = '23514', message = 'proof_auth_delete_not_authorized';
  end if;

  delete from auth.users where id = p_target_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using errcode = '40001', message = 'proof_auth_delete_lost';
  end if;

  update g5d_five_stage_proof.fixtures
  set auth_delete_calls = auth_delete_calls + 1
  where user_id = p_target_user_id;

  return true;
end;
$$;

create or replace function public.g5d_five_stage_proof_safe_state(p_scenario_slug text)
returns table (
  request_exists boolean,
  provider_terminal boolean,
  storage_terminal boolean,
  database_terminal boolean,
  auth_terminal boolean,
  completion_terminal boolean,
  provider_target_count bigint,
  storage_target_count bigint,
  auth_user_present boolean,
  manual_stop boolean,
  state_fingerprint text,
  database_terminal_fingerprint text,
  completion_terminal_fingerprint text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fixture g5d_five_stage_proof.fixtures;
  v_request public.account_deletion_requests;
begin
  select * into v_fixture
  from g5d_five_stage_proof.fixtures
  where scenario_slug = p_scenario_slug;

  if v_fixture.scenario_slug is null then
    raise exception using errcode = '22023', message = 'proof_scenario_invalid';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = v_fixture.request_id;

  return query
  select
    v_request.id is not null,
    v_request.provider_cleanup_status in ('succeeded', 'not_needed')
      and v_request.provider_sub_finalized_at is not null
      and v_request.provider_verified_absent_count = v_request.provider_snapshot_target_count
      and not exists (
        select 1 from public.account_deletion_provider_targets target
        where target.deletion_request_id = v_fixture.request_id
          and (target.status <> 'verified_absent' or target.locator_scrubbed_at is null)
      ),
    v_request.storage_cleanup_status in ('succeeded', 'not_needed')
      and v_request.storage_sub_finalized_at is not null
      and v_request.storage_verified_absent_count = v_request.storage_snapshot_target_count
      and not exists (
        select 1 from public.account_deletion_storage_targets target
        where target.deletion_request_id = v_fixture.request_id
          and (target.status <> 'verified_absent' or target.locator_scrubbed_at is null)
      ),
    v_request.db_cleanup_status in ('succeeded', 'not_needed')
      and v_request.db_sub_finalized_at is not null
      and v_request.db_observed_row_count =
        v_request.db_deleted_row_count + v_request.db_anonymized_row_count + v_request.db_retained_row_count,
    v_request.auth_cleanup_status in ('succeeded', 'not_needed')
      and v_request.user_id is null
      and v_request.auth_delete_target_user_id is null
      and v_request.auth_verified_absent_at is not null
      and v_request.auth_sub_finalized_at is not null,
    v_request.status = 'completed'
      and v_request.completed_at is not null
      and v_request.expires_at = v_request.completed_at + interval '2160 hours'
      and v_request.notification_status = 'not_needed',
    (select count(*) from public.account_deletion_provider_targets target
      where target.deletion_request_id = v_fixture.request_id),
    (select count(*) from public.account_deletion_storage_targets target
      where target.deletion_request_id = v_fixture.request_id),
    exists(select 1 from auth.users auth_user where auth_user.id = v_fixture.user_id),
    v_request.provider_cleanup_status = 'manual_required'
      and v_request.status = 'provider_cleanup_failed'
      and v_request.provider_sub_finalized_at is null,
    encode(extensions.digest(
      jsonb_build_object(
        'request', to_jsonb(v_request),
        'provider_targets', coalesce((
          select jsonb_agg(to_jsonb(target) order by target.id)
          from public.account_deletion_provider_targets target
          where target.deletion_request_id = v_fixture.request_id
        ), '[]'::jsonb),
        'storage_targets', coalesce((
          select jsonb_agg(to_jsonb(target) order by target.id)
          from public.account_deletion_storage_targets target
          where target.deletion_request_id = v_fixture.request_id
        ), '[]'::jsonb),
        'auth_user', coalesce((
          select to_jsonb(auth_user)
          from auth.users auth_user
          where auth_user.id = v_fixture.user_id
        ), '{}'::jsonb),
        'owned_rows', jsonb_build_object(
          'profiles', (select count(*) from public.profiles where id = v_fixture.user_id),
          'voices', (select count(*) from public.voices where user_id = v_fixture.user_id),
          'voice_consents', (select count(*) from public.voice_consents where user_id = v_fixture.user_id)
        ),
        'auth_delete_calls', v_fixture.auth_delete_calls
      )::text,
      'sha256'
    ), 'hex'),
    encode(extensions.digest(concat_ws('|',
      v_request.db_cleanup_status,
      v_request.db_inventory_version,
      v_request.db_observed_row_count,
      v_request.db_deleted_row_count,
      v_request.db_anonymized_row_count,
      v_request.db_retained_row_count,
      v_request.db_sub_finalized_at
    ), 'sha256'), 'hex'),
    encode(extensions.digest(concat_ws('|',
      v_request.status,
      v_request.completed_at,
      v_request.expires_at,
      v_request.last_attempted_at
    ), 'sha256'), 'hex');
end;
$$;

create or replace function public.g5d_five_stage_proof_final_verification()
returns table (
  migration_chain_exact boolean,
  fixture_count bigint,
  auth_fixture_deletions bigint,
  completed_scenarios bigint,
  manual_scenarios bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    (select array_agg(version order by version) from supabase_migrations.schema_migrations) =
      array[
        '0001','0002','0003','0004','0005','0006','0007','0008','0009',
        '0010','0011','0012','0013','0014','0015','0016','0017','0018','0019',
        '0020','0021','0022','0023','0024','0025','0026','0027'
      ],
    (select count(*) from g5d_five_stage_proof.fixtures),
    (select sum(auth_delete_calls) from g5d_five_stage_proof.fixtures),
    (select count(*) from public.account_deletion_requests
      where id in (select request_id from g5d_five_stage_proof.fixtures)
        and status = 'completed'),
    (select count(*) from public.account_deletion_requests
      where id in (select request_id from g5d_five_stage_proof.fixtures)
        and status = 'provider_cleanup_failed'
        and provider_cleanup_status = 'manual_required');
$$;

revoke all on function public.g5d_five_stage_proof_auth_user_exists(uuid) from public, anon, authenticated;
revoke all on function public.g5d_five_stage_proof_delete_auth_user(uuid) from public, anon, authenticated;
revoke all on function public.g5d_five_stage_proof_safe_state(text) from public, anon, authenticated;
revoke all on function public.g5d_five_stage_proof_final_verification() from public, anon, authenticated;
grant execute on function public.g5d_five_stage_proof_auth_user_exists(uuid) to service_role;
grant execute on function public.g5d_five_stage_proof_delete_auth_user(uuid) to service_role;
grant execute on function public.g5d_five_stage_proof_safe_state(text) to service_role;
grant execute on function public.g5d_five_stage_proof_final_verification() to service_role;

\else
  \echo 'g5d_five_stage_bootstrap or g5d_five_stage_fixture is required; refusing to run'
  \quit 2
\endif

\endif
