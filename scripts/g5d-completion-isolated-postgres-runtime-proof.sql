\set ON_ERROR_STOP on

\if :{?g5d_completion_isolated}
\else
  \echo 'g5d_completion_isolated variable is required; refusing to run'
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
  raise exception '%: expected failure %, but statement succeeded', p_label, p_expected;
end;
$$;

create or replace function pg_temp.seed_completion_ready(
  p_request_id uuid,
  p_provider_targets integer default 0,
  p_storage_targets integer default 0,
  p_auth_generation integer default 1
)
returns void language plpgsql as $$
declare
  v_now timestamptz := transaction_timestamp();
  v_provider_finalized_at timestamptz := v_now - interval '4 minutes';
  v_storage_finalized_at timestamptz := v_now - interval '3 minutes';
  v_auth_requested_at timestamptz := v_now - interval '2 minutes';
  v_auth_absent_at timestamptz := v_now - interval '90 seconds';
  v_auth_finalized_at timestamptz := v_now - interval '1 minute';
  v_index integer;
begin
  if p_provider_targets < 0 or p_storage_targets < 0 or p_auth_generation not in (0, 1) then
    raise exception 'invalid proof fixture';
  end if;

  perform set_config('session_replication_role', 'replica', true);

  insert into public.account_deletion_requests(
    id, user_id, status, requested_at, confirmed_at,
    provider_cleanup_status, provider_snapshot_status, provider_snapshot_seal_version,
    provider_snapshot_sealed_at, provider_snapshot_target_count,
    provider_verified_absent_count, provider_sub_finalized_at, provider_locator_scrubbed_at,
    storage_cleanup_status, storage_snapshot_status, storage_snapshot_seal_version,
    storage_snapshot_collection_started_at, storage_snapshot_sealed_at,
    storage_snapshot_target_count, storage_verified_absent_count,
    storage_sub_finalized_at, storage_locator_scrubbed_at,
    db_cleanup_status, db_observed_row_count, db_deleted_row_count,
    db_anonymized_row_count, db_retained_row_count, db_sub_finalized_at,
    auth_cleanup_status, auth_intent_version, auth_delete_generation,
    auth_delete_requested_at, auth_verification_attempt_count,
    auth_verified_absent_at, auth_sub_finalized_at,
    notification_status, last_attempted_at, metadata
  ) values (
    p_request_id, null, 'confirmed', v_now - interval '10 minutes', v_now - interval '9 minutes',
    case when p_provider_targets = 0 then 'not_needed' else 'succeeded' end,
    'sealed', 1, v_now - interval '5 minutes', p_provider_targets, p_provider_targets,
    v_provider_finalized_at, v_provider_finalized_at,
    case when p_storage_targets = 0 then 'not_needed' else 'succeeded' end,
    'sealed', 1, v_now - interval '4 minutes', v_now - interval '4 minutes',
    p_storage_targets, p_storage_targets, v_storage_finalized_at, v_storage_finalized_at,
    'not_needed', 1 + p_provider_targets + p_storage_targets, 0, 0,
    1 + p_provider_targets + p_storage_targets, v_now - interval '150 seconds',
    case when p_auth_generation = 0 then 'not_needed' else 'succeeded' end,
    'g5d-2m.auth-delete.v1', p_auth_generation, v_auth_requested_at, 1,
    v_auth_absent_at, v_auth_finalized_at,
    'pending', v_auth_finalized_at, '{}'::jsonb
  );

  for v_index in 1..p_provider_targets loop
    insert into public.account_deletion_provider_targets(
      id, deletion_request_id, user_id, status, delete_outcome,
      reconciliation_status, reconciliation_attempt_count, verified_absent_at,
      locator_scrubbed_at
    ) values (
      gen_random_uuid(), p_request_id, null, 'verified_absent', 'not_found',
      'verified_absent', 1, v_provider_finalized_at - interval '1 second',
      v_provider_finalized_at
    );
  end loop;

  for v_index in 1..p_storage_targets loop
    insert into public.account_deletion_storage_targets(
      id, deletion_request_id, user_id, target_kind, source_kind_summary,
      prefix_listed, status, delete_outcome, verification_status,
      delete_attempt_count, verification_attempt_count, delete_requested_at,
      delete_succeeded_at, verified_absent_at, locator_scrubbed_at
    ) values (
      gen_random_uuid(), p_request_id, null, 'recording', array['take_audio'],
      false, 'verified_absent', 'succeeded', 'verified_absent',
      1, 1, v_storage_finalized_at - interval '3 seconds',
      v_storage_finalized_at - interval '2 seconds',
      v_storage_finalized_at - interval '1 second', v_storage_finalized_at
    );
  end loop;
end;
$$;

-- Migration/catalog identity and ACL authority.
select pg_temp.assert_true(
  (select array_agg(version order by version) from supabase_migrations.schema_migrations) =
    array['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012',
          '0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024',
          '0025','0026','0027'],
  'migration history is not exact 0001 through 0027'
);

select pg_temp.assert_true(
  (select proowner = 'postgres'::regrole and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']
    from pg_proc where oid = 'public.finalize_account_deletion_completion(uuid)'::regprocedure),
  'Completion RPC owner/security/search_path mismatch'
);
select pg_temp.assert_true(
  has_function_privilege('service_role','public.finalize_account_deletion_completion(uuid)','execute')
    and not has_function_privilege('public','public.finalize_account_deletion_completion(uuid)','execute')
    and not has_function_privilege('anon','public.finalize_account_deletion_completion(uuid)','execute')
    and not has_function_privilege('authenticated','public.finalize_account_deletion_completion(uuid)','execute'),
  'Completion RPC execute ACL mismatch'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'service_role',
    'public.account_deletion_completion_prerequisites_terminal(public.account_deletion_requests)',
    'execute'
  )
    and not has_function_privilege(
      'service_role','public.enforce_account_deletion_completion_authority()','execute'
    ),
  'Completion helpers unexpectedly callable by service_role'
);
select pg_temp.assert_true(
  not has_column_privilege('service_role','public.account_deletion_requests','completed_at','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','expires_at','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','notification_status','update')
    and has_column_privilege('service_role','public.account_deletion_requests','status','update')
    and has_column_privilege('service_role','public.account_deletion_requests','confirmed_at','update')
    and has_column_privilege('service_role','public.account_deletion_requests','metadata','update'),
  'Completion direct-column ACL or request workflow ACL mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 1 from pg_constraint
    where conrelid='public.account_deletion_requests'::regclass
      and conname='account_deletion_requests_completion_terminal_shape_check'
      and convalidated),
  'Completion terminal composite constraint missing or unvalidated'
);
select pg_temp.assert_true(
  (select count(*) = 1 from pg_trigger
    where tgrelid='public.account_deletion_requests'::regclass
      and tgname='enforce_account_deletion_completion_authority'
      and not tgisinternal and tgenabled='O'),
  'Completion authority trigger missing or disabled'
);
select pg_temp.assert_true(
  has_function_privilege('service_role','public.finalize_account_deletion_provider_stage(uuid,uuid,uuid,integer)','execute')
    and has_function_privilege('service_role','public.finalize_account_deletion_storage_stage(uuid,uuid,uuid,integer)','execute')
    and has_function_privilege('service_role','public.finalize_account_deletion_database_stage(uuid,uuid,text)','execute')
    and has_function_privilege('service_role','public.finalize_account_deletion_auth_stage(uuid,text,integer,integer)','execute'),
  'prior-stage focused RPC execute authority changed'
);

-- The 0027 Auth-trigger compatibility change preserves the full 0026 focused
-- transition and permits only the later unrelated Completion update.
insert into auth.users(id,email,created_at,updated_at) values
  ('10000000-0000-4000-8000-000000000002','completion-auth-flow@example.invalid',now(),now());
delete from public.profiles where id='10000000-0000-4000-8000-000000000002';
set session_replication_role=replica;
insert into public.account_deletion_requests(
  id,user_id,status,requested_at,confirmed_at,
  provider_cleanup_status,provider_snapshot_status,provider_snapshot_seal_version,
  provider_snapshot_sealed_at,provider_sub_finalized_at,provider_locator_scrubbed_at,
  storage_cleanup_status,storage_snapshot_status,storage_snapshot_seal_version,
  storage_snapshot_collection_started_at,storage_snapshot_sealed_at,
  storage_sub_finalized_at,storage_locator_scrubbed_at,
  db_cleanup_status,db_observed_row_count,db_retained_row_count,db_sub_finalized_at,
  notification_status,metadata
) values (
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'confirmed',now()-interval '10 minutes',now()-interval '9 minutes',
  'not_needed','sealed',1,now()-interval '8 minutes',now()-interval '7 minutes',now()-interval '7 minutes',
  'not_needed','sealed',1,now()-interval '7 minutes',now()-interval '6 minutes',
  now()-interval '5 minutes',now()-interval '5 minutes',
  'not_needed',1,1,now()-interval '4 minutes','pending','{}'::jsonb
);
set session_replication_role=origin;
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'g5d-2m.auth-delete.v1',1,'present'
);
select public.authorize_account_deletion_auth_delete_dispatch(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'g5d-2m.auth-delete.v1',1
);
delete from auth.users where id='10000000-0000-4000-8000-000000000002';
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'g5d-2m.auth-delete.v1',1
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  'g5d-2m.auth-delete.v1',2,'verified_absent'
);
select public.finalize_account_deletion_auth_stage(
  '20000000-0000-4000-8000-000000000002','g5d-2m.auth-delete.v1',1,2
);
select pg_temp.assert_true(
  (select status='confirmed' and user_id is null and auth_cleanup_status='succeeded'
      and auth_delete_generation=1 and auth_delete_target_user_id is null
      and auth_verification_attempt_count=2 and auth_verification_result is null
      and auth_verification_result_attempt_count is null and auth_sub_finalized_at is not null
    from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000002'),
  '0027 changed focused Auth durable sub-finalization behavior'
);
select pg_temp.assert_true(
  (select completion_status='completed' and not already_completed
    from public.finalize_account_deletion_completion(
      '20000000-0000-4000-8000-000000000002'
    )),
  'post-Auth Completion compatibility path failed'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests
      set auth_verification_attempt_count=auth_verification_attempt_count+1
      where id='20000000-0000-4000-8000-000000000002'$$,
  array['23514'], 'post-0027 Auth terminal evidence rewrite'
);

-- A/B/M: valid first completion, exact expiry, and response-loss replay.
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000001', 1, 1, 1
);
create temporary table first_completion_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000001'
);
select pg_temp.assert_true(
  (select completion_status='completed' and safe_reason='completion_finalized'
      and not already_completed and expires_at=completed_at+interval '2160 hours'
      and extract(epoch from expires_at-completed_at)=7776000
    from first_completion_result),
  'valid first Completion did not write exact terminal evidence'
);
select pg_temp.assert_true(
  (select request.status='completed'
      and request.completed_at=first_result.completed_at
      and request.expires_at=first_result.expires_at
      and request.last_attempted_at=request.completed_at
      and request.notification_status='not_needed'
      and request.user_id is null
      and request.failure_stage is null and request.failure_reason_code is null
      and request.metadata='{}'::jsonb
    from public.account_deletion_requests request
    cross join first_completion_result first_result
    where request.id='20000000-0000-4000-8000-000000000001'),
  'persisted first Completion shape mismatch'
);
create temporary table replay_completion_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000001'
);
select pg_temp.assert_true(
  (select replay.completion_status='completed' and replay.safe_reason='already_completed'
      and replay.already_completed
      and replay.completed_at=first_result.completed_at
      and replay.expires_at=first_result.expires_at
    from replay_completion_result replay cross join first_completion_result first_result),
  'already-completed/response-loss replay changed terminal timestamps'
);

-- P/Q/R: first writes, DST-crossing persisted fixtures, replay predicates, and
-- the completed constraint remain invariant across session TimeZone changes.
set timezone='America/New_York';
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000016', 0, 0, 1
);
create temporary table new_york_first_completion_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000016'
);
select pg_temp.assert_true(
  (select not already_completed
      and expires_at=completed_at+interval '2160 hours'
      and extract(epoch from expires_at-completed_at)=7776000
    from new_york_first_completion_result),
  'America/New_York first Completion was not exactly 2160 elapsed hours'
);
set timezone='UTC';
create temporary table new_york_to_utc_replay_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000016'
);
select pg_temp.assert_true(
  (select replay.already_completed and replay.safe_reason='already_completed'
      and replay.completed_at=first_result.completed_at
      and replay.expires_at=first_result.expires_at
      and extract(epoch from replay.expires_at-replay.completed_at)=7776000
    from new_york_to_utc_replay_result replay
    cross join new_york_first_completion_result first_result),
  'America/New_York first Completion did not replay invariantly in UTC'
);

-- Fall-back crossing: 2026-09-15 + 2160 elapsed hours crosses the 2026-11-01
-- America/New_York DST boundary while retaining one exact persisted instant.
set timezone='America/New_York';
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000017', 0, 0, 1
);
set session_replication_role=replica;
update public.account_deletion_requests
set status='completed',
    completed_at='2026-09-15 12:00:00-04'::timestamptz,
    expires_at='2026-09-15 12:00:00-04'::timestamptz+interval '2160 hours',
    notification_status='not_needed',
    failure_stage=null,
    failure_reason_code=null,
    last_attempted_at='2026-09-15 12:00:00-04'::timestamptz
where id='20000000-0000-4000-8000-000000000017';
set session_replication_role=origin;
create temporary table fall_back_completion_snapshot as
select completed_at, expires_at
from public.account_deletion_requests
where id='20000000-0000-4000-8000-000000000017';
select pg_temp.assert_true(
  (select expires_at=completed_at+interval '2160 hours'
      and extract(epoch from expires_at-completed_at)=7776000
    from fall_back_completion_snapshot),
  'fall-back Completion fixture was not exactly 2160 elapsed hours'
);
set timezone='UTC';
create temporary table fall_back_utc_replay_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000017'
);
select pg_temp.assert_true(
  (select replay.already_completed and replay.safe_reason='already_completed'
      and replay.completed_at=snapshot.completed_at
      and replay.expires_at=snapshot.expires_at
      and replay.expires_at=replay.completed_at+interval '2160 hours'
      and extract(epoch from replay.expires_at-replay.completed_at)=7776000
    from fall_back_utc_replay_result replay
    cross join fall_back_completion_snapshot snapshot),
  'fall-back America/New_York to UTC replay changed Completion authority'
);
set timezone='Asia/Tokyo';
select pg_temp.assert_true(
  (select expires_at=completed_at+interval '2160 hours'
      and extract(epoch from expires_at-completed_at)=7776000
    from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000017'),
  'fall-back completed constraint predicate changed in Asia/Tokyo'
);

-- Spring-forward crossing: 2027-01-15 + 2160 elapsed hours crosses the
-- 2027-03-14 America/New_York DST boundary and replays under UTC.
set timezone='America/New_York';
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000018', 0, 0, 1
);
set session_replication_role=replica;
update public.account_deletion_requests
set status='completed',
    completed_at='2027-01-15 12:00:00-05'::timestamptz,
    expires_at='2027-01-15 12:00:00-05'::timestamptz+interval '2160 hours',
    notification_status='not_needed',
    failure_stage=null,
    failure_reason_code=null,
    last_attempted_at='2027-01-15 12:00:00-05'::timestamptz
where id='20000000-0000-4000-8000-000000000018';
set session_replication_role=origin;
create temporary table spring_forward_completion_snapshot as
select completed_at, expires_at
from public.account_deletion_requests
where id='20000000-0000-4000-8000-000000000018';
select pg_temp.assert_true(
  (select expires_at=completed_at+interval '2160 hours'
      and extract(epoch from expires_at-completed_at)=7776000
    from spring_forward_completion_snapshot),
  'spring-forward Completion fixture was not exactly 2160 elapsed hours'
);
set timezone='UTC';
create temporary table spring_forward_utc_replay_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000018'
);
select pg_temp.assert_true(
  (select replay.already_completed and replay.safe_reason='already_completed'
      and replay.completed_at=snapshot.completed_at
      and replay.expires_at=snapshot.expires_at
      and replay.expires_at=replay.completed_at+interval '2160 hours'
      and extract(epoch from replay.expires_at-replay.completed_at)=7776000
    from spring_forward_utc_replay_result replay
    cross join spring_forward_completion_snapshot snapshot),
  'spring-forward America/New_York to UTC replay changed Completion authority'
);

-- Reverse session variation: first Completion in UTC, replay in New York.
set timezone='UTC';
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000019', 0, 0, 1
);
create temporary table utc_first_completion_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000019'
);
set timezone='America/New_York';
create temporary table utc_to_new_york_replay_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000019'
);
select pg_temp.assert_true(
  (select replay.already_completed and replay.safe_reason='already_completed'
      and replay.completed_at=first_result.completed_at
      and replay.expires_at=first_result.expires_at
      and replay.expires_at=replay.completed_at+interval '2160 hours'
      and extract(epoch from replay.expires_at-replay.completed_at)=7776000
    from utc_to_new_york_replay_result replay
    cross join utc_first_completion_result first_result),
  'UTC first Completion did not replay invariantly in America/New_York'
);
set timezone='UTC';

-- C/D: Provider and Storage child-count mismatches fail before any write.
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000003', 1, 0, 1
);
delete from public.account_deletion_provider_targets
where deletion_request_id='20000000-0000-4000-8000-000000000003';
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000003')$$,
  array['23514'], 'Provider child mismatch'
);
select pg_temp.assert_true(
  (select status='confirmed' and completed_at is null
    from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000003'),
  'Provider mismatch persisted Completion evidence'
);

select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000004', 0, 1, 1
);
delete from public.account_deletion_storage_targets
where deletion_request_id='20000000-0000-4000-8000-000000000004';
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000004')$$,
  array['23514'], 'Storage child mismatch'
);
select pg_temp.assert_true(
  (select status='confirmed' and completed_at is null
    from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000004'),
  'Storage mismatch persisted Completion evidence'
);

-- Preserve exact current constraints while constructing proof-only corruptions.
create temporary table proof_constraint_definitions(
  constraint_name text primary key,
  constraint_definition text not null
);
insert into proof_constraint_definitions
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='public.account_deletion_requests'::regclass
  and conname in (
    'account_deletion_requests_db_terminal_shape_check',
    'account_deletion_requests_auth_durable_shape_check'
  );

-- E: impossible-under-constraint D/A/R contradiction is still rejected by RPC.
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000005', 0, 0, 1
);
alter table public.account_deletion_requests
  drop constraint account_deletion_requests_db_terminal_shape_check;
set session_replication_role=replica;
update public.account_deletion_requests
set db_observed_row_count=db_observed_row_count+1
where id='20000000-0000-4000-8000-000000000005';
set session_replication_role=origin;
do $$
declare v_definition text;
begin
  select constraint_definition into v_definition from proof_constraint_definitions
  where constraint_name='account_deletion_requests_db_terminal_shape_check';
  execute 'alter table public.account_deletion_requests add constraint '
    || quote_ident('account_deletion_requests_db_terminal_shape_check')
    || ' ' || v_definition || ' not valid';
end;
$$;
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000005')$$,
  array['23514'], 'DB D/A/R contradiction'
);
set session_replication_role=replica;
update public.account_deletion_requests
set db_observed_row_count=db_retained_row_count
where id='20000000-0000-4000-8000-000000000005';
set session_replication_role=origin;
alter table public.account_deletion_requests
  validate constraint account_deletion_requests_db_terminal_shape_check;

-- F: a legitimate nonterminal Auth shape cannot complete.
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000006', 0, 0, 1
);
set session_replication_role=replica;
update public.account_deletion_requests
set auth_cleanup_status='pending',
    auth_delete_target_user_id='10000000-0000-4000-8000-000000000006',
    auth_verified_absent_at=null,
    auth_sub_finalized_at=null,
    last_attempted_at=auth_delete_requested_at
where id='20000000-0000-4000-8000-000000000006';
set session_replication_role=origin;
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000006')$$,
  array['23514'], 'Auth nonterminal'
);

-- G/H: proof-only owner restoration and unsrubbed Auth target both fail closed.
alter table public.account_deletion_requests
  drop constraint account_deletion_requests_auth_durable_shape_check;

insert into auth.users(id,email,created_at,updated_at) values
  ('10000000-0000-4000-8000-000000000007','completion-owner-proof@example.invalid',now(),now());
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000007', 0, 0, 1
);
set session_replication_role=replica;
update public.account_deletion_requests
set user_id='10000000-0000-4000-8000-000000000007'
where id='20000000-0000-4000-8000-000000000007';
set session_replication_role=origin;
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000007')$$,
  array['23514'], 'restored non-null owner'
);
set session_replication_role=replica;
update public.account_deletion_requests set user_id=null
where id='20000000-0000-4000-8000-000000000007';
set session_replication_role=origin;

select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000008', 0, 0, 1
);
set session_replication_role=replica;
update public.account_deletion_requests
set auth_delete_target_user_id='10000000-0000-4000-8000-000000000008'
where id='20000000-0000-4000-8000-000000000008';
set session_replication_role=origin;
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000008')$$,
  array['23514'], 'unscrubbed Auth target'
);
set session_replication_role=replica;
update public.account_deletion_requests set auth_delete_target_user_id=null
where id='20000000-0000-4000-8000-000000000008';
set session_replication_role=origin;
do $$
declare v_definition text;
begin
  select constraint_definition into v_definition from proof_constraint_definitions
  where constraint_name='account_deletion_requests_auth_durable_shape_check';
  execute 'alter table public.account_deletion_requests add constraint '
    || quote_ident('account_deletion_requests_auth_durable_shape_check')
    || ' ' || v_definition || ' not valid';
end;
$$;
alter table public.account_deletion_requests
  validate constraint account_deletion_requests_auth_durable_shape_check;

-- I: manual/retry evidence on a retained child cannot be hidden by parent counts.
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000009', 1, 0, 1
);
set session_replication_role=replica;
update public.account_deletion_provider_targets
set last_failure_category='proof_unknown', next_retry_at=now()+interval '1 hour'
where deletion_request_id='20000000-0000-4000-8000-000000000009';
set session_replication_role=origin;
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('20000000-0000-4000-8000-000000000009')$$,
  array['23514'], 'manual or retry child evidence'
);

-- J/K: service-role forgery and completed rewrite/reversion are denied.
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000010', 0, 0, 1
);
set role service_role;
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests
      set status='completed', completed_at=now(), expires_at=now()+interval '2160 hours',
          notification_status='not_needed'
      where id='20000000-0000-4000-8000-000000000010'$$,
  array['42501'], 'service-role direct Completion forgery'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set status='completed'
      where id='20000000-0000-4000-8000-000000000010'$$,
  array['42501'], 'service-role status-only Completion forgery'
);
reset role;
select public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000010'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set status='confirmed'
      where id='20000000-0000-4000-8000-000000000010'$$,
  array['23514'], 'completed status reversion'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set expires_at=expires_at+interval '1 second'
      where id='20000000-0000-4000-8000-000000000010'$$,
  array['23514'], 'completed expiry rewrite'
);

-- L: two sessions serialize to one first write and one immutable replay.
create extension if not exists dblink with schema extensions;
create or replace function public.g5d_completion_proof_pause(p_request_id uuid, p_seconds numeric)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_already boolean;
begin
  select already_completed into v_already
  from public.finalize_account_deletion_completion(p_request_id);
  perform pg_sleep(p_seconds);
  return v_already;
end;
$$;
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000012', 0, 0, 1
);
select extensions.dblink_connect(
  'completion_first',
  'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_send_query(
  'completion_first',
  $$select public.g5d_completion_proof_pause(
      '20000000-0000-4000-8000-000000000012', 1.5
    )$$
);
select pg_sleep(0.2);
create temporary table concurrent_replay_result as
select * from public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000012'
);
select pg_temp.assert_true(
  (select already_completed and safe_reason='already_completed'
    from concurrent_replay_result),
  'concurrent second call was not immutable replay'
);
create temporary table concurrent_first_result(first_call_was_replay boolean);
insert into concurrent_first_result
select first_call_was_replay
from extensions.dblink_get_result('completion_first') as result(first_call_was_replay boolean);
select pg_temp.assert_true(
  (select first_call_was_replay is false from concurrent_first_result),
  'concurrent first call did not own the single terminal write'
);
select extensions.dblink_disconnect('completion_first');
drop function public.g5d_completion_proof_pause(uuid, numeric);

-- N/O: exact request UUID scope and unrelated retention anchors are isolated.
insert into auth.users(id,email,created_at,updated_at) values
  ('10000000-0000-4000-8000-000000000014','completion-isolation@example.invalid',now(),now());
insert into public.quota_events(
  id,user_id,event_type,status,subject_type,attempted_at,retention_expires_at
) values (
  '30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014',
  'script_generation_attempt','succeeded','script_studio',now()-interval '1 day',
  now()-interval '1 day'+interval '90 days'
);
insert into public.voice_deletion_operations(
  id,user_id,status,current_stage,snapshot_status,consent_withdrawal_status,
  post_delete_verification_status,completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at
) values (
  '40000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014',
  'completed',null,'succeeded','not_needed','succeeded',now(),now(),now()+interval '90 days'
);
create temporary table retention_anchor_before as
select
  (select retention_expires_at from public.quota_events
    where id='30000000-0000-4000-8000-000000000014') quota_anchor,
  (select audit_expires_at from public.voice_deletion_operations
    where id='40000000-0000-4000-8000-000000000014') voice_anchor;

select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000014', 0, 0, 0
);
select pg_temp.seed_completion_ready(
  '20000000-0000-4000-8000-000000000015', 0, 0, 1
);
select public.finalize_account_deletion_completion(
  '20000000-0000-4000-8000-000000000014'
);
select pg_temp.assert_true(
  (select status='confirmed' and completed_at is null
    from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000015'),
  'exact request UUID completion changed a different request'
);
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_completion('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  array['42501'], 'unknown exact request UUID'
);
select pg_temp.assert_true(
  (select before_value.quota_anchor=event.retention_expires_at
      and before_value.voice_anchor=operation.audit_expires_at
    from retention_anchor_before before_value
    join public.quota_events event
      on event.id='30000000-0000-4000-8000-000000000014'
    join public.voice_deletion_operations operation
      on operation.id='40000000-0000-4000-8000-000000000014'),
  'unrelated quota or voice retention anchor changed'
);

\o
\echo 'G5D_COMPLETION_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS'
