\set ON_ERROR_STOP on
\if :{?g5d_completion_isolated}
\else
  \echo 'disposable isolated database acknowledgement required'
  \quit 2
\endif
-- Run after g5d-completion-isolated-postgres-runtime-proof.sql in the same session.
-- Reuses that existing harness and fixture seeder; no connected/live data.
\o /dev/null
select pg_temp.seed_completion_ready('28000000-0000-4000-8000-000000000001', 1, 1, 1);
select public.finalize_account_deletion_completion('28000000-0000-4000-8000-000000000001');
create temporary table r3_completed_before as select to_jsonb(r) value from public.account_deletion_requests r
  where id='28000000-0000-4000-8000-000000000001';
create temporary table r3_unrelated_before as select id, to_jsonb(r) value from public.account_deletion_requests r
  where id<>'28000000-0000-4000-8000-000000000001';

-- No application role other than service_role may invoke the controls.
set role authenticated;
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['retained_audit'],'lh_11111111111111111111111111111111')$$,array['42501'],'unauthorized apply');
select pg_temp.expect_sqlstate($$select public.release_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001','lh_11111111111111111111111111111111','lh_22222222222222222222222222222222')$$,array['42501'],'unauthorized release');
reset role;
set role anon;
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['retained_audit'],'lh_11111111111111111111111111111111')$$,array['42501'],'anon apply');
reset role;
set role service_role;
select pg_temp.assert_true(public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['retained_audit'],'lh_11111111111111111111111111111111')='applied','authorized completed audit apply');
select pg_temp.assert_true(public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['retained_audit'],'lh_11111111111111111111111111111111')='already_applied','duplicate apply');
select pg_temp.expect_sqlstate($$update public.account_deletion_requests set legal_hold_active=false
 where id='28000000-0000-4000-8000-000000000001'$$,array['42501'],'no direct hold column grant');
reset role;

-- Every existing non-hold column must reject a simultaneous hold change. jsonb
-- populate_record assigns type-valid replacements; even future columns are covered.
do $$
declare r public.account_deletion_requests; col record; v jsonb; tested integer:=0;
begin
 select * into r from public.account_deletion_requests where id='28000000-0000-4000-8000-000000000001';
 for col in select column_name,data_type from information_schema.columns
   where table_schema='public' and table_name='account_deletion_requests'
     and column_name not like 'legal_hold_%' loop
  v:=case
   when col.data_type='timestamp with time zone' then to_jsonb(clock_timestamp()+interval '1 day')
   when col.data_type='integer' then to_jsonb(coalesce((to_jsonb(r)->>col.column_name)::integer,0)+1)
   when col.data_type='uuid' then to_jsonb('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
   when col.data_type='jsonb' then '{"changed":true}'::jsonb
   else to_jsonb('changed'::text) end;
  perform pg_temp.expect_sqlstate(format(
    'update public.account_deletion_requests set legal_hold_set_at=legal_hold_set_at+interval ''1 second'', %I=(jsonb_populate_record(null::public.account_deletion_requests,%L::jsonb)).%I where id=%L',
    col.column_name,jsonb_build_object(col.column_name,v)::text,col.column_name,r.id),
    array['23514','42501'],'completed mixed update '||col.column_name);
  tested:=tested+1;
 end loop;
 perform pg_temp.assert_true(tested=(select count(*)-6 from pg_attribute where attrelid='public.account_deletion_requests'::regclass and attnum>0 and not attisdropped) and tested>=65,'full non-hold column coverage');
end;
$$;
select pg_temp.expect_sqlstate($$update public.account_deletion_requests set updated_at=now()
 where id='28000000-0000-4000-8000-000000000001'$$,array['23514'],'ordinary completed update');
select pg_temp.expect_sqlstate($$delete from public.account_deletion_requests
 where id='28000000-0000-4000-8000-000000000001'$$,array['23514'],'held parent delete');
select pg_temp.expect_sqlstate($$delete from public.account_deletion_provider_targets
 where deletion_request_id='28000000-0000-4000-8000-000000000001'$$,array['23514'],'held Provider audit delete');
select pg_temp.expect_sqlstate($$delete from public.account_deletion_storage_targets
 where deletion_request_id='28000000-0000-4000-8000-000000000001'$$,array['23514'],'held Storage audit delete');
set role service_role;
select pg_temp.assert_true(public.release_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001','lh_11111111111111111111111111111111','lh_22222222222222222222222222222222')='released','manual release');
select pg_temp.assert_true(public.release_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001','lh_11111111111111111111111111111111','lh_22222222222222222222222222222222')='already_released','duplicate release');
select pg_temp.assert_true(public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['retained_audit'],'lh_11111111111111111111111111111111')='already_released','old apply cannot reactivate released hold');
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['owner_linkage'],'lh_33333333333333333333333333333333','lh_11111111111111111111111111111111')$$,array['23514'],'scrubbed owner cannot be restored');
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28000000-0000-4000-8000-000000000001',array['retained_audit'],'lh_33333333333333333333333333333333')$$,array['23514'],'stale apply CAS');
reset role;
select pg_temp.assert_true((select
 (to_jsonb(r)-array['legal_hold_active','legal_hold_scope','legal_hold_set_at','legal_hold_set_authority_ref','legal_hold_released_at','legal_hold_release_authority_ref','updated_at'])=
 (b.value-array['legal_hold_active','legal_hold_scope','legal_hold_set_at','legal_hold_set_authority_ref','legal_hold_released_at','legal_hold_release_authority_ref','updated_at'])
 from public.account_deletion_requests r cross join r3_completed_before b
 where r.id='28000000-0000-4000-8000-000000000001'),'all Completion fields exactly unchanged after apply/release');
select pg_temp.assert_true((select count(*)=1 from public.account_deletion_provider_targets
 where deletion_request_id='28000000-0000-4000-8000-000000000001'),'release did not delete retained targets');
select pg_temp.assert_true((select bool_and(to_jsonb(r)=b.value) from r3_unrelated_before b
 join public.account_deletion_requests r using(id)),'unrelated request/User B unchanged');
select pg_temp.assert_true((select already_completed from public.finalize_account_deletion_completion(
 '28000000-0000-4000-8000-000000000001')),'completed replay remains no-op');

-- Active, owned pre-completion fixtures. No actual Provider/Storage/Auth DELETE.
insert into auth.users(id,email,created_at,updated_at) values
 ('28100000-0000-4000-8000-000000000001','hold-a@example.invalid',now(),now()),
 ('28100000-0000-4000-8000-000000000002','hold-b@example.invalid',now(),now());
insert into public.account_deletion_requests(id,user_id,status,confirmed_at) values
 ('28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','confirmed',now()),
 ('28200000-0000-4000-8000-000000000002','28100000-0000-4000-8000-000000000002','confirmed',now());
select public.seal_account_deletion_provider_snapshot('28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001');
set role service_role;
select public.apply_account_deletion_legal_hold('28200000-0000-4000-8000-000000000001',array['provider'],'lh_44444444444444444444444444444444');
select pg_temp.assert_true((public.claim_account_deletion_provider_lease(
 '28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','28400000-0000-4000-8000-000000000001',60)).id is null,'held Provider lease refused');
select pg_temp.assert_true((select provider_runner_attempt_count=0 and provider_destructive_started_at is null
 from public.account_deletion_requests where id='28200000-0000-4000-8000-000000000001'),'held dispatch counter unchanged');
select pg_temp.expect_sqlstate($$select public.finalize_account_deletion_database_stage(
 '28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','g5d-2h.account-db.v1')$$,array['23514'],'held DB rejects before mutation');
select public.release_account_deletion_legal_hold('28200000-0000-4000-8000-000000000001','lh_44444444444444444444444444444444','lh_55555555555555555555555555555555');
select pg_temp.assert_true((public.claim_account_deletion_provider_lease(
 '28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','28400000-0000-4000-8000-000000000001',60)).provider_runner_attempt_count=1,'release resumes existing stage without reset');
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28200000-0000-4000-8000-000000000001',array['provider'],'lh_66666666666666666666666666666666','lh_44444444444444444444444444444444')$$,array['23514'],'in-flight lease prevents preservation claim');
select public.release_account_deletion_provider_lease('28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','28400000-0000-4000-8000-000000000001');
reset role;

-- Scope mapping parity, invalid scopes and no fabricated restoration.
do $$
declare s text; stage text; r public.account_deletion_requests;
begin
 select * into r from public.account_deletion_requests where id='28200000-0000-4000-8000-000000000001';
 r.legal_hold_active:=true;
 foreach s in array array['retained_audit','provider','storage','database','owner_linkage'] loop
  r.legal_hold_scope:=array[s];
  foreach stage in array array['provider','storage','database','auth','completion'] loop
   perform pg_temp.assert_true(public.account_deletion_legal_hold_blocks(r,stage) = case
     when s='retained_audit' then false
     when stage='provider' then s='provider'
     when stage='storage' then s='storage'
     when stage='database' then s in ('provider','storage','database')
     else true end, 'scope/stage mapping');
  end loop;
 end loop;
 foreach s in array array['', 'unsupported', 'person@example.invalid'] loop
  perform pg_temp.expect_sqlstate(format('select public.apply_account_deletion_legal_hold(%L,array[%L],%L)',r.id,s,'lh_77777777777777777777777777777777'),array['22023'],'invalid scope');
 end loop;
 perform pg_temp.expect_sqlstate(format('select public.apply_account_deletion_legal_hold(%L,array[''retained_audit''],%L)',r.id,'person@example.invalid'),array['22023'],'invalid authority');
end;
$$;
-- Owner-linkage scope stops the actual durable Auth authorization CAS.
insert into auth.users(id,email,created_at,updated_at) values
 ('28100000-0000-4000-8000-000000000003','hold-auth@example.invalid',now(),now());
select pg_temp.seed_completion_ready('28300000-0000-4000-8000-000000000003',0,0,0);
begin;
set local session_replication_role=replica;
update public.account_deletion_requests set user_id='28100000-0000-4000-8000-000000000003',
 auth_cleanup_status='pending',auth_intent_version=null,auth_delete_requested_at=null,
 auth_verification_attempt_count=0,auth_verified_absent_at=null,auth_sub_finalized_at=null
 where id='28300000-0000-4000-8000-000000000003';
commit;
set role service_role;
select public.seal_account_deletion_auth_intent('28300000-0000-4000-8000-000000000003','28100000-0000-4000-8000-000000000003','g5d-2m.auth-delete.v1');
select public.begin_account_deletion_auth_verification_attempt('28300000-0000-4000-8000-000000000003','28100000-0000-4000-8000-000000000003','g5d-2m.auth-delete.v1',0);
select public.record_account_deletion_auth_verification_result('28300000-0000-4000-8000-000000000003','28100000-0000-4000-8000-000000000003','g5d-2m.auth-delete.v1',1,'present');
select public.apply_account_deletion_legal_hold('28300000-0000-4000-8000-000000000003',array['owner_linkage'],'lh_88888888888888888888888888888888');
select pg_temp.assert_true((public.authorize_account_deletion_auth_delete_dispatch(
 '28300000-0000-4000-8000-000000000003','28100000-0000-4000-8000-000000000003','g5d-2m.auth-delete.v1',1)).id is null,'owner hold blocks Auth dispatch');
reset role;
select pg_temp.expect_sqlstate($$delete from auth.users where id='28100000-0000-4000-8000-000000000003'$$,array['23514'],'owner linkage FK protection');
select pg_temp.assert_true((select auth_delete_generation=0 and user_id is not null from public.account_deletion_requests
 where id='28300000-0000-4000-8000-000000000003'),'hold did not dispatch Auth');
set role service_role;
select public.release_account_deletion_legal_hold('28300000-0000-4000-8000-000000000003','lh_88888888888888888888888888888888','lh_99999999999999999999999999999999');
select pg_temp.assert_true((select auth_delete_generation=0 and auth_verification_attempt_count=1 from public.account_deletion_requests
 where id='28300000-0000-4000-8000-000000000003'),'release no auto Auth and no counter reset');
select pg_temp.assert_true((public.authorize_account_deletion_auth_delete_dispatch(
 '28300000-0000-4000-8000-000000000003','28100000-0000-4000-8000-000000000003','g5d-2m.auth-delete.v1',1)).auth_delete_generation=1,'explicit next Auth action resumes');
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold('28300000-0000-4000-8000-000000000003',array['owner_linkage'],'lh_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','lh_88888888888888888888888888888888')$$,array['23514'],'dispatch already authorized cannot claim owner preservation');
reset role;

-- Future R2 eligibility only: no purge implementation or execution.
-- The seeder is the existing one with an older fixture clock, not a production backfill.
create or replace function pg_temp.seed_expired_completion_ready(
  p_request_id uuid,
  p_provider_targets integer default 0,
  p_storage_targets integer default 0,
  p_auth_generation integer default 1
)
returns void language plpgsql as $$
declare
  v_now timestamptz := transaction_timestamp() - interval '200 days';
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
select pg_temp.seed_expired_completion_ready('28500000-0000-4000-8000-000000000001',0,0,0);
begin;
set local session_replication_role=replica;
update public.account_deletion_requests set status='completed',
 completed_at=now()-interval '199 days',last_attempted_at=now()-interval '199 days',
 expires_at=now()-interval '199 days'+interval '2160 hours',notification_status='not_needed'
 where id='28500000-0000-4000-8000-000000000001';
commit;
select pg_temp.assert_true((select expires_at<=now() and not legal_hold_active from public.account_deletion_requests
 where id='28500000-0000-4000-8000-000000000001'),'expired unheld eligible');
set role service_role;
select public.apply_account_deletion_legal_hold('28500000-0000-4000-8000-000000000001',array['retained_audit'],'lh_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
select pg_temp.assert_true((select expires_at<=now() and legal_hold_active from public.account_deletion_requests
 where id='28500000-0000-4000-8000-000000000001'),'expired held excluded');
select public.release_account_deletion_legal_hold('28500000-0000-4000-8000-000000000001','lh_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','lh_cccccccccccccccccccccccccccccccc');
select pg_temp.assert_true((select expires_at<=now() and not legal_hold_active and status='completed' from public.account_deletion_requests
 where id='28500000-0000-4000-8000-000000000001'),'expired released eligible remains present and completed');
reset role;
-- Storage uses its own lease predicate, independently of an unaffected Provider stage.
insert into auth.users(id,email,created_at,updated_at) values
 ('28100000-0000-4000-8000-000000000004','hold-storage@example.invalid',now(),now());
select pg_temp.seed_completion_ready('28300000-0000-4000-8000-000000000004',0,0,0);
begin;
set local session_replication_role=replica;
update public.account_deletion_requests set user_id='28100000-0000-4000-8000-000000000004',
 storage_cleanup_status='pending',storage_sub_finalized_at=null,storage_locator_scrubbed_at=null,
 storage_snapshot_fingerprint=repeat('a',64),db_cleanup_status='pending',db_sub_finalized_at=null,
 db_observed_row_count=0,db_retained_row_count=0,
 auth_cleanup_status='pending',auth_intent_version=null,auth_delete_requested_at=null,
 auth_verification_attempt_count=0,auth_verified_absent_at=null,auth_sub_finalized_at=null
 where id='28300000-0000-4000-8000-000000000004';
commit;
set role service_role;
select public.apply_account_deletion_legal_hold('28300000-0000-4000-8000-000000000004',array['storage'],'lh_dddddddddddddddddddddddddddddddd');
select pg_temp.assert_true((public.claim_account_deletion_storage_lease(
 '28300000-0000-4000-8000-000000000004','28100000-0000-4000-8000-000000000004','28400000-0000-4000-8000-000000000004',60)).id is null,'Storage lease held before mutation');
select pg_temp.expect_sqlstate($$update public.account_deletion_requests set status='cancelled'
 where id='28300000-0000-4000-8000-000000000004'$$,array['23514'],'held resource cannot abandon active request fence');
select public.release_account_deletion_legal_hold('28300000-0000-4000-8000-000000000004','lh_dddddddddddddddddddddddddddddddd','lh_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
select pg_temp.assert_true((public.claim_account_deletion_storage_lease(
 '28300000-0000-4000-8000-000000000004','28100000-0000-4000-8000-000000000004','28400000-0000-4000-8000-000000000004',60)).storage_runner_attempt_count=1,'Storage release preserves and resumes first attempt');
select public.release_account_deletion_storage_lease('28300000-0000-4000-8000-000000000004','28100000-0000-4000-8000-000000000004','28400000-0000-4000-8000-000000000004');
reset role;

-- Actual concurrent apply-versus-claim serialization in the existing DB harness.
create or replace function public.r3_test_apply_pause() returns text language plpgsql as $$
declare outcome text;
begin
 outcome:=public.apply_account_deletion_legal_hold('28200000-0000-4000-8000-000000000001',array['provider'],'lh_ffffffffffffffffffffffffffffffff','lh_44444444444444444444444444444444');
 perform pg_sleep(1);
 return outcome;
end;
$$;
select extensions.dblink_connect('r3_apply','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r3_apply');
select extensions.dblink_send_query('r3_apply','select public.r3_test_apply_pause()');
do $$
declare deadline timestamptz:=clock_timestamp()+interval '5 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists (select 1 from pg_stat_activity where application_name='r3_apply' and wait_event='PgSleep');
  if clock_timestamp()>deadline then raise exception 'apply did not reach locked barrier'; end if;
  perform pg_sleep(0.01);
 end loop;
end;
$$;
select pg_temp.assert_true((public.claim_account_deletion_provider_lease(
 '28200000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','28400000-0000-4000-8000-000000000001',60)).id is null,'concurrent claim rechecks newly applied hold');
select pg_temp.assert_true((select result='applied' from extensions.dblink_get_result('r3_apply') as r(result text)),'concurrent apply committed');
select extensions.dblink_disconnect('r3_apply');
drop function public.r3_test_apply_pause();
select public.release_account_deletion_legal_hold('28200000-0000-4000-8000-000000000001','lh_ffffffffffffffffffffffffffffffff','lh_0123456789abcdef0123456789abcdef');

-- Catalog proof: exact trigger order and no direct column authority.
select pg_temp.assert_true((select array_agg(tgname order by tgname) filter (where tgname in
 ('enforce_account_deletion_completion_authority','set_updated_at_account_deletion_requests')) =
 array['enforce_account_deletion_completion_authority','set_updated_at_account_deletion_requests']::name[]
 from pg_trigger where tgrelid='public.account_deletion_requests'::regclass and tgenabled='O'), 'Completion runs before system timestamp');
select pg_temp.assert_true((select bool_and(not has_column_privilege('service_role','public.account_deletion_requests',a.attname,'update'))
 from pg_attribute a where attrelid='public.account_deletion_requests'::regclass and attname like 'legal_hold_%'), 'all hold columns RPC only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.account_deletion_legal_hold_blocks(public.account_deletion_requests,text)','execute'), 'internal predicate not client-callable');
\o
\echo 'GATE5_LEGAL_HOLD_ISOLATED_TEST_PASS'
