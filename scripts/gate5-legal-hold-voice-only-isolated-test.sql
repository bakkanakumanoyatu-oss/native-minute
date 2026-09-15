\set ON_ERROR_STOP on
\if :{?g5d_completion_isolated}
\else
  \echo 'disposable isolated database acknowledgement required'
  \quit 2
\endif
-- Run after the existing Completion and R3 hold suites in the same session.
-- Fixture product rows only are seeded as admin. All hold/Voice-only authority
-- transitions below run as service_role through existing production RPCs.
-- No external adapter or network request exists in this SQL suite.
\o /dev/null
create temporary table r3_voice_cases (
 n integer primary key, user_id uuid, request_id uuid, operation_id uuid,
 target_id uuid, lease_token uuid default gen_random_uuid()
);
grant all on r3_voice_cases to service_role;
do $$
declare n integer; u uuid; r uuid;
begin
 for n in 1..7 loop
  u:=('28610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  r:=('28620000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into auth.users(id,email) values(u,'r3-voice-'||n||'@example.invalid');
  insert into public.voices(user_id,provider,provider_voice_id,label)
   values(u,'elevenlabs','r3_voice_'||n,'isolated');
  insert into public.processing_consents(user_id,consent_type,consent_version,purpose_id,purpose_version,provider_set,data_categories)
   values(u,'voice_cloning','2026-08-22.v1','voice_cloning','v1',array['elevenlabs'],array['voice_sample','consent_recording','cloned_voice','reference_audio']);
  insert into public.account_deletion_requests(id,user_id,status,confirmed_at) values(r,u,'confirmed',now());
  insert into r3_voice_cases(n,user_id,request_id) values(n,u,r);
 end loop;
end;
$$;
create function pg_temp.r3_voice_ready(p_n integer) returns void language plpgsql as $$
declare c r3_voice_cases; op uuid; payload jsonb; lease public.voice_deletion_operations;
begin
 select * into strict c from r3_voice_cases where n=p_n;
 select operation_id into op from public.create_or_get_voice_deletion_operation(c.user_id);
 select jsonb_agg(t) into payload from (
  select 'provider_voice' target_kind, 'provider-'||id target_fingerprint, id source_row_id,
   'elevenlabs' provider_name, provider_voice_id provider_resource_id
   from public.voices where user_id=c.user_id
  union all
  select 'voice_binding','binding-'||id,id,null,null from public.voices where user_id=c.user_id
 ) t;
 perform public.seal_voice_deletion_snapshot(op,c.user_id,payload);
 select * into lease from public.claim_voice_deletion_operation_lease(op,c.user_id,c.lease_token,900);
 perform public.seal_voice_deletion_consent_snapshot(op,c.user_id,c.lease_token,lease.runner_attempt_count);
 perform public.withdraw_voice_deletion_current_consents(op,c.user_id,c.lease_token,lease.runner_attempt_count);
 perform pg_temp.assert_true((select current_stage='provider_cleanup' and consent_withdrawal_status='succeeded'
  and destructive_started_at is null from public.voice_deletion_operations where id=op),'canonical Voice-only preparation');
 update r3_voice_cases set operation_id=op,target_id=(select id from public.voice_deletion_targets
  where operation_id=op and target_kind='provider_voice') where n=p_n;
end;
$$;
create function pg_temp.r3_voice_begin(p_n integer) returns integer language plpgsql as $$
declare c r3_voice_cases; t public.voice_deletion_targets;
begin
 select * into strict c from r3_voice_cases where n=p_n;
 select * into t from public.begin_provider_voice_delete_attempt(c.operation_id,c.user_id,c.target_id,c.lease_token,0);
 return t.delete_attempt_count;
end;
$$;
create function pg_temp.r3_voice_blocked(p_n integer) returns void language plpgsql as $$
declare c r3_voice_cases; before_op jsonb; before_target jsonb; blocked boolean:=false;
begin
 select * into strict c from r3_voice_cases where n=p_n;
 select to_jsonb(o) into before_op from public.voice_deletion_operations o where id=c.operation_id;
 select to_jsonb(t) into before_target from public.voice_deletion_targets t where id=c.target_id;
 begin
  perform pg_temp.r3_voice_begin(p_n);
 exception when check_violation then
  if sqlerrm <> 'legal_hold_active' then raise; end if;
  blocked:=true;
 end;
 perform pg_temp.assert_true(blocked,'P1: expected legal_hold_active, DELETE authority was granted');
 perform pg_temp.assert_true((select legal_hold_active and legal_hold_scope= array['provider']::text[]
  from public.account_deletion_requests where id=c.request_id),'P1: relevant provider hold is active');
 perform pg_temp.assert_true((select delete_attempt_count=0 and to_jsonb(t)=before_target
  from public.voice_deletion_targets t where id=c.target_id),'P1: target counter/state changed under hold');
 perform pg_temp.assert_true((select destructive_started_at is null and to_jsonb(o)=before_op
  from public.voice_deletion_operations o where id=c.operation_id),'P1: operation destructive authority/state changed');
end;
$$;
set role service_role;
-- A: exact independently accepted repro, sealed Account target matches internal
-- voice AND Provider locator. Hold precedes a NEW Voice-only operation.
select public.seal_account_deletion_provider_snapshot(request_id,user_id) from r3_voice_cases where n=1;
select public.apply_account_deletion_legal_hold(request_id,array['provider'],'lh_11111111111111111111111111111111') from r3_voice_cases where n=1;
select pg_temp.r3_voice_ready(1);
select pg_temp.assert_true((select a.user_id=v.user_id and a.source_voice_id=v.source_row_id
 and a.provider_resource_id=v.provider_resource_id from r3_voice_cases c
 join public.account_deletion_provider_targets a on a.deletion_request_id=c.request_id
 join public.voice_deletion_targets v on v.id=c.target_id where c.n=1),'exact resource binding in repro');
select pg_temp.r3_voice_blocked(1);
select pg_temp.r3_voice_blocked(1); -- repeated attempts remain blocked at zero
-- B/C: retained apply-path guard safely refuses claims over an existing operation,
-- both before seal and at provider_cleanup. Never report successful preservation.
select public.create_or_get_voice_deletion_operation(user_id) from r3_voice_cases where n=2;
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28620000-0000-4000-8000-000000000002',array['provider'],'lh_22222222222222222222222222222222')$$,
 array['23514'],'B: pre-existing pending operation rejects apply');
select pg_temp.r3_voice_ready(2);
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28620000-0000-4000-8000-000000000002',array['provider'],'lh_22222222222222222222222222222222')$$,
 array['23514'],'C: sealed/progressed operation rejects apply');
select pg_temp.assert_true((select not legal_hold_active from public.account_deletion_requests
 where id='28620000-0000-4000-8000-000000000002'),'B/C: no false successful hold');
select pg_temp.assert_true((select delete_attempt_count=0 from public.voice_deletion_targets
 where id=(select target_id from r3_voice_cases where n=2)),'B/C: apply never advances DELETE');
-- F/G/H: unrelated provider hold stays active; own retained-audit and completed
-- owner-null retained-audit hold do not prevent this owner's Provider authority.
reset role;
select pg_temp.seed_completion_ready('28620000-0000-4000-8000-000000000008');
select public.finalize_account_deletion_completion('28620000-0000-4000-8000-000000000008');
set role service_role;
select public.apply_account_deletion_legal_hold('28620000-0000-4000-8000-000000000008',array['retained_audit'],'lh_88888888888888888888888888888888');
select public.apply_account_deletion_legal_hold(request_id,array['retained_audit'],'lh_33333333333333333333333333333333') from r3_voice_cases where n=3;
select pg_temp.r3_voice_ready(3);
select pg_temp.assert_true(pg_temp.r3_voice_begin(3)=1,'F/G/H: no unrelated/audit/null-owner false block');
select pg_temp.r3_voice_blocked(1);
-- owner_linkage is Auth linkage only under existing R3 scope authority.
select public.apply_account_deletion_legal_hold(request_id,array['owner_linkage'],'lh_44444444444444444444444444444444') from r3_voice_cases where n=4;
select pg_temp.r3_voice_ready(4);
select pg_temp.assert_true(pg_temp.r3_voice_begin(4)=1,'owner_linkage does not preserve Provider');
-- Pending Account snapshots also preserve remaining Provider assets; a join only
-- against already materialized account targets would miss this case.
select public.apply_account_deletion_legal_hold(request_id,array['provider'],'lh_55555555555555555555555555555555') from r3_voice_cases where n=5;
select pg_temp.r3_voice_ready(5);
select pg_temp.r3_voice_blocked(5);
-- E: release only clears hold metadata. No counter, retry or DELETE auto-execution.
do $$
declare c r3_voice_cases; before_op jsonb; before_target jsonb;
begin
 select * into strict c from r3_voice_cases where n=1;
 select to_jsonb(o) into before_op from public.voice_deletion_operations o where id=c.operation_id;
 select to_jsonb(t) into before_target from public.voice_deletion_targets t where id=c.target_id;
 perform pg_temp.assert_true(public.release_account_deletion_legal_hold(c.request_id,
  'lh_11111111111111111111111111111111','lh_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')='released','explicit release');
 perform pg_temp.assert_true((select to_jsonb(o)=before_op from public.voice_deletion_operations o
  where id=c.operation_id),'release preserves complete operation state including counters/retry');
 perform pg_temp.assert_true((select to_jsonb(t)=before_target from public.voice_deletion_targets t
  where id=c.target_id),'release preserves complete target state');
end;
$$;
select pg_temp.assert_true((select delete_attempt_count=0 from public.voice_deletion_targets
 where id=(select target_id from r3_voice_cases where n=1)),'release does not start DELETE');
select pg_temp.assert_true(pg_temp.r3_voice_begin(1)=1,'release resumes same operation and exact target');
select pg_temp.assert_true(pg_temp.r3_voice_begin(1) is null,'existing CAS rejects blind repeated DELETE');
reset role;

-- I: two actual concurrent sessions, with observable barriers, not timing guesses.
-- Apply wins: begin must wait on request lock even when operation creation/seal
-- happen AFTER apply's active-operation check and before apply's commit.
create function public.r3_voice_apply_pause() returns text language plpgsql as $$
declare result text;
begin
 result:=public.apply_account_deletion_legal_hold('28620000-0000-4000-8000-000000000006',array['provider'],'lh_66666666666666666666666666666666');
 perform pg_sleep(2);
 return result;
end;
$$;
create function pg_temp.r3_voice_wait(p_app text) returns void language plpgsql as $$
declare deadline timestamptz:=clock_timestamp()+interval '5 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists (select 1 from pg_stat_activity where application_name=p_app and wait_event='PgSleep');
  if clock_timestamp()>deadline then raise exception 'concurrency barrier not reached'; end if;
  perform pg_sleep(0.01);
 end loop;
end;
$$;
select extensions.dblink_connect('r3_voice_apply','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r3_voice_apply');
select extensions.dblink_exec('r3_voice_apply','set role service_role');
select extensions.dblink_send_query('r3_voice_apply','select public.r3_voice_apply_pause()');
select pg_temp.r3_voice_wait('r3_voice_apply');
set role service_role;
select pg_temp.r3_voice_ready(6);
reset role;
select pg_stat_clear_snapshot();
select pg_temp.assert_true((select wait_event='PgSleep' from pg_stat_activity
 where application_name='r3_voice_apply'),'apply still uncommitted when begin starts');
set role service_role;
select pg_temp.r3_voice_blocked(6);
reset role;
select pg_temp.assert_true((select result='applied' from extensions.dblink_get_result('r3_voice_apply') as r(result text)),'concurrent apply committed');
select extensions.dblink_disconnect('r3_voice_apply');
drop function public.r3_voice_apply_pause();

-- Begin wins: apply waits for the SAME request lock and then refuses the active
-- operation. An already-authorized DELETE can never be called preserved.
set role service_role;
select pg_temp.r3_voice_ready(7);
reset role;
create function public.r3_voice_begin_pause(p_op uuid,p_user uuid,p_target uuid,p_lease uuid) returns integer language plpgsql as $$
declare t public.voice_deletion_targets;
begin
 select * into t from public.begin_provider_voice_delete_attempt(p_op,p_user,p_target,p_lease,0);
 perform pg_sleep(2);
 return t.delete_attempt_count;
end;
$$;
select extensions.dblink_connect('r3_voice_begin','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r3_voice_begin');
select extensions.dblink_exec('r3_voice_begin','set role service_role');
select extensions.dblink_send_query('r3_voice_begin',format('select public.r3_voice_begin_pause(%L,%L,%L,%L)',operation_id,user_id,target_id,lease_token)) from r3_voice_cases where n=7;
select pg_temp.r3_voice_wait('r3_voice_begin');
set role service_role;
select pg_temp.expect_sqlstate($$select public.apply_account_deletion_legal_hold(
 '28620000-0000-4000-8000-000000000007',array['provider'],'lh_77777777777777777777777777777777')$$,
 array['23514'],'concurrent begin-first apply must refuse preservation');
select pg_temp.assert_true((select not legal_hold_active from public.account_deletion_requests
 where id='28620000-0000-4000-8000-000000000007'),'begin-first no false hold');
reset role;
select pg_stat_clear_snapshot();
select pg_temp.assert_true((select wait_event is distinct from 'PgSleep' from pg_stat_activity
 where application_name='r3_voice_begin'),'apply waited for begin transaction to finish');
select pg_temp.assert_true((select result=1 from extensions.dblink_get_result('r3_voice_begin') as r(result integer)),'begin-first authority committed before failed apply');
select extensions.dblink_disconnect('r3_voice_begin');
drop function public.r3_voice_begin_pause(uuid,uuid,uuid,uuid);
select pg_temp.assert_true((select proowner='postgres'::regrole and prosecdef and proconfig @> array['search_path=pg_catalog, public']
 from pg_proc where oid='public.begin_provider_voice_delete_attempt(uuid,uuid,uuid,uuid,integer)'::regprocedure),'Voice-only RPC security');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.begin_provider_voice_delete_attempt(uuid,uuid,uuid,uuid,integer)','execute')
 and not has_function_privilege('anon','public.begin_provider_voice_delete_attempt(uuid,uuid,uuid,uuid,integer)','execute')
 and has_function_privilege('service_role','public.begin_provider_voice_delete_attempt(uuid,uuid,uuid,uuid,integer)','execute'),'Voice-only RPC ACL');
\o
\echo 'GATE5_LEGAL_HOLD_VOICE_ONLY_P1_ISOLATED_TEST_PASS; HELD_DELETE_ATTEMPTS=0; EXTERNAL_PROVIDER_DELETE=0'
