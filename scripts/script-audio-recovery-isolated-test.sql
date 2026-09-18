create schema recovery_test;
create function recovery_test.uid(n integer) returns uuid language sql immutable as $$select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function recovery_test.sid(n integer) returns uuid language sql immutable as $$select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function recovery_test.vid(n integer) returns uuid language sql immutable as $$select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table recovery_test.expected(n integer primary key, intent public.voice_asset_write_intents);
create function recovery_test.seed(n integer) returns void language plpgsql as $$
declare v public.voice_asset_write_intents;
begin
 insert into auth.users(id) values(recovery_test.uid(n));
 insert into public.scripts(id,user_id,title,content) values(recovery_test.sid(n),recovery_test.uid(n),'Synthetic','Hello.');
 insert into public.voices(id,user_id,provider,provider_voice_id,label) values(recovery_test.vid(n),recovery_test.uid(n),'elevenlabs','synthetic-'||n,'Synthetic');
 v:=public.reserve_voice_asset_write_intent(recovery_test.uid(n),'script_audio_create',gen_random_uuid(),900,
   recovery_test.sid(n),recovery_test.vid(n),'cache','script-audios',recovery_test.uid(n)||'/'||recovery_test.sid(n)||'/'||recovery_test.vid(n)||'/cache.bin');
 -- Fixture-only expiry; never an operator recovery procedure.
 if n<>21 then
   update public.voice_asset_write_intents set lease_expires_at=now()-interval '1 second' where id=v.id returning * into v;
 end if;
 insert into recovery_test.expected values(n,v);
end; $$;
create function recovery_test.recover(n integer) returns public.voice_asset_write_intents language plpgsql as $$
declare v public.voice_asset_write_intents;
begin
 select (intent).* into v from recovery_test.expected where expected.n=recover.n;
 return public.recover_script_audio_post_provider_failure(v.id,v.user_id,v.lease_token,v.updated_at,v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key,'occurred','unknown',recovery_test.uid(n));
end; $$;
create function recovery_test.finalize(n integer) returns public.script_audios language plpgsql as $$
declare v public.voice_asset_write_intents;
begin
 select (intent).* into v from recovery_test.expected where expected.n=finalize.n;
 return public.finalize_script_audio_write_intent(v.id,v.user_id,v.lease_token,'elevenlabs','storage://'||v.storage_bucket||'/'||v.storage_object_key,
   jsonb_build_object('storageBucket',v.storage_bucket,'storageObjectKey',v.storage_object_key),null);
end; $$;
create function recovery_test.try_recover(n integer) returns text language plpgsql as $$
begin perform recovery_test.recover(n); return 'UNEXPECTED_SUCCESS';
exception when check_violation then return 'REJECTED'; end; $$;
create function recovery_test.try_finalize(n integer) returns text language plpgsql as $$
begin perform recovery_test.finalize(n); return 'UNEXPECTED_SUCCESS';
exception when check_violation then return 'REJECTED'; end; $$;
select recovery_test.seed(n) from generate_series(1,12) n;
-- API privileges, including service role direct table prohibition.
select pg_temp.assert_true(has_function_privilege('service_role','public.recover_script_audio_post_provider_failure(uuid,uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,uuid)','execute'),'server RPC');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.recover_script_audio_post_provider_failure(uuid,uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,uuid)','execute'),'no client RPC');
select pg_temp.assert_true(not has_function_privilege('anon','public.recover_script_audio_post_provider_failure(uuid,uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,uuid)','execute'),'no anon RPC');
select pg_temp.assert_true(not has_table_privilege('service_role','public.voice_asset_write_intents','update'),'no direct operator update');
do $$ declare v public.voice_asset_write_intents; r public.voice_asset_write_intents; before_other jsonb; begin
 select (intent).* into v from recovery_test.expected where n=1;
 select to_jsonb(i) into before_other from public.voice_asset_write_intents i where user_id=recovery_test.uid(2);
 -- Unknown physical state accepts even a PRESENT catalog object; no object mutation.
 insert into storage.objects(bucket_id,name) values(v.storage_bucket,v.storage_object_key);
 r:=recovery_test.recover(1);
 perform pg_temp.assert_true(r.status='failed_after_provider' and r.provider_effect='occurred' and r.storage_outcome='unknown' and r.orphan_possible and r.storage_object_key=v.storage_object_key and r.recovered_at is not null,'honest terminal');
 perform pg_temp.assert_true(exists(select 1 from storage.objects where name=v.storage_object_key),'object untouched');
 perform pg_temp.assert_true((select to_jsonb(i)=before_other from public.voice_asset_write_intents i where user_id=recovery_test.uid(2)),'other owner unchanged');
 perform pg_temp.assert_true(recovery_test.try_recover(1)='REJECTED' and recovery_test.try_finalize(1)='REJECTED','terminal reuse rejects');
 r:=public.cancel_voice_asset_write_intent(v.id,v.user_id,v.lease_token,true);
 perform pg_temp.assert_true(r.id is null,'terminal cannot cancel');
 r:=public.reserve_voice_asset_write_intent(v.user_id,'script_audio_create',gen_random_uuid(),900,v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key);
 perform pg_temp.assert_true(r.id<>v.id and r.status='reserved','new intent same cache reserves');
 perform public.cancel_voice_asset_write_intent(r.id,r.user_id,r.lease_token,true);
 perform pg_temp.assert_true((select status='failed_after_provider' from public.voice_asset_write_intents where id=v.id),'same-owner other intent unchanged');
end $$;
select 'RECOVERY_STATUS_GUARD_RETRY_LOCATOR_ISOLATION_PASS';
-- Canonical tuple and independent locator collisions both reject.
do $$ declare v public.voice_asset_write_intents; begin
 select (intent).* into v from recovery_test.expected where n=2;
 insert into public.script_audios(script_id,voice_id,provider,cache_key,storage_path,stored_asset)
 values(v.script_id,v.voice_id,'elevenlabs',v.cache_key,'synthetic','{}');
 perform pg_temp.assert_true(recovery_test.try_recover(2)='REJECTED','canonical rejects');
 select (intent).* into v from recovery_test.expected where n=3;
 insert into public.script_audios(script_id,voice_id,provider,cache_key,storage_path,stored_asset)
 values(v.script_id,v.voice_id,'elevenlabs','other-cache','synthetic',jsonb_build_object('storageBucket',v.storage_bucket,'storageObjectKey',v.storage_object_key));
 perform pg_temp.assert_true(recovery_test.try_recover(3)='REJECTED','locator canonical rejects');
 -- Wrong owner, exact intent, lease, version, cache, path. All leave original reserved.
 select (intent).* into v from recovery_test.expected where n=4;
 perform pg_temp.expect_sqlstate(format('select public.recover_script_audio_post_provider_failure(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',v.id,recovery_test.uid(5),v.lease_token,v.updated_at,v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key,'occurred','unknown',v.id),array['23514'],'wrong owner');
 for r in 1..5 loop
   perform pg_temp.expect_sqlstate(format('select public.recover_script_audio_post_provider_failure(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',case when r=1 then gen_random_uuid() else v.id end,v.user_id,case when r=2 then gen_random_uuid() else v.lease_token end,case when r=3 then v.updated_at-interval '1 second' else v.updated_at end,v.script_id,v.voice_id,case when r=4 then 'wrong' else v.cache_key end,v.storage_bucket,case when r=5 then 'wrong' else v.storage_object_key end,'occurred','unknown',v.id),array['23514'],'exact CAS mismatch');
 end loop;
 perform pg_temp.assert_true((select status='reserved' from public.voice_asset_write_intents where id=v.id),'rejections no write');
end $$;
-- Existing cancellation/completed/manual/expiry contracts retain their meaning.
do $$ declare v public.voice_asset_write_intents; begin
 select (intent).* into v from recovery_test.expected where n=5;
 perform public.cancel_voice_asset_write_intent(v.id,v.user_id,v.lease_token,true);
 perform pg_temp.assert_true(recovery_test.try_recover(5)='REJECTED','cancelled rejects');
 select (intent).* into v from recovery_test.expected where n=6;
 update public.voice_asset_write_intents set status='completed',lease_token=null,lease_expires_at=null,storage_bucket=null,storage_object_key=null where id=v.id;
 perform pg_temp.assert_true(recovery_test.try_recover(6)='REJECTED','completed rejects');
 select (intent).* into v from recovery_test.expected where n=7;
 update public.voice_asset_write_intents set status='manual_required',lease_token=null,lease_expires_at=null where id=v.id;
 perform pg_temp.assert_true(recovery_test.try_recover(7)='REJECTED','manual rejects');
 perform pg_temp.expect_sqlstate(format('select public.reserve_voice_asset_write_intent(%L,%L,%L,900,%L,%L,%L,%L,%L)',v.user_id,'script_audio_create',gen_random_uuid(),v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key),array['55006'],'manual guard unchanged');
 select (intent).* into v from recovery_test.expected where n=8;
 perform pg_temp.expect_sqlstate(format('select public.cancel_voice_asset_write_intent(%L,%L,%L,false)',v.id,v.user_id,v.lease_token),array['22023'],'cancel false rejects');
 perform pg_temp.expect_sqlstate(format('select public.reserve_voice_asset_write_intent(%L,%L,%L,900,%L,%L,%L,%L,%L)',v.user_id,'script_audio_create',gen_random_uuid(),v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key),array['55006'],'expired guard unchanged');
 select (intent).* into v from recovery_test.expected where n=9;
 update public.voice_asset_write_intents set lease_expires_at=now()+interval '15 minute' where id=v.id;
 perform pg_temp.assert_true(recovery_test.try_recover(9)='REJECTED','active lease rejects');
 select (intent).* into v from recovery_test.expected where n=10;
 perform pg_temp.expect_sqlstate(format('select public.recover_script_audio_post_provider_failure(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',v.id,v.user_id,v.lease_token,v.updated_at,v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key,'none','absent',v.id),array['22023'],'no false absence or no-effect');
 v:=public.recover_script_audio_post_provider_failure(v.id,v.user_id,v.lease_token,v.updated_at,v.script_id,v.voice_id,v.cache_key,v.storage_bucket,v.storage_object_key,'possible','failed',v.id);
 perform pg_temp.assert_true(v.provider_effect='possible' and v.storage_outcome='failed' and v.orphan_possible,'alternative conservative evidence');
end $$;
select 'RECOVERY_NEGATIVES_EXISTING_CANCEL_FINALIZE_MANUAL_PASS';
-- Direct privacy/deletion contracts: terminal is not deletion authority, no silent
-- evidence disposal by row delete or Auth cascade; unaffected owner still deletes.
select pg_temp.expect_sqlstate($$delete from public.voice_asset_write_intents where user_id=recovery_test.uid(1)$$,array['23514'],'no terminal row disposal');
select pg_temp.expect_sqlstate($$update public.voice_asset_write_intents set storage_object_key='lost' where user_id=recovery_test.uid(1) and status='failed_after_provider'$$,array['23514'],'immutable locator');
select pg_temp.expect_sqlstate($$update public.voice_asset_write_intents set provider_effect='possible' where user_id=recovery_test.uid(1) and status='failed_after_provider'$$,array['23514'],'immutable evidence');
select pg_temp.expect_sqlstate($$delete from auth.users where id=recovery_test.uid(1)$$,array['23514'],'auth cascade preserves orphan');
-- Helper reuses real DB-only provider transition functions; no external call.
select pg_temp.create_provider_terminal_request(recovery_test.uid(1),recovery_test.sid(101));
select pg_temp.expect_sqlstate($$select public.begin_account_deletion_storage_snapshot(recovery_test.sid(101),recovery_test.uid(1),gen_random_uuid())$$,array['23514'],'account storage cannot omit orphan');
select pg_temp.assert_true((select storage_snapshot_status='pending' and storage_sub_finalized_at is null from public.account_deletion_requests where id=recovery_test.sid(101)),'account stage unchanged');
-- Existing finalizer negative remains explicit in the actual current definition.
select pg_temp.assert_true(position('db_finalizer_write_intent_invalid' in pg_get_functiondef('public.finalize_account_deletion_database_stage(uuid,uuid,text)'::regprocedure))>0,'existing finalizer rejects new terminal');
-- Test deletion guard itself on a minimal fixture table as real voice operation
-- inserts require the unrelated consent snapshot protocol; the trigger uses exact
-- canonical owner status and column names, without bypassing production guards.
create table recovery_test.voice_deletion_operations(user_id uuid,snapshot_status text,status text);
create trigger guard before update on recovery_test.voice_deletion_operations for each row execute function public.guard_post_provider_orphan_deletion();
insert into recovery_test.voice_deletion_operations values(recovery_test.uid(1),'pending','pending');
select pg_temp.expect_sqlstate($$update recovery_test.voice_deletion_operations set snapshot_status='succeeded'$$,array['23514'],'voice seal cannot omit orphan');
-- No failed terminal on owner 11: its normal account deletion still succeeds.
do $$ declare v public.voice_asset_write_intents; begin
 select (intent).* into v from recovery_test.expected where n=11;
 perform public.cancel_voice_asset_write_intent(v.id,v.user_id,v.lease_token,true);
end $$;
select pg_temp.create_ready_request(recovery_test.uid(11),recovery_test.sid(111));
select pg_temp.assert_true((select db_cleanup_status='succeeded' from public.finalize_account_deletion_database_stage(recovery_test.sid(111),recovery_test.uid(11),'g5d-2h.account-db.v1')),'unaffected account finalizer succeeds');
-- Active account deletion refuses recovery, preserving its existing safety fence.
insert into public.account_deletion_requests(id,user_id,status,confirmed_at) values(recovery_test.sid(112),recovery_test.uid(12),'confirmed',now());
select pg_temp.expect_sqlstate($$select recovery_test.recover(12)$$,array['55006'],'deletion active refuses recovery');
select 'RECOVERY_PRIVACY_DELETION_CONTRACT_PASS';
