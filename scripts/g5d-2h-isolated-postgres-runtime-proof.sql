\set ON_ERROR_STOP on

\if :{?g5d2h_isolated}
\else
  \echo 'g5d2h_isolated variable is required; refusing to run'
  \quit 2
\endif

\o /dev/null

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception using errcode = 'check_violation', message = p_message;
  end if;
end;
$$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_expected text[], p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any(p_expected) then
      return;
    end if;
    raise exception '%: expected %, got % (%)', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception '%: expected failure % but statement succeeded', p_label, p_expected;
end;
$$;

-- Clean 0001 -> 0024 migration history and exact current public-table inventory.
select pg_temp.assert_true(
  (select array_agg(version order by version) from supabase_migrations.schema_migrations) =
    array['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012',
          '0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024'],
  'migration history is not exact 0001 through 0024'
);

select pg_temp.assert_true(
  (select array_agg(tablename::text order by tablename)
     from pg_tables where schemaname = 'public') = array[
    'account_deletion_provider_targets',
    'account_deletion_requests',
    'account_deletion_storage_targets',
    'coach_feedback',
    'processing_consents',
    'profiles',
    'quota_events',
    'script_audios',
    'script_saved_best_takes',
    'script_saved_model_audios',
    'scripts',
    'takes',
    'voice_asset_write_intents',
    'voice_consents',
    'voice_deletion_operations',
    'voice_deletion_targets',
    'voices',
    'weak_words'
  ],
  'current public-table inventory is not exact 18'
);

-- Existing-data backfill on a clean disposable database affects zero rows.
select pg_temp.assert_true(
  (select count(*) = 0 from public.quota_events),
  'clean migration proof unexpectedly contained quota product rows'
);

-- Catalog: voice owner lifecycle, dual target FKs, quota lifecycle, DB evidence.
select pg_temp.assert_true(
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_deletion_operations' and column_name = 'user_id')
  and (select confdeltype = 'n' from pg_constraint
    where conname = 'voice_deletion_operations_user_id_fkey'
      and conrelid = 'public.voice_deletion_operations'::regclass),
  'voice operation nullable owner/SET NULL FK mismatch'
);

select pg_temp.assert_true(
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_deletion_targets' and column_name = 'user_id')
  and (select confdeltype = 'c' from pg_constraint
    where conname = 'voice_deletion_targets_operation_fkey'
      and conrelid = 'public.voice_deletion_targets'::regclass)
  and (select confdeltype = 'c' and confupdtype = 'c' from pg_constraint
    where conname = 'voice_deletion_targets_operation_owner_fkey'
      and conrelid = 'public.voice_deletion_targets'::regclass),
  'voice target nullable owner/dual FK lifecycle mismatch'
);

select pg_temp.assert_true(
  (select count(*) = 1 from pg_indexes
    where schemaname = 'public' and tablename = 'voice_deletion_operations'
      and indexname = 'voice_deletion_operations_audit_expires_at_idx')
  and (select count(*) = 1 from pg_trigger
    where tgrelid = 'public.voice_deletion_operations'::regclass
      and tgname = 'enforce_voice_deletion_operation_transition' and not tgisinternal)
  and (select count(*) = 1 from pg_trigger
    where tgrelid = 'public.voice_deletion_targets'::regclass
      and tgname = 'enforce_voice_deletion_target_immutability' and not tgisinternal),
  'voice expiry index or lifecycle trigger attachment mismatch'
);

select pg_temp.assert_true(
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public' and table_name = 'quota_events' and column_name = 'user_id')
  and (select confdeltype = 'n' from pg_constraint
    where conname = 'quota_events_user_id_fkey' and conrelid = 'public.quota_events'::regclass)
  and (select count(*) = 2 from information_schema.columns
    where table_schema = 'public' and table_name = 'quota_events'
      and column_name in ('identifier_scrubbed_at', 'retention_expires_at'))
  and (select count(*) = 1 from pg_indexes
    where schemaname = 'public' and tablename = 'quota_events'
      and indexname = 'quota_events_retention_expires_at_idx')
  and (select count(*) = 1 from pg_trigger
    where tgrelid = 'public.quota_events'::regclass
      and tgname = 'enforce_quota_event_retention_lifecycle' and not tgisinternal),
  'quota nullable owner/retention catalog mismatch'
);

select pg_temp.assert_true(
  (select count(*) = 6 from information_schema.columns
    where table_schema = 'public' and table_name = 'account_deletion_requests'
      and column_name in (
        'db_inventory_version', 'db_observed_row_count', 'db_deleted_row_count',
        'db_anonymized_row_count', 'db_retained_row_count', 'db_sub_finalized_at'
      ))
  and (select count(*) = 1 from pg_trigger
    where tgrelid = 'public.account_deletion_requests'::regclass
      and tgname = 'enforce_account_deletion_db_terminal_foundation' and not tgisinternal),
  'account request DB evidence or terminal trigger mismatch'
);

select pg_temp.assert_true(
  (select prosecdef and proconfig @> array['search_path=pg_catalog, public']
    from pg_proc where oid = 'public.enforce_voice_deletion_operation_transition()'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=pg_catalog, public']
    from pg_proc where oid = 'public.enforce_voice_deletion_target_immutability()'::regprocedure)
  and (select not prosecdef and proconfig @> array['search_path=pg_catalog, public']
    from pg_proc where oid = 'public.enforce_quota_event_retention_lifecycle()'::regprocedure)
  and (select not prosecdef and proconfig @> array['search_path=pg_catalog, public']
    from pg_proc where oid = 'public.enforce_account_deletion_db_terminal_foundation()'::regprocedure)
  and not exists (
    select 1
    from (values ('public'), ('anon'), ('authenticated'), ('service_role')) as role_name(name)
    cross join (
      values
        ('public.enforce_voice_deletion_operation_transition()'),
        ('public.enforce_voice_deletion_target_immutability()'),
        ('public.enforce_quota_event_retention_lifecycle()'),
        ('public.enforce_account_deletion_db_terminal_foundation()')
    ) as function_name(signature)
    where has_function_privilege(role_name.name, function_name.signature, 'execute')
  ),
  'G5D-2H trigger function owner/search_path/ACL mismatch'
);

-- Disposable users A/B and lifecycle fixtures.
insert into auth.users(id, email, created_at, updated_at) values
  ('81000000-0000-4000-8000-000000000001','g5d2h-a@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000002','g5d2h-b@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000003','g5d2h-pending@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000004','g5d2h-processing@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000005','g5d2h-partial@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000006','g5d2h-manual@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000007','g5d2h-failed@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000008','g5d2h-invalid-complete@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000009','g5d2h-auth-valid@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000010','g5d2h-quota-auth@example.invalid',now(),now()),
  ('81000000-0000-4000-8000-000000000011','g5d2h-quota-valid@example.invalid',now(),now());

-- Valid completed + verified + scrubbed parent and child.
insert into public.voice_deletion_operations(
  id, user_id, status, snapshot_status, consent_withdrawal_status,
  post_delete_verification_status, completed_at, sensitive_snapshot_scrubbed_at, audit_expires_at
) values (
  '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
  'completed', 'succeeded', 'succeeded', 'succeeded',
  '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-11-30T00:00:00Z'
);
insert into public.voice_deletion_targets(
  id, operation_id, user_id, target_kind, status, delete_outcome,
  reconciliation_status, verification_status, verified_absent_at, locator_scrubbed_at
) values (
  '83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001', 'provider_voice', 'verified_absent', 'not_found',
  'verified_absent', 'not_applicable', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'
);

update public.voice_deletion_operations
set user_id = null
where id = '82000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select user_id is null from public.voice_deletion_operations
    where id = '82000000-0000-4000-8000-000000000001')
  and (select user_id is null and operation_id = '82000000-0000-4000-8000-000000000001'
    from public.voice_deletion_targets where id = '83000000-0000-4000-8000-000000000001'),
  'eligible completed audit owner-null propagation failed'
);

select pg_temp.expect_sqlstate(
  $$update public.voice_deletion_targets set provider_resource_id = 'restored'
    where id = '83000000-0000-4000-8000-000000000001'$$,
  array['23514'], 'scrubbed target locator restoration'
);
select pg_temp.expect_sqlstate(
  $$update public.voice_deletion_targets set status = 'manual_required'
    where id = '83000000-0000-4000-8000-000000000001'$$,
  array['23514'], 'scrubbed target lifecycle rewrite'
);
select pg_temp.expect_sqlstate(
  $$update public.voice_deletion_operations set last_failure_category = 'rewritten'
    where id = '82000000-0000-4000-8000-000000000001'$$,
  array['23514'], 'completed operation sensitive field mutation'
);

delete from public.voice_deletion_operations
where id = '82000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select count(*) = 0 from public.voice_deletion_targets
    where operation_id = '82000000-0000-4000-8000-000000000001'),
  'completed parent purge did not cascade targets'
);

-- Every active/manual/failed state rejects owner-null.
insert into public.voice_deletion_operations(id, user_id, status) values
  ('82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000003','pending'),
  ('82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000004','processing'),
  ('82000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000005','partial_failure'),
  ('82000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000006','manual_required'),
  ('82000000-0000-4000-8000-000000000007','81000000-0000-4000-8000-000000000007','failed');

select pg_temp.expect_sqlstate(
  $$update public.voice_deletion_operations set user_id = null
    where id between '82000000-0000-4000-8000-000000000003' and '82000000-0000-4000-8000-000000000007'$$,
  array['23514'], 'active/manual/failed owner-null'
);

-- Completed but unsafely unscrubbed target rejects parent anonymization.
insert into public.voice_deletion_operations(
  id, user_id, status, snapshot_status, consent_withdrawal_status,
  post_delete_verification_status, completed_at, sensitive_snapshot_scrubbed_at, audit_expires_at
) values (
  '82000000-0000-4000-8000-000000000008', '81000000-0000-4000-8000-000000000008',
  'completed', 'succeeded', 'succeeded', 'succeeded',
  '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-11-30T00:00:00Z'
);
insert into public.voice_deletion_targets(
  id, operation_id, user_id, target_kind, provider_name, provider_resource_id,
  target_fingerprint, status, reconciliation_status, verification_status
) values (
  '83000000-0000-4000-8000-000000000008', '82000000-0000-4000-8000-000000000008',
  '81000000-0000-4000-8000-000000000008', 'provider_voice', 'elevenlabs', 'unsafe-provider-id',
  'unsafe-fingerprint', 'pending', 'pending', 'not_applicable'
);
select pg_temp.expect_sqlstate(
  $$update public.voice_deletion_operations set user_id = null
    where id = '82000000-0000-4000-8000-000000000008'$$,
  array['23514'], 'invalid completed owner-null'
);
select pg_temp.expect_sqlstate(
  $$update public.voice_deletion_targets set user_id = null
    where id = '83000000-0000-4000-8000-000000000008'$$,
  array['23514'], 'direct child owner-null outside FK cascade'
);
select pg_temp.expect_sqlstate(
  $$insert into public.voice_deletion_targets(
      operation_id,user_id,target_kind,provider_name,provider_resource_id,target_fingerprint)
    values(
      '82000000-0000-4000-8000-000000000008','81000000-0000-4000-8000-000000000002',
      'provider_voice','elevenlabs','cross-user','cross-user-fingerprint')$$,
  array['23503'], 'cross-user voice target/parent pair'
);

-- Auth-like deletion is blocked for active operations but survives for a valid audit.
select pg_temp.expect_sqlstate(
  $$delete from auth.users where id = '81000000-0000-4000-8000-000000000003'$$,
  array['23514'], 'premature Auth deletion with active voice operation'
);

insert into public.voice_deletion_operations(
  id, user_id, status, snapshot_status, consent_withdrawal_status,
  post_delete_verification_status, completed_at, sensitive_snapshot_scrubbed_at, audit_expires_at
) values (
  '82000000-0000-4000-8000-000000000009', '81000000-0000-4000-8000-000000000009',
  'completed', 'succeeded', 'not_needed', 'succeeded',
  '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-11-30T00:00:00Z'
);
insert into public.voice_deletion_targets(
  id, operation_id, user_id, target_kind, status, delete_outcome,
  reconciliation_status, verification_status, verified_absent_at, locator_scrubbed_at
) values (
  '83000000-0000-4000-8000-000000000009', '82000000-0000-4000-8000-000000000009',
  '81000000-0000-4000-8000-000000000009', 'provider_voice', 'verified_absent', 'not_found',
  'verified_absent', 'not_applicable', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'
);
delete from auth.users where id = '81000000-0000-4000-8000-000000000009';
select pg_temp.assert_true(
  (select user_id is null from public.voice_deletion_operations
    where id = '82000000-0000-4000-8000-000000000009')
  and (select user_id is null from public.voice_deletion_targets
    where id = '83000000-0000-4000-8000-000000000009'),
  'valid completed voice audit did not survive Auth owner removal'
);

-- Quota retention is anchored to attempted_at and canonical scrub is atomic.
insert into public.quota_events(
  id, user_id, event_type, status, subject_type, subject_id, target_resource_type,
  target_resource_id, idempotency_key, dedupe_key, request_fingerprint,
  provider, provider_model, provider_request_id, metadata, attempted_at
) values (
  '84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
  'script_audio_generation_attempt', 'attempted', 'saved_script',
  '85000000-0000-4000-8000-000000000001', 'script_audio',
  '85000000-0000-4000-8000-000000000002', 'idempotency-a', 'dedupe-a', 'fingerprint-a',
  'elevenlabs', 'model-safe', 'provider-request-a', '{"script_id":"identifying"}',
  '2026-08-01T00:00:00Z'
);
select pg_temp.assert_true(
  (select retention_expires_at = attempted_at + interval '90 days'
    from public.quota_events where id = '84000000-0000-4000-8000-000000000001'),
  'quota insert did not derive exact attempted_at + 90 days expiry'
);

update public.quota_events
set user_id = null,
    subject_id = null,
    target_resource_id = null,
    idempotency_key = null,
    dedupe_key = null,
    request_fingerprint = null,
    provider_request_id = null,
    metadata = '{}'::jsonb,
    identifier_scrubbed_at = '2026-09-02T00:00:00Z'
where id = '84000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select user_id is null and identifier_scrubbed_at is not null
      and subject_id is null and target_resource_id is null
      and idempotency_key is null and dedupe_key is null
      and request_fingerprint is null and provider_request_id is null
      and metadata = '{}'::jsonb
      and provider = 'elevenlabs' and provider_model = 'model-safe'
      and retention_expires_at = attempted_at + interval '90 days'
    from public.quota_events where id = '84000000-0000-4000-8000-000000000001'),
  'canonical quota anonymized-retained shape mismatch'
);

insert into public.quota_events(
  id,user_id,event_type,status,subject_type,subject_id,target_resource_type,
  idempotency_key,dedupe_key,request_fingerprint,provider_request_id,metadata
) values
  ('84000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002',
   'script_generation_attempt','attempted','script_studio','85000000-0000-4000-8000-000000000003','none',
   'idempotency-b','dedupe-b','fingerprint-b','provider-b','{"identifying":true}'),
  ('84000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000010',
   'script_generation_attempt','attempted','script_studio','85000000-0000-4000-8000-000000000004','none',
   'idempotency-c','dedupe-c','fingerprint-c','provider-c','{"identifying":true}'),
  ('84000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000011',
   'script_generation_attempt','attempted','script_studio',null,'none',
   null,null,null,null,'{}');

select pg_temp.expect_sqlstate(
  $$update public.quota_events set user_id = null, identifier_scrubbed_at = now()
    where id = '84000000-0000-4000-8000-000000000002'$$,
  array['23514'], 'quota owner-null with identifying fields'
);
select pg_temp.expect_sqlstate(
  $$update public.quota_events set user_id = null, subject_id = null,
      idempotency_key = null, dedupe_key = null, request_fingerprint = null,
      provider_request_id = null, metadata = '{}'::jsonb
    where id = '84000000-0000-4000-8000-000000000002'$$,
  array['23514'], 'quota owner-null without scrub timestamp'
);
select pg_temp.expect_sqlstate(
  $$update public.quota_events set retention_expires_at = retention_expires_at + interval '1 second'
    where id = '84000000-0000-4000-8000-000000000002'$$,
  array['23514'], 'wrong quota retention expiry'
);
select pg_temp.expect_sqlstate(
  $$delete from auth.users where id = '81000000-0000-4000-8000-000000000010'$$,
  array['23514'], 'premature Auth deletion with unscrubbed quota row'
);

update public.quota_events
set user_id = null, subject_id = null, target_resource_id = null,
    idempotency_key = null, dedupe_key = null, request_fingerprint = null,
    provider_request_id = null, metadata = '{}'::jsonb, identifier_scrubbed_at = now()
where id = '84000000-0000-4000-8000-000000000004';
delete from auth.users where id = '81000000-0000-4000-8000-000000000011';
select pg_temp.assert_true(
  (select user_id is null and retention_expires_at = attempted_at + interval '90 days'
    from public.quota_events where id = '84000000-0000-4000-8000-000000000004'),
  'canonical quota row did not survive Auth owner removal'
);

insert into public.quota_events(
  id,user_id,event_type,status,subject_type,target_resource_type,attempted_at
) values
  ('84000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000001',
   'script_generation_attempt','attempted','script_studio','none','2026-01-01T00:00:00Z'),
  ('84000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000001',
   'script_generation_attempt','attempted','script_studio','none','2026-09-01T00:00:00Z');
select pg_temp.assert_true(
  (select retention_expires_at < '2026-09-02T00:00:00Z'::timestamptz
    from public.quota_events where id = '84000000-0000-4000-8000-000000000005')
  and (select retention_expires_at > '2026-09-02T00:00:00Z'::timestamptz
    from public.quota_events where id = '84000000-0000-4000-8000-000000000006'),
  'quota expiry does not support future expired/nonexpired classification'
);

-- DB terminal state remains unreachable until the next focused finalizer unit.
insert into public.account_deletion_requests(
  id,user_id,status,provider_cleanup_status,storage_cleanup_status
) values (
  '86000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
  'confirmed','pending','pending'
);
select pg_temp.expect_sqlstate(
  $$insert into public.account_deletion_requests(
      id,user_id,status,provider_cleanup_status,storage_cleanup_status,
      db_cleanup_status,db_sub_finalized_at
    ) values (
      '86000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001',
      'confirmed','succeeded','succeeded','succeeded',now()
    )$$,
  array['42501'], 'ordinary terminal DB request insert'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests
    set db_cleanup_status = 'succeeded', db_sub_finalized_at = now(),
        db_observed_row_count = 1, db_deleted_row_count = 1
    where id = '86000000-0000-4000-8000-000000000001'$$,
  array['42501'], 'ordinary direct DB succeeded write'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set db_cleanup_status = 'not_needed'
    where id = '86000000-0000-4000-8000-000000000001'$$,
  array['42501'], 'ordinary direct DB not-needed write'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set db_sub_finalized_at = now()
    where id = '86000000-0000-4000-8000-000000000001'$$,
  array['42501'], 'direct DB sub-finalizer timestamp write'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set db_observed_row_count = -1
    where id = '86000000-0000-4000-8000-000000000001'$$,
  array['23514'], 'negative DB evidence count'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set db_inventory_version = 'legacy-17-table'
    where id = '86000000-0000-4000-8000-000000000001'$$,
  array['23514'], 'invalid DB inventory version'
);

begin;
set local role service_role;
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests
    set db_cleanup_status = 'succeeded', db_sub_finalized_at = now()
    where id = '86000000-0000-4000-8000-000000000001'$$,
  array['42501'], 'service-role-like direct DB terminal write'
);
rollback;

-- User B remained unrelated throughout A's anonymization, rejection, and purge cases.
select pg_temp.assert_true(
  (select count(*) = 1 from auth.users where id = '81000000-0000-4000-8000-000000000002')
  and (select user_id = '81000000-0000-4000-8000-000000000002'
    from public.quota_events where id = '84000000-0000-4000-8000-000000000002'),
  'User B isolation failed'
);

-- Fixture cleanup. No product deletion/anonymization occurred outside tagged rows.
delete from public.account_deletion_requests
where id between '86000000-0000-4000-8000-000000000001' and '86000000-0000-4000-8000-000000000099';
delete from public.quota_events
where id between '84000000-0000-4000-8000-000000000001' and '84000000-0000-4000-8000-000000000099';
delete from public.voice_deletion_operations
where id between '82000000-0000-4000-8000-000000000001' and '82000000-0000-4000-8000-000000000099';
delete from auth.users
where id between '81000000-0000-4000-8000-000000000001' and '81000000-0000-4000-8000-000000000099';

select pg_temp.assert_true(
  (select count(*) = 0 from public.account_deletion_requests
    where id between '86000000-0000-4000-8000-000000000001' and '86000000-0000-4000-8000-000000000099')
  and (select count(*) = 0 from public.quota_events
    where id between '84000000-0000-4000-8000-000000000001' and '84000000-0000-4000-8000-000000000099')
  and (select count(*) = 0 from public.voice_deletion_operations
    where id between '82000000-0000-4000-8000-000000000001' and '82000000-0000-4000-8000-000000000099')
  and (select count(*) = 0 from public.voice_deletion_targets
    where id between '83000000-0000-4000-8000-000000000001' and '83000000-0000-4000-8000-000000000099')
  and (select count(*) = 0 from auth.users
    where id between '81000000-0000-4000-8000-000000000001' and '81000000-0000-4000-8000-000000000099'),
  'G5D-2H isolated proof fixture cleanup failed'
);

\o
select 'G5D_2H_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS' as result,
  18 as exact_public_tables,
  0 as product_cleanup_calls,
  0 as real_auth_calls,
  0 as provider_calls,
  0 as storage_calls,
  0 as staging_mutations,
  0 as completion_calls;
