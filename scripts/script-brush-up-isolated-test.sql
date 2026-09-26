create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function pg_temp.reject(stmt text,expected text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if position(expected in sqlerrm)>0 then return; end if; raise;
  end;
  raise exception 'EXPECTED REJECTION: %',expected;
end $$;
insert into auth.users(id,email) values
  ('81000000-0000-4000-8000-000000000001','brush-a@example.invalid'),
  ('81000000-0000-4000-8000-000000000002','brush-b@example.invalid');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
create temp table brush_script as select * from public.create_script('Brush A','A calm one minute practice script.','en-US',60);
create temp table brush_upload as select x.* from brush_script s, lateral public.reserve_voice_asset_write_intent(
  auth.uid(),'recording_upload',gen_random_uuid(),900,s.id,null,null,'recordings',
  auth.uid()||'/'||s.id||'/take.wav',s.current_revision_id,s.practice_epoch,null) x;
select public.finalize_recording_upload_write_intent(id,user_id,lease_token,storage_object_key) from brush_upload;
select public.claim_review_take('82000000-0000-4000-8000-000000000001',s.id,
  'storage://recordings/'||u.storage_object_key,s.current_revision_id,s.practice_epoch)
  from brush_script s,brush_upload u;
select public.persist_review_bundle('82000000-0000-4000-8000-000000000001',s.id,
  'storage://recordings/'||u.storage_object_key,60,'reviewed',80,2,'spoken',80,80,80,
  'ok','[]','{}','{}','Coach','ok','[]','next','[]','[]') from brush_script s,brush_upload u;
insert into public.voices(id,user_id,provider,provider_voice_id,label,is_default)
  values('83000000-0000-4000-8000-000000000001',auth.uid(),'mock','original-voice','Original',true);
create temp table brush_audio_intent as select x.* from brush_script s, lateral public.reserve_voice_asset_write_intent(
  auth.uid(),'script_audio_create',gen_random_uuid(),900,s.id,'83000000-0000-4000-8000-000000000001',
  'baseline-a','script-audios',auth.uid()||'/'||s.id||'/83000000-0000-4000-8000-000000000001/baseline.wav',
  s.current_revision_id,s.practice_epoch,'default') x;
create temp table brush_baseline as select x.* from brush_audio_intent i, lateral public.finalize_script_audio_write_intent(
  i.id,i.user_id,i.lease_token,'mock','/api/script-audio/84000000-0000-4000-8000-000000000001',
  jsonb_build_object('storageBucket',i.storage_bucket,'storageObjectKey',i.storage_object_key),60) x;
alter table public.takes disable trigger guard_take_revision_identity;
insert into public.takes(id,user_id,script_id,audio_path,status,script_revision_id)
  select '82000000-0000-4000-8000-000000000002',auth.uid(),id,
    'storage://recordings/'||auth.uid()||'/'||id||'/legacy.wav','reviewed',null from brush_script;
insert into public.takes(id,user_id,script_id,audio_path,status,script_revision_id,script_title_snapshot,script_practice_epoch)
  select '82000000-0000-4000-8000-000000000003',auth.uid(),id,
    'missing-recording','reviewed',current_revision_id,title,practice_epoch from brush_script;
alter table public.takes enable trigger guard_take_revision_identity;
select pg_temp.assert_true(not has_function_privilege('authenticated',
  'public.accept_script_brush_up_consent(uuid,uuid,uuid,uuid,text)','execute'),'direct consent forged denied');
set role authenticated;
select pg_temp.reject('select public.accept_script_brush_up_consent(''81000000-0000-4000-8000-000000000001'',
  ''82000000-0000-4000-8000-000000000001'',''82000000-0000-4000-8000-000000000001'',
  ''82000000-0000-4000-8000-000000000001'','''||repeat('a',64)||''')','permission denied');
reset role;
select pg_temp.assert_true(has_function_privilege('service_role',
  'public.accept_script_brush_up_consent(uuid,uuid,uuid,uuid,text)','execute'),'service consent grant');
select pg_temp.reject(format('select public.accept_script_brush_up_consent(%L,%L,%L,%L,%L)',
  '81000000-0000-4000-8000-000000000002',s.id,'82000000-0000-4000-8000-000000000001',s.current_revision_id,repeat('a',64)),
  'brush_up_take_ineligible') from brush_script s;
select pg_temp.reject(format('select public.accept_script_brush_up_consent(%L,%L,%L,%L,%L)',
  '81000000-0000-4000-8000-000000000001',s.id,'82000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64)),
  'brush_up_take_ineligible') from brush_script s;
select pg_temp.reject(format('select public.accept_script_brush_up_consent(%L,%L,%L,%L,%L)',
  '81000000-0000-4000-8000-000000000001',s.id,'82000000-0000-4000-8000-000000000002',s.current_revision_id,repeat('a',64)),
  'brush_up_take_ineligible') from brush_script s;
select pg_temp.reject(format('select public.accept_script_brush_up_consent(%L,%L,%L,%L,%L)',
  '81000000-0000-4000-8000-000000000001',s.id,'82000000-0000-4000-8000-000000000003',s.current_revision_id,repeat('a',64)),
  'brush_up_take_ineligible') from brush_script s;
create temp table brush_consent as select public.accept_script_brush_up_consent(
  '81000000-0000-4000-8000-000000000001',s.id,'82000000-0000-4000-8000-000000000001',
  s.current_revision_id,repeat('a',64)) as row from brush_script s;
create temp table brush_quota as select public.reserve_beta_provider_quota(
  '81000000-0000-4000-8000-000000000001','script_brush_up_candidate_generation',
  'brush-op-1','account_lifetime',1,2) as value;
select pg_temp.assert_true((select value->>'result'='reserved' from brush_quota),'brush quota reserved');
select pg_temp.assert_true((select value->>'result'='duplicate' from
  (select public.reserve_beta_provider_quota('81000000-0000-4000-8000-000000000001',
    'script_brush_up_candidate_generation','brush-op-1','account_lifetime',1,2) as value) q),'retry double quota zero');
select pg_temp.assert_true(not exists(select 1 from public.beta_quota_reservations where
  kind in ('voice_creation','reference_audio_generation')),'normal buckets untouched');
select pg_temp.reject(format('select public.begin_script_brush_up_candidate(%L,%L,%L,%L)',
  '81000000-0000-4000-8000-000000000002',(c.row).id,a.id,(q.value->>'reservation_id')::uuid),
  'brush_up_consent_missing') from brush_consent c,brush_baseline a,brush_quota q;
create temp table brush_candidate as select public.begin_script_brush_up_candidate(
  '81000000-0000-4000-8000-000000000001',(c.row).id,a.id,(q.value->>'reservation_id')::uuid) as row
  from brush_consent c,brush_baseline a,brush_quota q;
select pg_temp.assert_true((select (row).provider_cleanup_state='create_unknown' from brush_candidate),
  'atomic uncertain dispatch');
select pg_temp.assert_true((select r.status='provider_started' from public.beta_quota_reservations r,
  brush_candidate c where r.id=(c.row).quota_reservation_id),'atomic quota start');
select pg_temp.reject(format('select public.transition_script_brush_up_candidate(%L,%L,%L)',
  '81000000-0000-4000-8000-000000000002',(c.row).id,'provider_created'),
  'brush_up_candidate_missing') from brush_candidate c;
select public.transition_script_brush_up_candidate('81000000-0000-4000-8000-000000000001',
  (row).id,'provider_created','tempVoice123') from brush_candidate;
select public.reserve_script_brush_up_asset('81000000-0000-4000-8000-000000000001',
  (row).id,'81000000-0000-4000-8000-000000000001/'||(row).script_id||'/'||(row).id||'/'||(row).id||'.mp3')
  from brush_candidate;
select public.finalize_script_brush_up_audio('81000000-0000-4000-8000-000000000001',
  (row).id,'/api/script-audio/84000000-0000-4000-8000-000000000002',
  jsonb_build_object('storageBucket','script-audios','storageObjectKey',
    '81000000-0000-4000-8000-000000000001/'||(row).script_id||'/'||(row).id||'/'||(row).id||'.mp3',
    'contentType','audio/mpeg','byteLength',42)) from brush_candidate;
select public.transition_script_brush_up_candidate('81000000-0000-4000-8000-000000000001',
  (row).id,'provider_absent') from brush_candidate;
select pg_temp.assert_true((select status='ready' and provider_candidate_voice_id is null
  from public.script_brush_up_candidates where id=(select (row).id from brush_candidate)),
  'ready only after verified absence');
select pg_temp.assert_true((select count(*)=1 from public.voices where user_id='81000000-0000-4000-8000-000000000001'
  and is_default and id='83000000-0000-4000-8000-000000000001'),'default voice unchanged');
select pg_temp.reject('insert into public.voice_deletion_operations(user_id) values
  (''81000000-0000-4000-8000-000000000001'')','brush_up_cleanup_required_before_voice_deletion');
select pg_temp.assert_true((select count(*)=1 from public.script_audios where
  script_id=(select id from brush_script) and generation_preset='brush_up_candidate' and voice_id is null),
  'candidate audio owned without voice row');
select public.transition_script_brush_up_candidate('81000000-0000-4000-8000-000000000001',
  (row).id,'adopt') from brush_candidate;
select pg_temp.assert_true((select status='adopted' from public.script_brush_up_candidates
  where id=(select (row).id from brush_candidate)),'adopt revision');
select public.transition_script_brush_up_candidate('81000000-0000-4000-8000-000000000001',
  (row).id,'rollback') from brush_candidate;
select public.finish_script_brush_up_asset_cleanup('81000000-0000-4000-8000-000000000001',
  (row).id) from brush_candidate;
select pg_temp.assert_true((select status='rolled_back' and asset_cleanup_state='complete'
  and candidate_script_audio_id is null from public.script_brush_up_candidates
  where id=(select (row).id from brush_candidate)),'rollback cleanup');
select pg_temp.assert_true((select count(*)=0 from public.script_audios where generation_preset='brush_up_candidate'),
  'candidate row removed');
select pg_temp.assert_true((select count(*)=1 from public.script_audios where
  id=(select id from brush_baseline)),'baseline retained');
set role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.script_brush_up_candidates),'owner candidate read');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',false);
select pg_temp.assert_true((select count(*)=0 from public.script_brush_up_candidates),'other user candidate RLS');
reset role;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
delete from public.takes where id='82000000-0000-4000-8000-000000000003';
select public.transition_beta_provider_quota('81000000-0000-4000-8000-000000000001',
  (value->>'reservation_id')::uuid,'consumed') from brush_quota;
select 'BRUSH_UP_RPC_ELIGIBILITY_STATE_CLEANUP_PASS';
