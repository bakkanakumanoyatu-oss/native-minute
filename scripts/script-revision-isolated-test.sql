create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function pg_temp.reject(stmt text, expected text) returns void language plpgsql as $$ begin
 begin execute stmt; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'EXPECTED REJECTION: %',expected; end $$;
select pg_temp.assert_true(not has_table_privilege('authenticated','public.scripts','DELETE'),'no product hard delete grant');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.scripts','UPDATE'),'no direct mutable projection');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.takes','INSERT'),'claim only');
select pg_temp.assert_true(not has_function_privilege('service_role','public.revision_base_reserve_voice_asset(uuid,text,uuid,integer,uuid,uuid,text,text,text)','EXECUTE'),'old writer inaccessible');
select pg_temp.assert_true(not exists(select 1 from public.takes where script_revision_id is not null),'legacy not backfilled');
select pg_temp.assert_true(not exists(select 1 from public.script_audios where script_revision_id is not null),'legacy audio not relabelled');
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000010','a@example.invalid'),('10000000-0000-4000-8000-000000000011','b@example.invalid');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',false);
create temp table state as select x.* from public.create_script('First','Original content.','en-US',60) x;
select pg_temp.assert_true((select count(*)=1 from public.script_revisions where script_id=(select id from state)),'new baseline');
create temp table renamed as select x.* from state, lateral public.edit_script(id,current_revision_id,lock_version,'{"title":"Renamed"}') x;
select pg_temp.assert_true((select r.current_revision_id=s.current_revision_id and r.practice_epoch=s.practice_epoch and r.lock_version=s.lock_version+1 from renamed r,state s),'title only');
create temp table edited as select x.* from renamed, lateral public.edit_script(id,current_revision_id,lock_version,'{"content":"New content."}') x;
select pg_temp.assert_true((select e.current_revision_id<>s.current_revision_id and e.practice_epoch=s.practice_epoch+1 from edited e,state s),'content revision');
select pg_temp.assert_true((select content='Original content.' from public.script_revisions where id=(select current_revision_id from state)),'old content preserved');
select pg_temp.reject(format('select public.edit_script(%L,%L,%s,''{"title":"Stale"}'')',id,current_revision_id,lock_version),'script_edit_conflict') from state;
select pg_temp.reject(format('update public.script_revisions set content=''corrupted'' where id=%L',current_revision_id),'script_revision_immutable') from state;
-- Owner B cannot read or mutate A; authenticated direct DELETE is unavailable.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',false);
select pg_temp.reject(format('select public.edit_script(%L,%L,%s,''{"title":"B"}'')',id,current_revision_id,lock_version),'script_not_found') from edited;
select pg_temp.reject(format('select public.set_script_archived(%L,true,%s)',id,lock_version),'script_not_found') from edited;
select pg_temp.reject(format('select public.set_script_archived(%L,false,%s)',id,lock_version),'script_not_found') from edited;
set role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.scripts),'RLS script owner');
select pg_temp.assert_true((select count(*)=0 from public.script_revisions),'RLS revision owner');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',false);
-- Reserve a synthetic recording; no Storage API is invoked.
create temp table upload as select x.* from edited, lateral public.reserve_voice_asset_write_intent(auth.uid(),'recording_upload','40000000-0000-4000-8000-000000000010',900,
 id,null,null,'recordings',auth.uid()||'/'||id||'/50000000-0000-4000-8000-000000000010.wav',current_revision_id,practice_epoch,null) x;
select public.finalize_recording_upload_write_intent(id,user_id,lease_token,storage_object_key) from upload;
select pg_temp.assert_true(public.claim_review_take('30000000-0000-4000-8000-000000000010',e.id,'storage://recordings/'||u.storage_object_key,e.current_revision_id,e.practice_epoch)='claimed','claim revision') from edited e,upload u;
select pg_temp.assert_true((select script_title_snapshot='Renamed' from public.takes where id='30000000-0000-4000-8000-000000000010'),'claim title');
-- Archive while evaluation would be in flight; save must fail with no partial feedback.
create temp table archived as select x.* from edited, lateral public.set_script_archived(id,true,lock_version) x;
select pg_temp.reject(format('select public.persist_review_bundle(%L,%L,%L,60,''reviewed'',80,2,''spoken'',80,80,80,''ok'',''[]'',''{}'',''{}'',''Coach'',''ok'',''[]'',''next'',''[]'',''[]'')',
 '30000000-0000-4000-8000-000000000010',e.id,'storage://recordings/'||u.storage_object_key),'script_archived') from edited e,upload u;
select pg_temp.assert_true((select count(*)=0 from public.coach_feedback where take_id='30000000-0000-4000-8000-000000000010'),'no partial coach');
select pg_temp.reject(format('select public.assert_script_practice(%L,%L,%L,%s)',auth.uid(),id,current_revision_id,practice_epoch),'script_archived') from archived;
select pg_temp.assert_true((select count(*)=0 from public.scripts where user_id=auth.uid() and archived_at is null),'archive frees slot');
create temp table restored as select x.* from archived, lateral public.set_script_archived(id,false,lock_version) x;
select pg_temp.assert_true((select r.current_revision_id=a.current_revision_id and r.practice_epoch>a.practice_epoch from restored r,archived a),'restore preserves revision, fences ABA');
select pg_temp.reject(format('select public.assert_script_practice(%L,%L,%L,%s)',auth.uid(),id,current_revision_id,practice_epoch),'practice_state_conflict') from edited;
select public.create_script('Extra','Content','en-US',60) from generate_series(1,9);
select pg_temp.reject('select public.create_script(''Overflow'',''Content'',''en-US'',60)','script_limit_reached');
create temp table archived_again as select x.* from restored, lateral public.set_script_archived(id,true,lock_version) x;
select public.create_script('Replacement','Content','en-US',60);
select pg_temp.reject(format('select public.set_script_archived(%L,false,%s)',id,lock_version),'script_limit_reached') from archived_again;
select pg_temp.assert_true((select count(*)=10 from public.scripts where user_id=auth.uid() and archived_at is null),'active count max10');
select pg_temp.assert_true(exists(select 1 from public.takes where id='30000000-0000-4000-8000-000000000010'),'archive retains Take');
select 'REVISION_ARCHIVE_SECURITY_RACE_PASS';
-- Legacy identities, personal metadata and audio survive both baseline and archive.
select pg_temp.assert_true((select count(*)=7 and count(script_revision_id)=0 from public.takes where user_id='10000000-0000-4000-8000-000000000001'),'seven legacy NULLs');
select pg_temp.assert_true((select count(*) filter(where status='reviewed')=6 and count(*) filter(where status='completed')=1 from public.takes where user_id='10000000-0000-4000-8000-000000000001'),'no status promotion');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.set_script_archived('20000000-0000-4000-8000-000000000001',true,1);
select pg_temp.assert_true((select favorite and display_name='Saved name' from public.takes where id='30000000-0000-4000-8000-000000000001'),'favorite name preserved');
select pg_temp.assert_true((select count(*)=1 from public.weak_words),'weak words preserved');
select pg_temp.assert_true((select count(*)=1 from public.coach_feedback),'coach preserved');
select pg_temp.assert_true((select script_revision_id is null and revision_binding='legacy_unbound' and cache_key='legacy-v1' from public.script_audios where id='50000000-0000-4000-8000-000000000001'),'old audio preserved unbound');
-- Successful save stays bound after later content/title edits and archive.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',false);
create temp table saved_script as select x.* from public.create_script('Saved title','Saved content','en-US',60) x;
create temp table saved_upload as select x.* from saved_script s, lateral public.reserve_voice_asset_write_intent(auth.uid(),'recording_upload',gen_random_uuid(),900,
 s.id,null,null,'recordings',auth.uid()||'/'||s.id||'/saved.wav',s.current_revision_id,s.practice_epoch,null) x;
select public.finalize_recording_upload_write_intent(id,user_id,lease_token,storage_object_key) from saved_upload;
select public.claim_review_take('30000000-0000-4000-8000-000000000011',s.id,'storage://recordings/'||u.storage_object_key,s.current_revision_id,s.practice_epoch) from saved_script s,saved_upload u;
select public.persist_review_bundle('30000000-0000-4000-8000-000000000011',s.id,'storage://recordings/'||u.storage_object_key,60,'reviewed',80,2,'spoken',80,80,80,'ok','[]','{}','{}','Coach','ok','[]','next','[]','[]') from saved_script s,saved_upload u;
insert into public.voices(id,user_id,provider,provider_voice_id,label,is_default) values('40000000-0000-4000-8000-000000000011',auth.uid(),'mock','synthetic-b','Fixture',true);
create temp table reference_intent as select x.* from saved_script s, lateral public.reserve_voice_asset_write_intent(auth.uid(),'script_audio_create',gen_random_uuid(),900,
 s.id,'40000000-0000-4000-8000-000000000011','v2-synthetic','script-audios',auth.uid()||'/'||s.id||'/40000000-0000-4000-8000-000000000011/reference.wav',s.current_revision_id,s.practice_epoch,'default') x;
create temp table reference_audio as select x.* from reference_intent i, lateral public.finalize_script_audio_write_intent(i.id,i.user_id,i.lease_token,'mock','synthetic',jsonb_build_object('storageBucket',i.storage_bucket,'storageObjectKey',i.storage_object_key),60) x;
select pg_temp.assert_true((select a.script_revision_id=s.current_revision_id and a.generation_key_version=2 and a.revision_binding='generated' from reference_audio a,saved_script s),'v2 audio bound');
create temp table later_edit as select x.* from saved_script s, lateral public.edit_script(s.id,s.current_revision_id,s.lock_version,'{"title":"Later title","content":"Later content"}') x;
select pg_temp.assert_true((select t.script_title_snapshot='Saved title' and r.content='Saved content' and t.status='reviewed' from public.takes t join public.script_revisions r on r.id=t.script_revision_id where t.id='30000000-0000-4000-8000-000000000011'),'saved review meaning unchanged');
select pg_temp.assert_true((select a.script_revision_id<>s.current_revision_id from public.script_audios a join later_edit s on a.script_id=s.id),'old reference not current');
select pg_temp.reject(format('select public.reserve_voice_asset_write_intent(%L,''recording_upload'',gen_random_uuid(),900,%L,null,null,''recordings'',%L,%L,%s,null)',auth.uid(),s.id,u.storage_object_key,s.current_revision_id,s.practice_epoch),'recording_revision_conflict') from later_edit s,saved_upload u;
create temp table inflight_audio as select x.* from later_edit s, lateral public.reserve_voice_asset_write_intent(auth.uid(),'script_audio_create',gen_random_uuid(),900,
 s.id,'40000000-0000-4000-8000-000000000011','v2-inflight','script-audios',auth.uid()||'/'||s.id||'/40000000-0000-4000-8000-000000000011/inflight.wav',s.current_revision_id,s.practice_epoch,'default') x;
create temp table saved_archived as select x.* from later_edit s, lateral public.set_script_archived(s.id,true,s.lock_version) x;
select pg_temp.reject(format('select public.finalize_script_audio_write_intent(%L,%L,%L,''mock'',''synthetic'',%L,60)',id,user_id,lease_token,jsonb_build_object('storageBucket',storage_bucket,'storageObjectKey',storage_object_key)),'script_archived') from inflight_audio;
select pg_temp.reject(format('select public.reserve_voice_asset_write_intent(%L,''script_audio_create'',gen_random_uuid(),900,%L,%L,''blocked'',''script-audios'',''blocked'',%L,%s,''default'')',auth.uid(),s.id,'40000000-0000-4000-8000-000000000011',s.current_revision_id,s.practice_epoch),'script_archived') from saved_archived s;
select pg_temp.reject(format('select public.claim_review_take(gen_random_uuid(),%L,''blocked'',%L,%s)',id,current_revision_id,practice_epoch),'script_archived') from saved_archived;
select pg_temp.assert_true((select count(*)=1 from public.script_audios where script_id=(select id from saved_script)),'archive retains old audio without finalizing in-flight');
set role authenticated;
update public.takes set favorite=true,display_name='Archived favorite' where id='30000000-0000-4000-8000-000000000011';
select pg_temp.reject('delete from public.scripts where user_id=auth.uid()','permission denied');
reset role;
select pg_temp.assert_true((select favorite and display_name='Archived favorite' from public.takes where id='30000000-0000-4000-8000-000000000011'),'archive metadata update preserved');
-- Postflight invariant checks over every synthetic owner.
select pg_temp.assert_true(not exists(select 1 from public.scripts s join public.script_revisions r on r.id=s.current_revision_id where r.script_id<>s.id or row(s.content,s.locale,s.target_seconds) is distinct from row(r.content,r.locale,r.target_seconds)),'postflight current projection');
select pg_temp.assert_true(not exists(select 1 from public.scripts where archived_at is null group by user_id having count(*)>10),'postflight active limit');
select pg_temp.assert_true(not exists(select 1 from public.takes t join public.script_revisions r on r.id=t.script_revision_id where r.script_id<>t.script_id),'postflight take linkage');
select 'SAVE_AUDIO_ARCHIVE_POSTFLIGHT_PASS';
