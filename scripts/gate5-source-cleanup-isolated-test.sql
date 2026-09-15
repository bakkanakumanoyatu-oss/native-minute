\set ON_ERROR_STOP on
\o /dev/null
-- Synthetic fixtures only. Clock shifting below is privileged TEST setup; product
-- timestamps and guards are never bypassed by the transitions being tested.
create schema r1_test;
create function r1_test.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'R1 assertion: %',label; end if; end; $$;
create function r1_test.reject(statement text,fragment text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if position(fragment in sqlerrm)>0 then return; end if;
   raise exception 'wrong rejection: %, wanted %',sqlerrm,fragment;
 end;
 raise exception 'expected rejection: %',fragment;
end; $$;
create table r1_test.fixture(n integer primary key,u uuid,c uuid,s uuid,r uuid,v uuid,t uuid,op uuid);
create function r1_test.seed(n integer, complete_voice boolean default true) returns void language plpgsql as $$
declare u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid; r uuid; v uuid; t uuid:=gen_random_uuid(); i public.voice_asset_write_intents; op uuid;
begin
 insert into auth.users(id) values(u);
 i:=public.reserve_voice_asset_write_intent(u,'voice_consent_upload',t,900,null,null,null,'voice-consents',u||'/consent.wav');
 r:=i.id;
 perform public.finalize_voice_upload_write_intent(r,u,t,'voice-consents',u||'/consent.wav');
 i:=public.reserve_voice_source_registration(u,'voice_consent_create',t,c,'mock',null,'storage://voice-consents/'||u||'/consent.wav');
 perform public.begin_voice_source_registration(i.id,u,t);
 perform public.finish_voice_consent_source_read(i.id,u,t,true);
 perform public.finalize_voice_consent_write_intent(i.id,u,t,clock_timestamp(),jsonb_build_object(
   'recording',jsonb_build_object('audioPath','storage://voice-consents/'||u||'/consent.wav'),
   'termsAcceptedAt',clock_timestamp(),'providerConsentId','fixture-only'));
 perform r1_test.assert((select first_registered_at is null and cleanup_due_at is null from public.voice_asset_write_intents where id=r),'consent success is not anchor');
 insert into public.processing_consents(user_id,consent_type,consent_version,purpose_id,purpose_version,provider_set,data_categories,status)
 values(u,'voice_cloning','2026-08-22.v1','voice_cloning','v1',array['elevenlabs'],array['voice_sample','consent_recording','cloned_voice','reference_audio'],'active');
 i:=public.reserve_voice_asset_write_intent(u,'voice_sample_upload',t,900,null,null,null,'voice-samples',u||'/'||c||'/sample.wav');
 s:=i.id;
 perform public.finalize_voice_upload_write_intent(s,u,t,'voice-samples',u||'/'||c||'/sample.wav');
 i:=public.reserve_voice_source_registration(u,'voice_create',t,c,'mock','storage://voice-samples/'||u||'/'||c||'/sample.wav');
 op:=i.id;
 if complete_voice then
 perform public.begin_voice_source_registration(i.id,u,t);
 select id into v from public.finalize_voice_create_write_intent(i.id,u,t,c,'fixture-voice','Fixture','storage://voice-samples/'||u||'/'||c||'/sample.wav');
 end if;
 insert into r1_test.fixture values(n,u,c,s,r,v,t,op);
end; $$;
create function r1_test.age_source(source_id uuid,age interval) returns void language plpgsql as $$
declare stamp timestamptz:=clock_timestamp()-age;
begin
 -- Simulate elapsed wall-clock time, preserving the fixed 24 elapsed-hour pair.
 perform set_config('session_replication_role','replica',true);
 update public.voice_asset_write_intents set first_registered_at=stamp,cleanup_due_at=stamp+interval '24 hours' where id=source_id;
 perform set_config('session_replication_role','origin',true);
end; $$;
create function r1_test.reserve(n integer) returns uuid language plpgsql as $$
declare f r1_test.fixture; i public.voice_asset_write_intents;
begin
 select * into f from r1_test.fixture where fixture.n=reserve.n;
 i:=public.reserve_voice_source_registration(f.u,'voice_create',f.t,f.c,'mock','storage://voice-samples/'||f.u||'/'||f.c||'/sample.wav');
 return i.id;
end; $$;
create function r1_test.finish(n integer,operation_id uuid) returns void language plpgsql as $$
declare f r1_test.fixture;
begin
 select * into f from r1_test.fixture where fixture.n=finish.n;
 perform public.begin_voice_source_registration(operation_id,f.u,f.t);
 perform public.finalize_voice_create_write_intent(operation_id,f.u,f.t,f.c,'fixture-next','Next','storage://voice-samples/'||f.u||'/'||f.c||'/sample.wav');
end; $$;

select r1_test.seed(n) from generate_series(1,18) n;
-- All genuine first-success anchors exactly share voice transaction state.
select r1_test.assert((select bool_and(s.first_registration_intent_id=f.op and s.first_registered_at is not null
 and s.cleanup_due_at=s.first_registered_at+interval '24 hours' and s.cleanup_state='available')
 from r1_test.fixture f join public.voice_asset_write_intents s on s.id in (f.s,f.r)),'first anchors exact');
select r1_test.assert((select bool_and(u.requires_audio=(s.kind='voice_sample_upload')) from public.voice_source_uses u
 join public.voice_asset_write_intents s on s.id=u.source_upload_intent_id join r1_test.fixture f on f.op=u.registration_intent_id),'sample audio vs consent evidence');
select r1_test.assert(not has_function_privilege('service_role','public.r1_base_reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text)','execute'),'no legacy reserve bypass');
select r1_test.assert(not has_table_privilege('authenticated','public.voice_source_uses','insert'),'no client binding');
select r1_test.assert(not has_table_privilege('service_role','public.voice_source_uses','update'),'no direct service binding edits');
select r1_test.reject(format('select public.reserve_voice_asset_write_intent(%L,''voice_create'',%L,900)',u,t),'source_reservation_required') from r1_test.fixture where n=1;
select r1_test.reject(format('update public.voice_asset_write_intents set cleanup_due_at=cleanup_due_at+interval ''1 hour'' where id=%L',s),'r1_clock_immutable') from r1_test.fixture where n=1;
-- T0+10h later success, T0+15h lost-response recovery: no clock rewrite.
select r1_test.age_source(s,interval '10 hours') from r1_test.fixture where n=1;
create table r1_test.clock_before as select id,first_registered_at,first_registration_intent_id,cleanup_due_at from public.voice_asset_write_intents;
select r1_test.finish(1,r1_test.reserve(1));
select public.finalize_voice_create_write_intent(f.op,f.u,f.t,f.c,'ignored-response','Ignored','storage://voice-samples/'||f.u||'/'||f.c||'/sample.wav')
 from r1_test.fixture f where n=1;
select r1_test.assert((select bool_and((s.first_registered_at,s.first_registration_intent_id,s.cleanup_due_at)=
 (b.first_registered_at,b.first_registration_intent_id,b.cleanup_due_at)) from r1_test.clock_before b join public.voice_asset_write_intents s using(id)),'later success/recovery fixed due');
-- T0+23h admission, due crossing, unresolved use blocks even when lease expires.
select r1_test.age_source(s,interval '23 hours') from r1_test.fixture where n=2;
create table r1_test.pending(n int primary key,op uuid);
insert into r1_test.pending values(2,r1_test.reserve(2));
select r1_test.age_source(s,interval '24 hours 1 second') from r1_test.fixture where n=2;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='in_flight_use','due nonterminal block') from r1_test.fixture where n=2;
select r1_test.finish(2,(select op from r1_test.pending where n=2));
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','terminal immediately eligible') from r1_test.fixture where n=2;
select r1_test.assert(public.finish_voice_source_cleanup(s,t,'cleanup_succeeded'),'finish') from r1_test.fixture where n=2;
select r1_test.reject(format('select r1_test.reserve(%s)',2),'source_reupload_required');
-- Due-first new admission rejects even before any claim. No new intent committed.
select r1_test.age_source(s,interval '24 hours 1 second') from r1_test.fixture where n=3;
select r1_test.reject('select r1_test.reserve(3)','source_reupload_required');
select r1_test.assert(not exists(select 1 from public.voice_asset_write_intents i join r1_test.fixture f on i.user_id=f.u
 where f.n=3 and i.status='reserved'),'reject rolls back operation');
-- Claim first, lease CAS, crash expiry and retry retain original clock/authority.
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=4;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','claim first') from r1_test.fixture where n=4;
select r1_test.assert((public.claim_voice_source_cleanup(s,gen_random_uuid())->>'reason')='claim_conflict','second worker blocked') from r1_test.fixture where n=4;
select r1_test.reject('select r1_test.reserve(4)','source_reupload_required');
create table r1_test.claim_before as select id,first_registered_at,cleanup_due_at,cleanup_authorized_at from public.voice_asset_write_intents where cleanup_state='claimed';
update public.voice_asset_write_intents set cleanup_lease_expires_at=clock_timestamp()-interval '1 second' where id=(select s from r1_test.fixture where n=4);
select r1_test.assert(not public.finish_voice_source_cleanup(s,t,'cleanup_succeeded'),'expired worker CAS rejected') from r1_test.fixture where n=4;
update r1_test.fixture set t=gen_random_uuid() where n=4;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','crash reclaim') from r1_test.fixture where n=4;
select r1_test.assert(public.finish_voice_source_cleanup(s,t,'verification_failure'),'verification failure stored') from r1_test.fixture where n=4;
select r1_test.assert((select bool_and((s.first_registered_at,s.cleanup_due_at,s.cleanup_authorized_at)=(b.first_registered_at,b.cleanup_due_at,b.cleanup_authorized_at))
 from r1_test.claim_before b join public.voice_asset_write_intents s using(id)),'retry clocks immutable');
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','retry failure') from r1_test.fixture where n=4;
select r1_test.assert(public.finish_voice_source_cleanup(s,t,'already_absent'),'already absent idempotent') from r1_test.fixture where n=4;
-- Separate sample success / consent failure. Evidence rows untouched by cleanup.
select r1_test.age_source(x,interval '25 hours') from r1_test.fixture f cross join lateral (values(f.s),(f.r)) q(x) where n=5;
create table r1_test.evidence as select c.* from public.voice_consents c join r1_test.fixture f on c.id=f.c where n=5;
select public.claim_voice_source_cleanup(s,t) from r1_test.fixture where n=5;
select public.finish_voice_source_cleanup(s,t,'cleanup_succeeded') from r1_test.fixture where n=5;
select public.claim_voice_source_cleanup(r,t) from r1_test.fixture where n=5;
select public.finish_voice_source_cleanup(r,t,'storage_delete_transient_failure') from r1_test.fixture where n=5;
select r1_test.assert((select s.cleanup_state='completed' and r.cleanup_state='claimed' and r.cleanup_failure='storage_delete_transient_failure'
 from r1_test.fixture f join public.voice_asset_write_intents s on s.id=f.s join public.voice_asset_write_intents r on r.id=f.r where n=5),'partial states');
select r1_test.assert((select to_jsonb(c)=to_jsonb(e) from r1_test.evidence e join public.voice_consents c using(id)),'consent evidence preserved');
select r1_test.assert(exists(select 1 from public.processing_consents p join r1_test.fixture f on f.u=p.user_id where n=5 and p.status='active'),'processing evidence preserved');
-- Completed consent audio can still be evidence for a fresh sample registration.
select public.claim_voice_source_cleanup(r,t) from r1_test.fixture where n=5;
select public.finish_voice_source_cleanup(r,t,'already_absent') from r1_test.fixture where n=5;
select r1_test.reject(format('select public.reserve_voice_source_registration(%L,''voice_consent_create'',%L,%L,''mock'',null,%L)',u,t,gen_random_uuid(),'storage://voice-consents/'||u||'/consent.wav'),'source_reupload_required') from r1_test.fixture where n=5;
-- Cross-owner and changed bindings reject before any execution.
select r1_test.reject(format('select public.reserve_voice_source_registration(%L,''voice_consent_create'',%L,%L,''mock'',null,%L)',a.u,a.t,gen_random_uuid(),'storage://voice-consents/'||b.u||'/consent.wav'),'unsafe_locator_or_ownership') from r1_test.fixture a,r1_test.fixture b where a.n=6 and b.n=7;
-- Cancel-before-dispatch fences a stale process; cancel-after-dispatch cannot
-- assert terminality while a reader/provider may still be running.
insert into r1_test.pending values(6,r1_test.reserve(6));
select public.cancel_voice_asset_write_intent(p.op,f.u,f.t,true) from r1_test.pending p join r1_test.fixture f using(n) where n=6;
select r1_test.reject(format('select public.begin_voice_source_registration(%L,%L,%L)',p.op,f.u,f.t),'registration_execution_rejected') from r1_test.pending p join r1_test.fixture f using(n) where n=6;
insert into r1_test.pending values(7,r1_test.reserve(7));
select public.begin_voice_source_registration(p.op,f.u,f.t) from r1_test.pending p join r1_test.fixture f using(n) where n=7;
select r1_test.reject(format('select public.cancel_voice_asset_write_intent(%L,%L,%L,true)',p.op,f.u,f.t),'registration_execution_unresolved') from r1_test.pending p join r1_test.fixture f using(n) where n=7;
update public.voice_asset_write_intents set lease_expires_at=clock_timestamp()-interval '1 second' where id=(select op from r1_test.pending where n=7);
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=7;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='in_flight_use','expired business use still blocks') from r1_test.fixture where n=7;
-- Legacy/malformed lifecycle stays unknown, no implicit backfill from locator.
select set_config('session_replication_role','replica',false);
update public.voice_asset_write_intents set source_lifecycle_known=false,cleanup_state=null where id=(select s from r1_test.fixture where n=8);
select set_config('session_replication_role','origin',false);
select r1_test.reject('select r1_test.reserve(8)','malformed_canonical_state');
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=8;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='malformed_canonical_state','unknown cleanup fail closed') from r1_test.fixture where n=8;
-- Preserve original singleton: parallel start is not newly enabled by R1.
insert into r1_test.pending values(9,r1_test.reserve(9));
select r1_test.reject('select r1_test.reserve(9)','voice_asset_writer_in_progress');
-- Fixed future anchor rejects not_due, without claiming anything.
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='not_due','not due') from r1_test.fixture where n=10;
-- A failed voice finalization rolls back voice and source anchors atomically.
insert into r1_test.pending values(10,r1_test.reserve(10));
select public.begin_voice_source_registration(p.op,f.u,f.t) from r1_test.pending p join r1_test.fixture f using(n) where n=10;
select r1_test.reject(format('select public.finalize_voice_create_write_intent(%L,%L,%L,%L,''provider'','''',%L)',p.op,f.u,f.t,f.c,'storage://voice-samples/'||f.u||'/'||f.c||'/sample.wav'),'voice create writer finalization rejected') from r1_test.pending p join r1_test.fixture f using(n) where n=10;
select r1_test.assert((select i.status='reserved' from public.voice_asset_write_intents i join r1_test.pending p on i.id=p.op where n=10),'failed finalizer keeps unresolved');
-- Bounded cursor advances past blocked and malformed targets; no candidate loop.
do $$declare cursor_id uuid; next_id uuid; count_seen integer:=0;
begin
 loop
   next_id:=public.select_voice_source_cleanup(cursor_id);
   exit when next_id is null;
   perform r1_test.assert(cursor_id is null or next_id>cursor_id,'monotonic cursor');
   cursor_id:=next_id; count_seen:=count_seen+1;
   if count_seen>100 then raise exception 'cursor starvation'; end if;
 end loop;
 perform r1_test.assert(count_seen>=3,'skipped candidates traversed');
end; $$;
\o
select 'R1_SQL_CLOCK_RESERVATION_CAS_PARTIAL_EVIDENCE_RETRY_PASS';
\o /dev/null
-- Existing storage scope only. Hold and release do not modify the source clock.
create table r1_test.requests(n int primary key,id uuid default gen_random_uuid());
insert into r1_test.requests(n) values(11),(12),(13),(14);
insert into public.account_deletion_requests(id,user_id,status,confirmed_at)
 select r.id,f.u,'confirmed',clock_timestamp() from r1_test.requests r join r1_test.fixture f using(n);
select r1_test.age_source(s,interval '20 hours') from r1_test.fixture where n=11;
select public.apply_account_deletion_legal_hold(id,array['storage'],'lh_'||repeat('1',32)) from r1_test.requests where n=11;
select r1_test.age_source(s,interval '30 hours') from r1_test.fixture where n=11;
create table r1_test.hold_before as select s.id,s.first_registered_at,s.cleanup_due_at from public.voice_asset_write_intents s join r1_test.fixture f on f.s=s.id where n=11;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='legal_hold','storage hold blocks due cleanup') from r1_test.fixture where n=11;
select public.release_account_deletion_legal_hold(id,'lh_'||repeat('1',32),'lh_'||repeat('2',32)) from r1_test.requests where n=11;
select r1_test.assert((select s.cleanup_state='available' and (s.first_registered_at,s.cleanup_due_at)=(b.first_registered_at,b.cleanup_due_at)
 from public.voice_asset_write_intents s join r1_test.hold_before b using(id)),'release no chain/no restart');
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','released eligible next invocation') from r1_test.fixture where n=11;
select r1_test.reject(format('select public.apply_account_deletion_legal_hold(%L,array[''storage''],%L,%L)',id,'lh_'||repeat('3',32),'lh_'||repeat('1',32)),'source_cleanup_in_progress') from r1_test.requests where n=11;
select public.finish_voice_source_cleanup(s,t,'already_absent') from r1_test.fixture where n=11;
-- Retained-audit scope does not expand into source audio preservation.
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=12;
select public.apply_account_deletion_legal_hold(id,array['retained_audit'],'lh_'||repeat('4',32)) from r1_test.requests where n=12;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','retained audit does not hold source audio') from r1_test.fixture where n=12;
select public.finish_voice_source_cleanup(s,t,'already_absent') from r1_test.fixture where n=12;
-- Account active fence still rejects NEW registration before Provider dispatch.
select r1_test.reject('select r1_test.reserve(13)','account_deletion_active');
-- R1 first, then existing Account Storage/DB finalizers. Reuse the existing
-- canonical synthetic helpers; fake absent results only, never external Storage.
