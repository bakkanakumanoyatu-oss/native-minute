-- Existing helpers require a NEW Account request. Cases 15/16 are independent.
select r1_test.age_source(x,interval '25 hours') from r1_test.fixture f cross join lateral (values(f.s),(f.r)) q(x) where n=15;
select public.claim_voice_source_cleanup(s,t) from r1_test.fixture where n=15;
select public.finish_voice_source_cleanup(s,t,'cleanup_succeeded') from r1_test.fixture where n=15;
select public.claim_voice_source_cleanup(r,t) from r1_test.fixture where n=15;
select public.finish_voice_source_cleanup(r,t,'already_absent') from r1_test.fixture where n=15;
insert into r1_test.requests(n) values(15),(16),(17);
select pg_temp.create_ready_request(f.u,r.id) from r1_test.fixture f join r1_test.requests r using(n) where n=15;
select public.finalize_account_deletion_database_stage(r.id,f.u,'g5d-2h.account-db.v1') from r1_test.fixture f join r1_test.requests r using(n) where n=15;
select r1_test.assert(not exists(select 1 from public.voice_source_uses u join r1_test.fixture f on u.user_id=f.u where n=15),'account removes use relation by existing parent cascade');
select r1_test.assert(not exists(select 1 from public.voice_asset_write_intents s join r1_test.fixture f on s.user_id=f.u where n=15),'no raw source identity retained beyond Account finalizer');
-- Account Storage first: object already absent, locator remains canonical until
-- the existing DB stage. R1 can converge without corrupting Account evidence.
select pg_temp.create_ready_request(f.u,r.id) from r1_test.fixture f join r1_test.requests r using(n) where n=16;
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=16;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','Account Storage terminal then R1') from r1_test.fixture where n=16;
select public.finish_voice_source_cleanup(s,t,'already_absent') from r1_test.fixture where n=16;
select public.finalize_account_deletion_database_stage(r.id,f.u,'g5d-2h.account-db.v1') from r1_test.fixture f join r1_test.requests r using(n) where n=16;
-- R1 claim owns dispatch; Account Storage lease must wait. Recovery may finish
-- an earlier claim even after Account initiation, avoiding a mutually stuck fence.
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=17;
select public.claim_voice_source_cleanup(s,t) from r1_test.fixture where n=17;
select pg_temp.create_provider_terminal_request(f.u,r.id) from r1_test.fixture f join r1_test.requests r using(n) where n=17;
select r1_test.reject(format('select pg_temp.finish_storage_terminal(%L,%L)',f.u,r.id),'source_cleanup_in_progress') from r1_test.fixture f join r1_test.requests r using(n) where n=17;
select public.finish_voice_source_cleanup(s,t,'verification_failure') from r1_test.fixture where n=17;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','R1 recovery with later Account fence') from r1_test.fixture where n=17;
select public.finish_voice_source_cleanup(s,t,'already_absent') from r1_test.fixture where n=17;
select pg_temp.finish_storage_terminal(f.u,r.id) from r1_test.fixture f join r1_test.requests r using(n) where n=17;
select public.finalize_account_deletion_database_stage(r.id,f.u,'g5d-2h.account-db.v1') from r1_test.fixture f join r1_test.requests r using(n) where n=17;
\o
select 'R1_SQL_HOLD_RELEASE_ACCOUNT_DIRECT_REGRESSIONS_PASS';
\o /dev/null
-- Stale registration continuation after cancellation and completed cleanup fails
-- before it can acquire any read/dispatch authority.
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=6;
select public.claim_voice_source_cleanup(s,t) from r1_test.fixture where n=6;
select public.finish_voice_source_cleanup(s,t,'already_absent') from r1_test.fixture where n=6;
select r1_test.reject(format('select public.begin_voice_source_registration(%L,%L,%L)',p.op,f.u,f.t),'registration_execution_rejected')
 from r1_test.pending p join r1_test.fixture f using(n) where n=6;
-- Fresh upload can register with retained consent evidence after consent audio
-- cleanup. It does not read old consent bytes or restart its cleanup clock.
do $$declare f r1_test.fixture; i public.voice_asset_write_intents; source_id uuid; before_consent jsonb;
begin
 select * into f from r1_test.fixture where n=5;
 select to_jsonb(s) into before_consent from public.voice_asset_write_intents s where id=f.r;
 i:=public.reserve_voice_asset_write_intent(f.u,'voice_sample_upload',f.t,900,null,null,null,'voice-samples',f.u||'/'||f.c||'/fresh.wav');
 source_id:=i.id;
 perform public.finalize_voice_upload_write_intent(i.id,f.u,f.t,'voice-samples',f.u||'/'||f.c||'/fresh.wav');
 i:=public.reserve_voice_source_registration(f.u,'voice_create',f.t,f.c,'mock','storage://voice-samples/'||f.u||'/'||f.c||'/fresh.wav');
 perform public.begin_voice_source_registration(i.id,f.u,f.t);
 perform public.finalize_voice_create_write_intent(i.id,f.u,f.t,f.c,'fresh-provider','Fresh','storage://voice-samples/'||f.u||'/'||f.c||'/fresh.wav');
 perform r1_test.assert((select to_jsonb(s)=before_consent from public.voice_asset_write_intents s where id=f.r),'completed consent evidence association unchanged');
 perform r1_test.assert((select first_registered_at is not null from public.voice_asset_write_intents where id=source_id),'fresh source has independent anchor');
end; $$;
\o
select 'R1_FRESH_UPLOAD_EVIDENCE_REUSE_STALE_PROCESS_PASS';
\o /dev/null
-- Manual-required business state is also unresolved, regardless of lease expiry.
update public.voice_asset_write_intents set status='manual_required',lease_token=null,lease_expires_at=null
 where id=(select op from r1_test.pending where n=7);
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='in_flight_use','manual business use still blocks') from r1_test.fixture where n=7;
-- Late failure after source anchor updates rolls the complete transaction back.
select r1_test.seed(39,false);
select public.begin_voice_source_registration(op,u,t) from r1_test.fixture where n=39;
create function r1_test.fail_late() returns trigger language plpgsql as $$
begin if new.registration_voice_id is not null and new.user_id=(select u from r1_test.fixture where n=39) then raise exception 'r1_test_late_failure'; end if; return new; end; $$;
create trigger zz_r1_test_fail_late before update on public.voice_asset_write_intents for each row execute function r1_test.fail_late();
select r1_test.reject(format('select public.finalize_voice_create_write_intent(%L,%L,%L,%L,''provider'',''Valid'',%L)',op,u,t,c,'storage://voice-samples/'||u||'/'||c||'/sample.wav'),'r1_test_late_failure') from r1_test.fixture where n=39;
select r1_test.assert(not exists(select 1 from public.voices v join r1_test.fixture f on v.user_id=f.u where n=39),'voice rolled back');
select r1_test.assert((select bool_and(first_registered_at is null and cleanup_due_at is null) from public.voice_asset_write_intents s join r1_test.fixture f on s.id in (f.s,f.r) where n=39),'first source anchors rolled back');
drop trigger zz_r1_test_fail_late on public.voice_asset_write_intents;
drop function r1_test.fail_late();
-- Same-operation finalizer retry at simulated T0+15h leaves both clock fields.
select r1_test.age_source(s,interval '15 hours') from r1_test.fixture where n=1;
create table r1_test.retry_before as select s.id,s.first_registered_at,s.cleanup_due_at from public.voice_asset_write_intents s join r1_test.fixture f on s.id=f.s where n=1;
select public.finalize_voice_create_write_intent(op,u,t,c,'ignored','Ignored','storage://voice-samples/'||u||'/'||c||'/sample.wav') from r1_test.fixture where n=1;
select r1_test.assert((select (s.first_registered_at,s.cleanup_due_at)=(b.first_registered_at,b.cleanup_due_at) from public.voice_asset_write_intents s join r1_test.retry_before b using(id)),'T0+15h response retry no extension');
\o
select 'R1_ATOMIC_ROLLBACK_MANUAL_USE_15H_RETRY_PASS';
\o /dev/null
-- An unrelated new upload does not consume this already registered source.
select public.reserve_voice_asset_write_intent(u,'voice_consent_upload',t,900,null,null,null,'voice-consents',u||'/unrelated.wav') from r1_test.fixture where n=18;
select r1_test.age_source(s,interval '25 hours') from r1_test.fixture where n=18;
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='claimed','unrelated upload does not extend source retention') from r1_test.fixture where n=18;
select public.finish_voice_source_cleanup(s,t,'already_absent') from r1_test.fixture where n=18;
\o
select 'R1_ONLY_RELEVANT_REGISTRATION_USE_BLOCKS_PASS';
\o /dev/null
-- Ordinary routine never clears an explicit cleanup manual-required state.
update public.voice_asset_write_intents set cleanup_state='manual_required' where id=(select s from r1_test.fixture where n=3);
select r1_test.assert((public.claim_voice_source_cleanup(s,t)->>'reason')='manual_required','cleanup manual state requires separate authority') from r1_test.fixture where n=3;
select r1_test.assert((select cleanup_state='manual_required' and cleanup_authorized_at is null from public.voice_asset_write_intents where id=f.s),'manual state unchanged') from r1_test.fixture f where n=3;
\o
select 'R1_MANUAL_CLEANUP_AUTHORITY_PRESERVED_PASS';
