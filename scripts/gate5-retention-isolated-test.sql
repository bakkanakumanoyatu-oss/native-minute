\set ON_ERROR_STOP on
\o /dev/null
-- All identities below are synthetic local fixtures. No live observation.
create function pg_temp.r2_id(prefix text, n integer) returns uuid language sql as $$
 select (prefix || '000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.r2_before(id uuid) returns uuid language sql as $$
 select (left(id::text,24) || lpad(to_hex(('x'||right(id::text,12))::bit(48)::bigint-1),12,'0'))::uuid;
$$;
create function pg_temp.r2_seed(n integer, age_days integer, held boolean default false)
returns void language plpgsql as $$
declare u uuid:=pg_temp.r2_id('91',n); r uuid:=pg_temp.r2_id('92',n);
 q uuid:=pg_temp.r2_id('93',n); o uuid:=pg_temp.r2_id('94',n); t uuid:=pg_temp.r2_id('95',n);
 stamp timestamptz:=now()-make_interval(days=>age_days);
begin
 insert into auth.users(id) values(u);
 insert into public.quota_events(id,user_id,event_type,status,subject_type,attempted_at,metadata,idempotency_key)
 values(q,u,'script_generation_attempt','succeeded','script_studio',stamp,'{"fixture":true}', 'synthetic');
 insert into public.voice_deletion_operations(id,user_id,status,current_stage,snapshot_status,consent_withdrawal_status,
   post_delete_verification_status,completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at)
 values(o,u,'completed',null,'succeeded','not_needed','succeeded',stamp,stamp,stamp+interval '90 days');
 insert into public.voice_deletion_targets(id,operation_id,user_id,target_kind,status,delete_outcome,reconciliation_status,
   verification_status,verified_absent_at,locator_scrubbed_at)
 values(t,o,u,'voice_binding','verified_absent','not_needed','not_applicable','verified_absent',stamp,stamp);
 perform pg_temp.create_ready_request(u,r);
 if held then perform public.apply_account_deletion_legal_hold(r,array['retained_audit'],'lh_'||lpad(n::text,32,'0')); end if;
end;
$$;
create function pg_temp.r2_finalize(n integer) returns void language plpgsql as $$
begin perform public.finalize_account_deletion_database_stage(pg_temp.r2_id('92',n),pg_temp.r2_id('91',n),'g5d-2h.account-db.v1'); end;
$$;
create function pg_temp.r2_purge(resource text,id uuid, expected text) returns void language plpgsql as $$
declare result record;
begin
 select * into result from public.routine_purge_retained_evidence(resource,pg_temp.r2_before(id));
 perform pg_temp.assert_true(result.next_after_id=id and result.examined=1,'exact candidate and bound=1');
 perform pg_temp.assert_true((to_jsonb(result)->>expected)::int=1,resource||' expected '||expected||' got '||to_jsonb(result));
end;
$$;
-- Schema, role boundaries and FK contracts.
select pg_temp.assert_true((select count(*)=2 from pg_constraint where confrelid='public.account_deletion_requests'::regclass
 and conrelid in ('public.quota_events'::regclass,'public.voice_deletion_operations'::regclass)
 and confdeltype='r' and confupdtype='r'),'both restrictive FKs');
select pg_temp.assert_true(not has_column_privilege('service_role','public.quota_events','retention_account_deletion_request_id','update'),'binding update denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.routine_purge_retained_evidence(text,uuid)','execute'),'client purge denied');
select pg_temp.assert_true(not has_function_privilege('service_role','public.lock_retention_authority(uuid,uuid)','execute'),'internal helper denied');
select pg_temp.r2_seed(1,1);
select pg_temp.r2_seed(2,1);
select pg_temp.expect_sqlstate($$select public.finalize_account_deletion_database_stage(pg_temp.r2_id('92',1),pg_temp.r2_id('91',2),'g5d-2h.account-db.v1')$$,array['42501'],'wrong request isolation');
select pg_temp.r2_finalize(1);
select pg_temp.assert_true((select user_id is null and retention_account_deletion_request_id=pg_temp.r2_id('92',1)
 and identifier_scrubbed_at is not null and metadata='{}' and idempotency_key is null
 and retention_expires_at=attempted_at+interval '90 days' from public.quota_events where id=pg_temp.r2_id('93',1)),'quota binding and scrub');
select pg_temp.assert_true((select user_id is null and retention_account_deletion_request_id=pg_temp.r2_id('92',1)
 from public.voice_deletion_operations where id=pg_temp.r2_id('94',1)),'voice binding');
select pg_temp.assert_true((select user_id is null from public.voice_deletion_targets where id=pg_temp.r2_id('95',1)),'target owner cascade');
select pg_temp.assert_true((select user_id=pg_temp.r2_id('91',2) and retention_account_deletion_request_id is null
 from public.quota_events where id=pg_temp.r2_id('93',2)),'other owner unchanged');
select pg_temp.r2_finalize(1); -- replay
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',1),'skipped_not_expired');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',1),'skipped_not_expired');
select pg_temp.expect_sqlstate($$delete from public.account_deletion_requests where id=pg_temp.r2_id('92',1)$$,array['23503'],'FK prevents premature parent deletion');
select pg_temp.expect_sqlstate($$update public.quota_events set retention_account_deletion_request_id=pg_temp.r2_id('92',2) where id=pg_temp.r2_id('93',1)$$,array['23514'],'binding cannot change');
select pg_temp.expect_sqlstate($$insert into public.quota_events(user_id,event_type,status,subject_type,identifier_scrubbed_at) values(null,'script_generation_attempt','succeeded','script_studio',now())$$,array['23514'],'new unbound owner-null insert rejected');
-- Late forced rollback includes BOTH quota/voice bindings and their scrubs.
create function public.r2_force_rollback() returns trigger language plpgsql as $$
begin if old.id=pg_temp.r2_id('91',2) then raise exception 'synthetic rollback'; end if; return old; end;
$$;
create trigger r2_force_rollback before delete on public.profiles for each row execute function public.r2_force_rollback();
select pg_temp.expect_sqlstate($$select pg_temp.r2_finalize(2)$$,array['P0001'],'late rollback');
select pg_temp.assert_true((select user_id=pg_temp.r2_id('91',2) and identifier_scrubbed_at is null
 and retention_account_deletion_request_id is null and metadata='{"fixture":true}' from public.quota_events where id=pg_temp.r2_id('93',2)),'quota rollback');
select pg_temp.assert_true((select user_id=pg_temp.r2_id('91',2) and retention_account_deletion_request_id is null
 from public.voice_deletion_operations where id=pg_temp.r2_id('94',2)),'voice rollback');
select pg_temp.assert_true((select user_id=pg_temp.r2_id('91',2) from public.voice_deletion_targets where id=pg_temp.r2_id('95',2)),'target rollback');
drop trigger r2_force_rollback on public.profiles;
drop function public.r2_force_rollback();
select pg_temp.r2_finalize(2);
-- Expired retained_audit evidence must survive Account finalization and release.
select pg_temp.r2_seed(3,91,true);
select pg_temp.r2_finalize(3);
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',3),'skipped_hold');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',3),'skipped_hold');
select pg_temp.expect_sqlstate($$delete from public.voice_deletion_targets where id=pg_temp.r2_id('95',3)$$,array['23514'],'target bypass denied');
select pg_temp.expect_sqlstate($$delete from public.quota_events where id=pg_temp.r2_id('93',3)$$,array['23514'],'quota held mutation boundary');
select public.release_account_deletion_legal_hold(pg_temp.r2_id('92',3),'lh_'||lpad('3',32,'0'),'lh_'||repeat('a',32));
select pg_temp.assert_true(exists(select 1 from public.quota_events where id=pg_temp.r2_id('93',3)),'release does not purge');
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',3),'purged');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',3),'purged');
select pg_temp.assert_true(not exists(select 1 from public.voice_deletion_targets where id=pg_temp.r2_id('95',3)),'voice target purge cascade');
-- Owner-present path checks all owner requests, also before Account finalization.
select pg_temp.r2_seed(4,91,true);
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',4),'skipped_hold');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',4),'skipped_hold');
select public.release_account_deletion_legal_hold(pg_temp.r2_id('92',4),'lh_'||lpad('4',32,'0'),'lh_'||repeat('b',32));
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',4),'purged');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',4),'purged');
-- Existing finalizer still purges unheld expired evidence (no retained binding).
select pg_temp.r2_seed(5,91);
select pg_temp.r2_finalize(5);
select pg_temp.assert_true(not exists(select 1 from public.quota_events where id=pg_temp.r2_id('93',5))
 and not exists(select 1 from public.voice_deletion_operations where id=pg_temp.r2_id('94',5)),'expired unheld finalizer partition');
-- Active/incomplete with an expiry remains unsafe. Independent legitimate owner.
insert into auth.users(id) values(pg_temp.r2_id('91',6));
insert into public.voice_deletion_operations(id,user_id,status,audit_expires_at)
 values(pg_temp.r2_id('94',6),pg_temp.r2_id('91',6),'pending',now()-interval '1 day');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',6),'skipped_unsafe');
-- Legacy fixtures simulate pre-0029 persisted rows; not a supported insertion path.
begin;
set local session_replication_role=replica;
insert into public.quota_events(id,user_id,event_type,status,subject_type,attempted_at,retention_expires_at,identifier_scrubbed_at)
 values(pg_temp.r2_id('93',7),null,'script_generation_attempt','succeeded','script_studio',now()-interval '100 days',now()-interval '10 days',now()-interval '99 days');
insert into public.voice_deletion_operations(id,user_id,status,snapshot_status,consent_withdrawal_status,post_delete_verification_status,
 completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at)
 values(pg_temp.r2_id('94',7),null,'completed','succeeded','not_needed','succeeded',now()-interval '100 days',now()-interval '100 days',now()-interval '10 days');
commit;
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',7),'legacy_hold_linkage_unresolved');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',7),'legacy_hold_linkage_unresolved');
select pg_temp.expect_sqlstate($$delete from public.voice_deletion_operations where id=pg_temp.r2_id('94',7)$$,array['23514'],'legacy direct purge denied');
-- Account lifetime/cascade. Older timestamps are synthetic passage-of-time fixtures.
select pg_temp.seed_completion_ready(pg_temp.r2_id('96',1),1,1,1);
select public.finalize_account_deletion_completion(pg_temp.r2_id('96',1));
select pg_temp.r2_purge('account',pg_temp.r2_id('96',1),'skipped_not_expired');
begin;
set local session_replication_role=replica;
do $$
declare tbl text; assignments text;
begin
 foreach tbl in array array['account_deletion_requests','account_deletion_provider_targets','account_deletion_storage_targets'] loop
  select string_agg(format('%I=%I-interval ''100 days''',attname,attname),',') into assignments from pg_attribute
   where attrelid=('public.'||tbl)::regclass and attnum>0 and not attisdropped and atttypid='timestamptz'::regtype;
  execute format('update public.%I set %s where %I=$1',tbl,assignments,
   case when tbl='account_deletion_requests' then 'id' else 'deletion_request_id' end) using pg_temp.r2_id('96',1);
 end loop;
end;
$$;
-- Unexpired child deliberately violates normal chronological forward seeding:
-- even corrupted ordering must NOT make Account expiry cascade retained rows.
update public.quota_events set retention_account_deletion_request_id=pg_temp.r2_id('96',1) where id=pg_temp.r2_id('93',1);
update public.voice_deletion_operations set retention_account_deletion_request_id=pg_temp.r2_id('96',1) where id=pg_temp.r2_id('94',1);
commit;
select pg_temp.r2_purge('account',pg_temp.r2_id('96',1),'skipped_unsafe');
select pg_temp.assert_true(exists(select 1 from public.quota_events where id=pg_temp.r2_id('93',1)),'independent expiry preserved');
select public.apply_account_deletion_legal_hold(pg_temp.r2_id('96',1),array['retained_audit'],'lh_'||repeat('c',32));
select pg_temp.r2_purge('account',pg_temp.r2_id('96',1),'skipped_hold');
select pg_temp.assert_true((select count(*)=1 from public.account_deletion_provider_targets where deletion_request_id=pg_temp.r2_id('96',1))
 and (select count(*)=1 from public.account_deletion_storage_targets where deletion_request_id=pg_temp.r2_id('96',1)),'held account children remain');
select public.release_account_deletion_legal_hold(pg_temp.r2_id('96',1),'lh_'||repeat('c',32),'lh_'||repeat('d',32));
begin;
set local session_replication_role=replica;
-- Restore the intentional anomalous test binding, never a product repair.
update public.quota_events set retention_account_deletion_request_id=pg_temp.r2_id('92',1) where id=pg_temp.r2_id('93',1);
commit;
select pg_temp.r2_purge('account',pg_temp.r2_id('96',1),'skipped_unsafe');
select pg_temp.assert_true(exists(select 1 from public.voice_deletion_operations where id=pg_temp.r2_id('94',1)),
 'unexpired Voice alone survives expired Account');
begin;
set local session_replication_role=replica;
update public.voice_deletion_operations set retention_account_deletion_request_id=pg_temp.r2_id('92',1) where id=pg_temp.r2_id('94',1);
commit;
select pg_temp.r2_purge('account',pg_temp.r2_id('96',1),'purged');
select pg_temp.assert_true(not exists(select 1 from public.account_deletion_provider_targets where deletion_request_id=pg_temp.r2_id('96',1))
 and not exists(select 1 from public.account_deletion_storage_targets where deletion_request_id=pg_temp.r2_id('96',1)),'legitimate parent cascade');
select pg_temp.r2_purge('account',pg_temp.r2_id('92',4),'skipped_unsafe');
-- Exact evidence preservation fails if purge already won; request-only remains a
-- statement about remaining evidence, not proof of a specified missing row.
select pg_temp.expect_sqlstate($$select public.apply_retained_evidence_legal_hold(pg_temp.r2_id('92',3),array[pg_temp.r2_id('93',3)],'{}','lh_'||repeat('e',32),'lh_'||lpad('3',32,'0'))$$,array['23514'],'missing exact quota unavailable');
select pg_temp.expect_sqlstate($$select public.apply_retained_evidence_legal_hold(pg_temp.r2_id('92',2),array[pg_temp.r2_id('93',1)],'{}','lh_'||repeat('e',32))$$,array['23514'],'wrong request unavailable');
select pg_temp.assert_true((select examined=0 and purged=0 from public.routine_purge_retained_evidence('quota','ffffffff-ffff-ffff-ffff-ffffffffffff')),'exhausted and repeated invocation safe');
select pg_temp.assert_true((select examined=0 and purged=0 from public.routine_purge_retained_evidence('quota','ffffffff-ffff-ffff-ffff-ffffffffffff')),'idempotent exhausted invocation');
\o
\echo 'R2_LINKAGE_LIFETIME_PURGE_ISOLATED_PASS'
\o /dev/null
-- Real overlapping transactions. Barrier is observable pg_stat_activity PgSleep,
-- not a timing assumption. Every operation uses the actual 0029 DB authority.
create function pg_temp.r2_wait(app text) returns void language plpgsql as $$
declare deadline timestamptz:=clock_timestamp()+interval '8 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select 1 from pg_stat_activity where application_name=app and wait_event='PgSleep');
  if clock_timestamp()>deadline then raise exception 'r2 barrier timeout'; end if;
  perform pg_sleep(0.01);
 end loop;
end;
$$;
select pg_temp.r2_seed(8,91,true);
select pg_temp.r2_finalize(8);
select public.release_account_deletion_legal_hold(pg_temp.r2_id('92',8),'lh_'||lpad('8',32,'0'),'lh_'||repeat('8',32));
create function public.r2_pause_hold() returns text language plpgsql as $$
declare outcome text;
begin
 outcome:=public.apply_retained_evidence_legal_hold('92000000-0000-4000-8000-000000000008',
 array['93000000-0000-4000-8000-000000000008']::uuid[],array['94000000-0000-4000-8000-000000000008']::uuid[],
 'lh_88888888888888888888888888888888','lh_00000000000000000000000000000008');
 perform pg_sleep(1);
 return outcome;
end;
$$;
select extensions.dblink_connect('r2_hold','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r2_hold');
select extensions.dblink_send_query('r2_hold','select public.r2_pause_hold()');
select pg_temp.r2_wait('r2_hold');
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',8),'skipped_unsafe'); -- busy, no mutation
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',8),'skipped_unsafe');
select pg_temp.assert_true((select outcome='applied' from extensions.dblink_get_result('r2_hold') as r(outcome text)),'hold committed');
select extensions.dblink_disconnect('r2_hold');
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',8),'skipped_hold');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',8),'skipped_hold');
drop function public.r2_pause_hold();
-- Purge wins first; exact-evidence hold waits on the same request and then rejects.
select pg_temp.r2_seed(9,91,true);
select pg_temp.r2_finalize(9);
select public.release_account_deletion_legal_hold(pg_temp.r2_id('92',9),'lh_'||lpad('9',32,'0'),'lh_'||repeat('9',32));
create function public.r2_pause_purge() returns integer language plpgsql as $$
declare count integer;
begin
 select purged into count from public.routine_purge_retained_evidence('quota','93000000-0000-4000-8000-000000000008');
 perform pg_sleep(1);
 return count;
end;
$$;
select extensions.dblink_connect('r2_purge','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r2_purge');
select extensions.dblink_send_query('r2_purge','select public.r2_pause_purge()');
select pg_temp.r2_wait('r2_purge');
select pg_temp.expect_sqlstate($$select public.apply_retained_evidence_legal_hold(
 '92000000-0000-4000-8000-000000000009',array['93000000-0000-4000-8000-000000000009']::uuid[],'{}',
 'lh_99999999999999999999999999999999','lh_00000000000000000000000000000009')$$,array['23514'],'purge-first exact hold unavailable');
select pg_temp.assert_true((select outcome=1 from extensions.dblink_get_result('r2_purge') as r(outcome integer)),'purge first committed');
select extensions.dblink_disconnect('r2_purge');
drop function public.r2_pause_purge();
select pg_temp.assert_true((select not legal_hold_active from public.account_deletion_requests where id=pg_temp.r2_id('92',9)),'no false preservation success');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',9),'purged'); -- locks released
-- Actual pending -> processing operation transition with an old expiry.
create function public.r2_pause_transition() returns text language plpgsql as $$
begin
 update public.voice_deletion_operations set status='processing',current_stage='snapshot'
 where id='94000000-0000-4000-8000-000000000006';
 perform pg_sleep(1); return 'transitioned';
end;
$$;
select extensions.dblink_connect('r2_transition','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r2_transition');
select extensions.dblink_send_query('r2_transition','select public.r2_pause_transition()');
select pg_temp.r2_wait('r2_transition');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',6),'skipped_unsafe');
select pg_temp.assert_true((select outcome='transitioned' from extensions.dblink_get_result('r2_transition') as r(outcome text)),'transition committed');
select extensions.dblink_disconnect('r2_transition');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',6),'skipped_unsafe');
select pg_temp.assert_true((select status='processing' from public.voice_deletion_operations where id=pg_temp.r2_id('94',6)),'fresh active state preserved');
drop function public.r2_pause_transition();
-- Future anchors cannot be attached to current DB finalization.
select pg_temp.r2_seed(10,-1);
select pg_temp.expect_sqlstate($$select pg_temp.r2_finalize(10)$$,array['23514'],'future binding anchor rejected');
select pg_temp.assert_true((select retention_account_deletion_request_id is null and user_id is not null from public.quota_events where id=pg_temp.r2_id('93',10)),'invalid lifetime left no partial binding');
-- No lock leak from any skipped candidate: a separate session can acquire fences.
select extensions.dblink_connect('r2_probe','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres application_name=r2_probe');
select pg_temp.assert_true((select ok from extensions.dblink('r2_probe',
 $$select pg_try_advisory_xact_lock(hashtextextended('g5c-b4-voice-assets:91000000-0000-4000-8000-000000000006',0))$$) as r(ok boolean)),'owner lock released');
select pg_temp.assert_true((select count(*)=1 from extensions.dblink('r2_probe',
 $$select id from public.voice_deletion_operations where id='94000000-0000-4000-8000-000000000006' for update nowait$$) as r(id uuid)),'target lock released');
select extensions.dblink_disconnect('r2_probe');
\o
\echo 'R2_CONCURRENCY_BOTH_ORDERS_TRANSITION_LOCK_RELEASE_PASS'
\o /dev/null
select pg_temp.assert_true((select to_jsonb(q)-'retention_account_deletion_request_id'=b.value
 from public.quota_events q join r2_fixture.before_linkage b on b.kind='quota' and b.value->>'id'=q.id::text
 where q.id='f1000000-0000-4000-8000-000000000001'),'pre-0029 legacy quota byte-equivalent fields');
select pg_temp.assert_true((select to_jsonb(o)-'retention_account_deletion_request_id'=b.value
 from public.voice_deletion_operations o join r2_fixture.before_linkage b on b.kind='voice' and b.value->>'id'=o.id::text
 where o.id='f2000000-0000-4000-8000-000000000001'),'pre-0029 legacy voice byte-equivalent fields');
select pg_temp.r2_purge('quota','f1000000-0000-4000-8000-000000000001','legacy_hold_linkage_unresolved');
select pg_temp.r2_purge('voice','f2000000-0000-4000-8000-000000000001','legacy_hold_linkage_unresolved');
-- No scope expansion: owner_linkage does not block scrubbed retained audit.
select pg_temp.r2_seed(11,91,true);
select pg_temp.r2_finalize(11);
select public.release_account_deletion_legal_hold(pg_temp.r2_id('92',11),'lh_'||lpad('11',32,'0'),'lh_'||repeat('1',32));
select public.apply_account_deletion_legal_hold(pg_temp.r2_id('92',11),array['owner_linkage'],'lh_'||repeat('2',32),'lh_'||lpad('11',32,'0'));
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',11),'purged');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',11),'purged');
-- Database hold keeps its pre-finalization database authority.
select pg_temp.r2_seed(12,91);
select public.apply_account_deletion_legal_hold(pg_temp.r2_id('92',12),array['database'],'lh_'||repeat('3',32));
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',12),'skipped_hold');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',12),'skipped_hold');
-- Voice alone still RESTRICTs the Account request after quota has been purged.
select pg_temp.r2_seed(13,91,true);
select pg_temp.r2_finalize(13);
select public.release_account_deletion_legal_hold(pg_temp.r2_id('92',13),'lh_'||lpad('13',32,'0'),'lh_'||repeat('4',32));
select pg_temp.r2_purge('quota',pg_temp.r2_id('93',13),'purged');
select pg_temp.expect_sqlstate($$delete from public.account_deletion_requests where id=pg_temp.r2_id('92',13)$$,array['23503'],'voice FK independently restricts parent');
select pg_temp.r2_purge('voice',pg_temp.r2_id('94',13),'purged');
-- The exposed RPC and finalizer execute as service_role (not only postgres).
select pg_temp.r2_seed(14,1);
set role service_role;
select public.finalize_account_deletion_database_stage('92000000-0000-4000-8000-000000000014','91000000-0000-4000-8000-000000000014','g5d-2h.account-db.v1');
select pg_temp.r2_purge('quota','93000000-0000-4000-8000-000000000014','skipped_not_expired');
select pg_temp.expect_sqlstate($$update public.quota_events set retention_account_deletion_request_id='92000000-0000-4000-8000-000000000013' where id='93000000-0000-4000-8000-000000000014'$$,array['42501'],'service binding bypass denied');
reset role;
\o
\echo 'R2_LEGACY_MIGRATION_SCOPE_ISOLATION_SERVICE_ROLE_PASS'
