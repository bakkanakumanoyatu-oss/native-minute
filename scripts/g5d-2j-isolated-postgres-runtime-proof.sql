\set ON_ERROR_STOP on

\if :{?g5d2j_isolated}
\else
  \echo 'g5d2j_isolated variable is required; refusing to run'
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

create or replace function pg_temp.create_provider_terminal_request(p_user_id uuid, p_request_id uuid)
returns void language plpgsql as $$
declare
  v_token uuid := gen_random_uuid();
  v_target record;
  v_request public.account_deletion_requests;
begin
  insert into public.account_deletion_requests(id, user_id, status, confirmed_at)
  values (p_request_id, p_user_id, 'confirmed', transaction_timestamp());
  perform public.seal_account_deletion_provider_snapshot(p_request_id, p_user_id);
  select * into v_request from public.claim_account_deletion_provider_lease(
    p_request_id, p_user_id, v_token, 600
  );
  if v_request.provider_runner_attempt_count is distinct from 1 then
    raise exception 'provider fixture lease failed';
  end if;

  for v_target in
    select id from public.account_deletion_provider_targets
    where deletion_request_id = p_request_id order by id
  loop
    perform public.begin_account_deletion_provider_delete_attempt(
      p_request_id, p_user_id, v_target.id, v_token, 1, 0
    );
    perform public.record_account_deletion_provider_delete_result(
      p_request_id, p_user_id, v_target.id, v_token, 1, 1, 'not_found', 0
    );
    perform public.begin_account_deletion_provider_reconciliation_attempt(
      p_request_id, p_user_id, v_target.id, v_token, 1, 0
    );
    perform public.record_account_deletion_provider_reconciliation_result(
      p_request_id, p_user_id, v_target.id, v_token, 1, 1, 'verified_absent', null, 0
    );
  end loop;

  select * into v_request from public.finalize_account_deletion_provider_stage(
    p_request_id, p_user_id, v_token, 1
  );
  if v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.provider_sub_finalized_at is null then
    raise exception 'provider fixture finalization failed';
  end if;
end;
$$;

create or replace function pg_temp.finish_storage_terminal(
  p_user_id uuid,
  p_request_id uuid,
  p_inventory jsonb default jsonb_build_object(
    'recordings', '[]'::jsonb,
    'script-audios', '[]'::jsonb,
    'voice-samples', '[]'::jsonb,
    'voice-consents', '[]'::jsonb
  )
)
returns void language plpgsql as $$
declare
  v_collection_token uuid := gen_random_uuid();
  v_lease_token uuid := gen_random_uuid();
  v_target record;
  v_request public.account_deletion_requests;
begin
  perform public.begin_account_deletion_storage_snapshot(
    p_request_id, p_user_id, v_collection_token
  );
  perform public.seal_account_deletion_storage_snapshot(
    p_request_id, p_user_id, v_collection_token, p_inventory
  );
  select * into v_request from public.claim_account_deletion_storage_lease(
    p_request_id, p_user_id, v_lease_token, 600
  );
  if v_request.storage_runner_attempt_count is distinct from 1 then
    raise exception 'storage fixture lease failed';
  end if;

  for v_target in
    select id from public.account_deletion_storage_targets
    where deletion_request_id = p_request_id order by id
  loop
    perform public.begin_account_deletion_storage_delete_attempt(
      p_request_id, p_user_id, v_target.id, v_lease_token, 1, 0
    );
    perform public.record_account_deletion_storage_delete_result(
      p_request_id, p_user_id, v_target.id, v_lease_token, 1, 1, 'request_succeeded', 0
    );
    perform public.begin_account_deletion_storage_verification_attempt(
      p_request_id, p_user_id, v_target.id, v_lease_token, 1, 0
    );
    perform public.record_account_deletion_storage_verification_result(
      p_request_id, p_user_id, v_target.id, v_lease_token, 1, 1, 'absent', 0
    );
  end loop;

  select * into v_request from public.finalize_account_deletion_storage_stage(
    p_request_id, p_user_id, v_lease_token, 1
  );
  if v_request.storage_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_sub_finalized_at is null then
    raise exception 'storage fixture finalization failed';
  end if;
end;
$$;

create or replace function pg_temp.create_ready_request(p_user_id uuid, p_request_id uuid)
returns void language plpgsql as $$
begin
  perform pg_temp.create_provider_terminal_request(p_user_id, p_request_id);
  perform pg_temp.finish_storage_terminal(p_user_id, p_request_id);
end;
$$;

-- Clean migration history and actual catalog/ACL authority.
select pg_temp.assert_true(
  (select array_agg(version order by version) from supabase_migrations.schema_migrations) =
    array['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012',
          '0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024','0025'],
  'migration history is not exact 0001 through 0025'
);

select pg_temp.assert_true(
  (select array_agg(tablename::text order by tablename) from pg_tables where schemaname = 'public') =
    array['account_deletion_provider_targets','account_deletion_requests','account_deletion_storage_targets',
          'coach_feedback','processing_consents','profiles','quota_events','script_audios',
          'script_saved_best_takes','script_saved_model_audios','scripts','takes','voice_asset_write_intents',
          'voice_consents','voice_deletion_operations','voice_deletion_targets','voices','weak_words'],
  'public table inventory is not exactly 18'
);

select pg_temp.assert_true(
  (select proowner = 'postgres'::regrole and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']
      and position('current_setting(' in prosrc) = 0 and position('set_config(' in prosrc) = 0
    from pg_proc where oid = 'public.finalize_account_deletion_database_stage(uuid,uuid,text)'::regprocedure),
  'finalizer owner/security/search_path/source mismatch'
);
select pg_temp.assert_true(
  not has_function_privilege('public', 'public.finalize_account_deletion_database_stage(uuid,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.finalize_account_deletion_database_stage(uuid,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.finalize_account_deletion_database_stage(uuid,uuid,text)', 'execute')
    and has_function_privilege('service_role', 'public.finalize_account_deletion_database_stage(uuid,uuid,text)', 'execute'),
  'finalizer execute ACL mismatch'
);
select pg_temp.assert_true(
  (select not prosecdef and proconfig @> array['search_path=pg_catalog, public']
      and position('current_setting(' in prosrc) = 0 and position('set_config(' in prosrc) = 0
    from pg_proc where oid = 'public.enforce_account_deletion_db_terminal_authority()'::regprocedure),
  'permanent terminal trigger security mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 12 from pg_trigger where not tgisinternal and tgname in (
    'enforce_account_deletion_db_terminal_authority',
    'enforce_account_deletion_profile_db_writer_fence',
    'enforce_account_deletion_script_db_writer_fence',
    'enforce_account_deletion_processing_consent_db_writer_fence',
    'enforce_account_deletion_quota_event_db_writer_fence',
    'enforce_account_deletion_saved_model_audio_db_writer_fence',
    'enforce_account_deletion_saved_best_take_db_writer_fence',
    'enforce_account_deletion_weak_word_db_writer_fence',
    'enforce_account_deletion_coach_feedback_db_writer_fence',
    'enforce_account_deletion_voice_operation_db_writer_fence',
    'enforce_account_deletion_voice_target_db_writer_fence',
    'enforce_g5d_2j_storage_terminal_db_writer_lock'
  )),
  'focused terminal/writer trigger inventory mismatch'
);
with expected(signature) as (values
  ('public.account_deletion_db_writer_fence_active(uuid)'),
  ('public.g5d_2j_lock_db_writer_users(uuid,uuid)'),
  ('public.enforce_g5d_2j_storage_terminal_db_writer_lock()'),
  ('public.enforce_account_deletion_profile_db_writer_fence()'),
  ('public.enforce_account_deletion_script_db_writer_fence()'),
  ('public.enforce_account_deletion_processing_consent_db_writer_fence()'),
  ('public.enforce_account_deletion_quota_event_db_writer_fence()'),
  ('public.enforce_account_deletion_saved_model_audio_db_writer_fence()'),
  ('public.enforce_account_deletion_saved_best_take_db_writer_fence()'),
  ('public.enforce_account_deletion_weak_word_db_writer_fence()'),
  ('public.enforce_account_deletion_coach_feedback_db_writer_fence()'),
  ('public.enforce_account_deletion_voice_operation_db_writer_fence()'),
  ('public.enforce_account_deletion_voice_target_db_writer_fence()')
), actual as (
  select signature, to_regprocedure(signature) oid from expected
)
select pg_temp.assert_true(
  (select count(*)=13 and bool_and(
    oid is not null
    and (select proowner='postgres'::regrole and prosecdef
      and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where pg_proc.oid=actual.oid)
    and not has_function_privilege('public',oid,'execute')
    and not has_function_privilege('anon',oid,'execute')
    and not has_function_privilege('authenticated',oid,'execute')
    and not has_function_privilege('service_role',oid,'execute')
  ) from actual),
  'writer-fence helper function owner/security/search_path/ACL mismatch'
);
select pg_temp.assert_true(
  not has_column_privilege('service_role','public.account_deletion_requests','db_cleanup_status','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','db_inventory_version','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','db_observed_row_count','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','db_deleted_row_count','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','db_anonymized_row_count','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','db_retained_row_count','update')
    and not has_column_privilege('service_role','public.account_deletion_requests','db_sub_finalized_at','update')
    and has_column_privilege('service_role','public.account_deletion_requests','provider_cleanup_status','update')
    and has_column_privilege('service_role','public.account_deletion_requests','storage_cleanup_status','update'),
  'direct terminal column ACL or shared Provider/Storage ACL mismatch'
);
select pg_temp.assert_true(
  has_function_privilege('service_role','public.finalize_account_deletion_provider_stage(uuid,uuid,uuid,integer)','execute')
    and has_function_privilege('service_role','public.finalize_account_deletion_storage_stage(uuid,uuid,uuid,integer)','execute')
    and not has_function_privilege('authenticated','public.finalize_account_deletion_provider_stage(uuid,uuid,uuid,integer)','execute')
    and not has_function_privilege('authenticated','public.finalize_account_deletion_storage_stage(uuid,uuid,uuid,integer)','execute'),
  'Provider/Storage canonical RPC execute authority changed'
);
select pg_temp.assert_true(
  (select pg_get_constraintdef(oid) like '%db_observed_row_count = ((db_deleted_row_count + db_anonymized_row_count) + db_retained_row_count)%'
    from pg_constraint where conrelid='public.account_deletion_requests'::regclass
      and conname='account_deletion_requests_db_terminal_shape_check')
    and to_regclass('public.voice_deletion_operations_audit_expires_at_idx') is not null
    and to_regclass('public.quota_events_retention_expires_at_idx') is not null
    and to_regclass('public.account_deletion_provider_targets_request_status_idx') is not null
    and to_regclass('public.account_deletion_storage_targets_request_status_idx') is not null,
  'terminal constraint or retained-evidence indexes mismatch'
);

-- A writer that began immediately before Storage terminality holds the shared
-- user transaction lock. Storage terminal persistence waits for that commit,
-- and the later DB finalizer inventories the committed row.
create extension if not exists dblink with schema extensions;
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000009','g5d2j-preterminal@example.invalid',now(),now());
select pg_temp.create_provider_terminal_request(
  '11000000-0000-4000-8000-000000000009','21000000-0000-4000-8000-000000000009'
);
select public.begin_account_deletion_storage_snapshot(
  '21000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000009',
  '29000000-0000-4000-8000-000000000009'
);
select public.seal_account_deletion_storage_snapshot(
  '21000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000009',
  '29000000-0000-4000-8000-000000000009',
  jsonb_build_object('recordings','[]'::jsonb,'script-audios','[]'::jsonb,
    'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb)
);
select public.claim_account_deletion_storage_lease(
  '21000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000009',
  '29000000-0000-4000-8000-000000000019',600
);
create or replace function public.g5d2j_proof_preterminal_writer(p_user_id uuid)
returns text language plpgsql as $$
begin
  insert into public.processing_consents(
    user_id,consent_type,consent_version,purpose_id,purpose_version,provider_set,data_categories
  ) values (
    p_user_id,'pronunciation_processing','2026-08-22.v1','pronunciation_processing','v1',
    array['openai','azure'],array['recorded_audio','transcript','pronunciation_result']
  );
  perform pg_sleep(2);
  return 'committed';
end;
$$;
select extensions.dblink_connect(
  'g5d2j_preterminal',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_send_query(
  'g5d2j_preterminal',
  $$select public.g5d2j_proof_preterminal_writer('11000000-0000-4000-8000-000000000009')$$
);
select pg_sleep(0.25);
select public.finalize_account_deletion_storage_stage(
  '21000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000009',
  '29000000-0000-4000-8000-000000000019',1
);
select pg_temp.assert_true(
  extensions.dblink_is_busy('g5d2j_preterminal')=0
    and exists(select 1 from public.processing_consents
      where user_id='11000000-0000-4000-8000-000000000009'),
  'Storage terminal persisted before the preterminal writer committed'
);
select * from extensions.dblink_get_result('g5d2j_preterminal') as result(outcome text);
select extensions.dblink_disconnect('g5d2j_preterminal');
drop function public.g5d2j_proof_preterminal_writer(uuid);
select pg_temp.assert_true(
  (select db_cleanup_status='succeeded' and db_observed_row_count=3
    and db_deleted_row_count=2 and db_anonymized_row_count=0 and db_retained_row_count=1
    from public.finalize_account_deletion_database_stage(
      '21000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000009','g5d-2h.account-db.v1')),
  'preterminal committed writer was not included in DB finalizer inventory'
);

-- Full User A inventory and representative User B isolation rows.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000001','g5d2j-full-a@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000002','g5d2j-user-b@example.invalid',now(),now());

insert into public.scripts(id,user_id,title,content) values
  ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','A title','A content'),
  ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','B title','B content');
insert into public.takes(id,script_id,user_id,audio_path,status) values
  ('41000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'storage://recordings/11000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001/take.wav','completed'),
  ('41000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002','local://b.wav','completed');
insert into public.weak_words(id,take_id,word,score) values
  ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','atomic',80),
  ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','isolation',90);
insert into public.coach_feedback(id,take_id,summary) values
  ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','A feedback');

insert into public.processing_consents(
  id,user_id,consent_type,consent_version,purpose_id,purpose_version,provider_set,data_categories
) values (
  '44000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  'voice_cloning','2026-08-22.v1','voice_cloning','v1',array['elevenlabs'],
  array['voice_sample','consent_recording','cloned_voice','reference_audio']
);
insert into public.voice_consents(id,user_id,provider,metadata) values (
  '45000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','elevenlabs',
  jsonb_build_object('recording',jsonb_build_object('audioPath',
    'storage://voice-consents/11000000-0000-4000-8000-000000000001/consent.wav'))
);
insert into public.voices(
  id,user_id,provider,provider_voice_id,label,sample_audio_path,consent_id
) values (
  '46000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  'elevenlabs','g5d2j_voice_a','A voice',
  'storage://voice-samples/11000000-0000-4000-8000-000000000001/45000000-0000-4000-8000-000000000001/sample.wav',
  '45000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_intent public.voice_asset_write_intents;
  v_token uuid := gen_random_uuid();
begin
  v_intent := public.reserve_voice_asset_write_intent(
    '11000000-0000-4000-8000-000000000001','script_audio_create',v_token,600,
    '31000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000001',
    'g5d2j-cache','script-audios',
    '11000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000001/audio.mp3'
  );
  perform public.finalize_script_audio_write_intent(
    v_intent.id,'11000000-0000-4000-8000-000000000001',v_token,'elevenlabs','/api/script-audio/g5d2j',
    jsonb_build_object(
      'storageBucket','script-audios',
      'storageObjectKey','11000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000001/audio.mp3',
      'contentType','audio/mpeg','byteLength',8
    ),60
  );
  v_token := gen_random_uuid();
  v_intent := public.reserve_voice_asset_write_intent(
    '11000000-0000-4000-8000-000000000001','voice_create',v_token,600
  );
  perform public.cancel_voice_asset_write_intent(
    v_intent.id,'11000000-0000-4000-8000-000000000001',v_token,true
  );
end;
$$;

insert into public.script_saved_model_audios(
  id,user_id,script_id,script_audio_id,slot,label
) select '47000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',id,1,'A model'
  from public.script_audios where script_id='31000000-0000-4000-8000-000000000001';
insert into public.script_saved_best_takes(id,user_id,script_id,take_id,slot,label) values (
  '48000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',1,'A take'
);

insert into public.voice_deletion_operations(
  id,user_id,status,current_stage,snapshot_status,consent_withdrawal_status,
  post_delete_verification_status,completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at
) values
  ('49000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
    'completed',null,'succeeded','not_needed','succeeded',now(),now(),now()+interval '90 days'),
  ('49000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',
    'completed',null,'succeeded','not_needed','succeeded',now()-interval '91 days',now()-interval '91 days',now()-interval '1 day'),
  ('49000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002',
    'completed',null,'succeeded','not_needed','succeeded',now(),now(),now()+interval '90 days');
insert into public.voice_deletion_targets(
  id,operation_id,user_id,target_kind,status,delete_outcome,reconciliation_status,
  verification_status,verified_absent_at,locator_scrubbed_at
) values
  ('4a000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001','voice_binding','verified_absent','not_needed',
    'not_applicable','verified_absent',now(),now()),
  ('4a000000-0000-4000-8000-000000000002','49000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000001','voice_binding','verified_absent','not_needed',
    'not_applicable','verified_absent',now()-interval '91 days',now()-interval '91 days'),
  ('4a000000-0000-4000-8000-000000000003','49000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000002','voice_binding','verified_absent','not_needed',
    'not_applicable','verified_absent',now(),now());

insert into public.quota_events(
  id,user_id,event_type,status,subject_type,subject_id,target_resource_id,
  idempotency_key,dedupe_key,request_fingerprint,provider_request_id,metadata,attempted_at
) values
  ('4b000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
    'script_generation_attempt','succeeded','script_studio','31000000-0000-4000-8000-000000000001',null,
    'a-unexpired','a-unexpired','fingerprint-a','provider-a','{"private":"a"}',now()),
  ('4b000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',
    'script_generation_attempt','failed','script_studio','31000000-0000-4000-8000-000000000001',null,
    'a-expired','a-expired','fingerprint-old','provider-old','{"private":"old"}',now()-interval '91 days'),
  ('4b000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002',
    'script_generation_attempt','succeeded','script_studio','31000000-0000-4000-8000-000000000002',null,
    'b-safe','b-safe','fingerprint-b','provider-b','{"private":"b"}',now());

insert into public.account_deletion_requests(
  id,user_id,status,cancelled_at,metadata
) values (
  '21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',
  'cancelled',now(),'{"prior":"safe"}'
);
select pg_temp.create_provider_terminal_request(
  '11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001'
);
select pg_temp.finish_storage_terminal(
  '11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001'
);

select pg_temp.assert_true(
  (select provider_snapshot_target_count=1 and storage_snapshot_target_count=4
    from public.account_deletion_requests where id='21000000-0000-4000-8000-000000000001'),
  'full fixture Provider/Storage target count mismatch'
);

-- Every focused post-Storage writer surface rejects User A; User B remains writable.
select pg_temp.expect_sqlstate(
  $$update public.profiles set display_name='late' where id='11000000-0000-4000-8000-000000000001'$$,
  array['55006'],'profile writer fence'
);
select pg_temp.expect_sqlstate(
  $$insert into public.scripts(user_id,title,content) values('11000000-0000-4000-8000-000000000001','late','late')$$,
  array['55006'],'script writer fence'
);
select pg_temp.expect_sqlstate(
  $$update public.processing_consents set purpose_version=purpose_version where id='44000000-0000-4000-8000-000000000001'$$,
  array['55006'],'processing-consent writer fence'
);
select pg_temp.expect_sqlstate(
  $$update public.quota_events set metadata='{"late":true}' where id='4b000000-0000-4000-8000-000000000001'$$,
  array['55006'],'quota writer fence'
);
select pg_temp.expect_sqlstate(
  $$update public.script_saved_model_audios set label=label where id='47000000-0000-4000-8000-000000000001'$$,
  array['55006'],'saved-model writer fence'
);
select pg_temp.expect_sqlstate(
  $$update public.script_saved_best_takes set label=label where id='48000000-0000-4000-8000-000000000001'$$,
  array['55006'],'saved-best writer fence'
);
select pg_temp.expect_sqlstate(
  $$update public.weak_words set take_id=take_id where id='42000000-0000-4000-8000-000000000001'$$,
  array['55006'],'weak-word writer fence'
);
select pg_temp.expect_sqlstate(
  $$update public.coach_feedback set take_id=take_id where id='43000000-0000-4000-8000-000000000001'$$,
  array['55006'],'coach-feedback writer fence'
);
select pg_temp.expect_sqlstate(
  $$insert into public.voice_deletion_operations(user_id) values('11000000-0000-4000-8000-000000000001')$$,
  array['55006'],'voice-operation writer fence'
);
select pg_temp.expect_sqlstate(
  $$insert into public.voice_deletion_targets(operation_id,user_id,target_kind,source_row_id,target_fingerprint)
    values('49000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
      'voice_binding',gen_random_uuid(),'late-target')$$,
  array['55006'],'voice-target writer fence'
);
insert into public.scripts(id,user_id,title,content) values (
  '31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','B late','B late content'
);
create temp table g5d2j_user_b_baseline as
select md5(jsonb_build_object(
  'profiles',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.profiles row_value
    where id='11000000-0000-4000-8000-000000000002'),
  'scripts',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.scripts row_value
    where user_id='11000000-0000-4000-8000-000000000002'),
  'takes',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.takes row_value
    where user_id='11000000-0000-4000-8000-000000000002'),
  'weak_words',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.weak_words row_value
    where take_id='41000000-0000-4000-8000-000000000002'),
  'voice_operations',(select jsonb_agg(to_jsonb(row_value) order by row_value.id)
    from public.voice_deletion_operations row_value
    where user_id='11000000-0000-4000-8000-000000000002'),
  'voice_targets',(select jsonb_agg(to_jsonb(row_value) order by row_value.id)
    from public.voice_deletion_targets row_value
    where user_id='11000000-0000-4000-8000-000000000002'),
  'quota',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.quota_events row_value
    where user_id='11000000-0000-4000-8000-000000000002')
)::text) checksum;

select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','g5d-2h.account-db.v1')$$,
  array['42501'],'cross-user expected owner'
);
begin;
set local role service_role;
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set db_cleanup_status='succeeded'
    where id='21000000-0000-4000-8000-000000000001'$$,
  array['42501'],'direct service-role DB terminal update'
);
commit;

begin;
set local role service_role;
create temp table g5d2j_full_result on commit preserve rows as
select * from public.finalize_account_deletion_database_stage(
  '21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','g5d-2h.account-db.v1'
);
commit;
select pg_temp.assert_true(
  (select db_cleanup_status='succeeded' and safe_reason='db_cleanup_finalized'
    and db_observed_row_count=26 and db_deleted_row_count=17
    and db_anonymized_row_count=3 and db_retained_row_count=6 and not already_finalized
    from g5d2j_full_result),
  'full finalizer D/A/R result mismatch'
);
select pg_temp.assert_true(
  not exists(select 1 from public.profiles where id='11000000-0000-4000-8000-000000000001')
    and not exists(select 1 from public.scripts where user_id='11000000-0000-4000-8000-000000000001')
    and not exists(select 1 from public.takes where user_id='11000000-0000-4000-8000-000000000001')
    and not exists(select 1 from public.voice_asset_write_intents where user_id='11000000-0000-4000-8000-000000000001')
    and not exists(select 1 from public.account_deletion_requests where id='21000000-0000-4000-8000-000000000002')
    and not exists(select 1 from public.voice_deletion_operations where id='49000000-0000-4000-8000-000000000002')
    and not exists(select 1 from public.quota_events where id='4b000000-0000-4000-8000-000000000002'),
  'full finalizer delete/cascade post-state mismatch'
);
select pg_temp.assert_true(
  (select user_id is null and status='completed' from public.voice_deletion_operations
    where id='49000000-0000-4000-8000-000000000001')
    and (select user_id is null and status='verified_absent' and locator_scrubbed_at is not null
      from public.voice_deletion_targets where id='4a000000-0000-4000-8000-000000000001')
    and (select user_id is null and identifier_scrubbed_at is not null
      and subject_id is null and idempotency_key is null and metadata='{}'::jsonb
      from public.quota_events where id='4b000000-0000-4000-8000-000000000001'),
  'full finalizer retained anonymized shape mismatch'
);
select pg_temp.assert_true(
  (select db_cleanup_status='succeeded' and db_sub_finalized_at is not null and metadata='{}'::jsonb
    and db_observed_row_count=db_deleted_row_count+db_anonymized_row_count+db_retained_row_count
    from public.account_deletion_requests where id='21000000-0000-4000-8000-000000000001')
    and (select count(*)=1 from public.account_deletion_provider_targets
      where deletion_request_id='21000000-0000-4000-8000-000000000001' and locator_scrubbed_at is not null)
    and (select count(*)=4 from public.account_deletion_storage_targets
      where deletion_request_id='21000000-0000-4000-8000-000000000001' and locator_scrubbed_at is not null),
  'current request or retained Provider/Storage evidence mismatch'
);
select pg_temp.assert_true(
  (select count(*)=2 and bool_and(content like 'B%') from public.scripts
    where user_id='11000000-0000-4000-8000-000000000002')
    and exists(select 1 from public.takes where id='41000000-0000-4000-8000-000000000002')
    and exists(select 1 from public.weak_words where id='42000000-0000-4000-8000-000000000002')
    and (select user_id='11000000-0000-4000-8000-000000000002' and metadata='{"private":"b"}'::jsonb
      from public.quota_events where id='4b000000-0000-4000-8000-000000000003')
    and (select user_id='11000000-0000-4000-8000-000000000002'
      from public.voice_deletion_operations where id='49000000-0000-4000-8000-000000000003')
    and (select checksum = md5(jsonb_build_object(
      'profiles',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.profiles row_value
        where id='11000000-0000-4000-8000-000000000002'),
      'scripts',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.scripts row_value
        where user_id='11000000-0000-4000-8000-000000000002'),
      'takes',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.takes row_value
        where user_id='11000000-0000-4000-8000-000000000002'),
      'weak_words',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.weak_words row_value
        where take_id='41000000-0000-4000-8000-000000000002'),
      'voice_operations',(select jsonb_agg(to_jsonb(row_value) order by row_value.id)
        from public.voice_deletion_operations row_value
        where user_id='11000000-0000-4000-8000-000000000002'),
      'voice_targets',(select jsonb_agg(to_jsonb(row_value) order by row_value.id)
        from public.voice_deletion_targets row_value
        where user_id='11000000-0000-4000-8000-000000000002'),
      'quota',(select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.quota_events row_value
        where user_id='11000000-0000-4000-8000-000000000002')
    )::text) from g5d2j_user_b_baseline),
  'User B representative rows changed'
);

create temp table g5d2j_repeat_result as
select * from public.finalize_account_deletion_database_stage(
  '21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','g5d-2h.account-db.v1'
);
select pg_temp.assert_true(
  (select already_finalized and safe_reason='already_finalized'
    and db_observed_row_count=26 and db_deleted_row_count=17
    and db_anonymized_row_count=3 and db_retained_row_count=6 from g5d2j_repeat_result),
  'response-loss/already-finalized replay mismatch'
);

-- D=0/A=0/R=1 remains a legitimate not_needed result and is idempotent.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000003','g5d2j-zero@example.invalid',now(),now());
delete from public.profiles where id='11000000-0000-4000-8000-000000000003';
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000003'
);
select pg_temp.assert_true(
  (select db_cleanup_status='not_needed' and db_observed_row_count=1
    and db_deleted_row_count=0 and db_anonymized_row_count=0 and db_retained_row_count=1
    and not already_finalized
    from public.finalize_account_deletion_database_stage(
      '21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003','g5d-2h.account-db.v1')),
  'zero-work not_needed result mismatch'
);
select pg_temp.assert_true(
  (select already_finalized and db_cleanup_status='not_needed'
    from public.finalize_account_deletion_database_stage(
      '21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003','g5d-2h.account-db.v1')),
  'zero-work repeat was not idempotent'
);

-- A: an already-finalized replay rejects a newly introduced owned row without
-- repairing it or rewriting the persisted terminal evidence.
create temp table g5d2j_corrupt_owned_baseline as
select to_jsonb(request) payload
from public.account_deletion_requests request
where id='21000000-0000-4000-8000-000000000003';
set session_replication_role = replica;
insert into public.scripts(id,user_id,title,content) values (
  '31000000-0000-4000-8001-000000000003','11000000-0000-4000-8000-000000000003',
  'proof-only terminal corruption','must survive fail-closed replay'
);
set session_replication_role = origin;
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003','g5d-2h.account-db.v1')$$,
  array['23514'],'already-finalized owned post-state corruption'
);
select pg_temp.assert_true(
  (select content='must survive fail-closed replay' from public.scripts
    where id='31000000-0000-4000-8001-000000000003')
    and (select to_jsonb(request)=(select payload from g5d2j_corrupt_owned_baseline)
      from public.account_deletion_requests request
      where id='21000000-0000-4000-8000-000000000003')
    and (select count(*)=2 and bool_and(content like 'B%') from public.scripts
      where user_id='11000000-0000-4000-8000-000000000002')
    and (select metadata='{"private":"b"}'::jsonb from public.quota_events
      where id='4b000000-0000-4000-8000-000000000003'),
  'owned post-state corruption replay mutated evidence, corrupt row, or User B'
);

-- B: retained current Provider evidence is revalidated on terminal replay.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000020','g5d2j-replay-provider-evidence@example.invalid',now(),now());
delete from public.profiles where id='11000000-0000-4000-8000-000000000020';
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000020','21000000-0000-4000-8000-000000000020'
);
select pg_temp.assert_true(
  (select db_cleanup_status='not_needed' and not already_finalized
    from public.finalize_account_deletion_database_stage(
      '21000000-0000-4000-8000-000000000020','11000000-0000-4000-8000-000000000020','g5d-2h.account-db.v1')),
  'current-evidence replay fixture did not finalize'
);
create temp table g5d2j_corrupt_prerequisite_baseline as
select to_jsonb(request) payload
from public.account_deletion_requests request
where id='21000000-0000-4000-8000-000000000020';
set session_replication_role = replica;
insert into public.account_deletion_provider_targets(
  deletion_request_id,user_id,status,delete_outcome,reconciliation_status,
  verified_absent_at,locator_scrubbed_at
)
select id,user_id,'verified_absent','not_found','verified_absent',provider_sub_finalized_at,provider_sub_finalized_at
from public.account_deletion_requests
where id='21000000-0000-4000-8000-000000000020';
set session_replication_role = origin;
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000020','11000000-0000-4000-8000-000000000020','g5d-2h.account-db.v1')$$,
  array['23514'],'already-finalized current Provider evidence corruption'
);
select pg_temp.assert_true(
  (select count(*)=1 from public.account_deletion_provider_targets
    where deletion_request_id='21000000-0000-4000-8000-000000000020')
    and (select to_jsonb(request)=(select payload from g5d2j_corrupt_prerequisite_baseline)
      from public.account_deletion_requests request
      where id='21000000-0000-4000-8000-000000000020')
    and not exists(select 1 from public.profiles where id='11000000-0000-4000-8000-000000000020'),
  'current prerequisite corruption replay repaired or rewrote terminal state'
);

-- Persisted Provider/Storage prerequisites reject before product mutation.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000004','g5d2j-provider-pending@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000005','g5d2j-provider-drift@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000006','g5d2j-storage-pending@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000007','g5d2j-storage-drift@example.invalid',now(),now());
insert into public.account_deletion_requests(id,user_id,status,confirmed_at) values
  ('21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000004','confirmed',now());
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000004','g5d-2h.account-db.v1')$$,
  array['23514'],'Provider nonterminal prerequisite'
);

select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000005'
);
set session_replication_role = replica;
insert into public.account_deletion_provider_targets(
  deletion_request_id,user_id,status,delete_outcome,reconciliation_status,
  verified_absent_at,locator_scrubbed_at
) values (
  '21000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000005',
  'verified_absent','not_found','verified_absent',now(),now()
);
set session_replication_role = origin;
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000005','g5d-2h.account-db.v1')$$,
  array['23514'],'Provider terminal shape drift'
);

select pg_temp.create_provider_terminal_request(
  '11000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000006'
);
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000006','g5d-2h.account-db.v1')$$,
  array['23514'],'Storage nonterminal prerequisite'
);

select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000007'
);
set session_replication_role = replica;
insert into public.account_deletion_storage_targets(
  deletion_request_id,user_id,target_kind,status,delete_outcome,verification_status,
  verified_absent_at,locator_scrubbed_at,prefix_listed,source_refs
) values (
  '21000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000007',
  'recording','verified_absent','succeeded','verified_absent',now(),now(),true,null
);
set session_replication_role = origin;
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000007','g5d-2h.account-db.v1')$$,
  array['23514'],'Storage terminal shape drift'
);
select pg_temp.assert_true(
  (select count(*)=4 from public.profiles where id between
    '11000000-0000-4000-8000-000000000004' and '11000000-0000-4000-8000-000000000007')
    and (select count(*)=0 from public.account_deletion_requests where id between
      '21000000-0000-4000-8000-000000000004' and '21000000-0000-4000-8000-000000000007'
      and db_sub_finalized_at is not null),
  'prerequisite rejection mutated product or DB terminal state'
);

-- C/D: contradictory prior not_needed/nonzero Provider or Storage evidence must
-- block the whole finalizer before the prior request or any product row mutates.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000021','g5d2j-prior-provider-polarity@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000022','g5d2j-prior-storage-polarity@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000023','g5d2j-valid-prior-polarity@example.invalid',now(),now());

insert into public.account_deletion_requests(id,user_id,status,cancelled_at) values
  ('22000000-0000-4000-8000-000000000021','11000000-0000-4000-8000-000000000021','cancelled',now());
set session_replication_role = replica;
update public.account_deletion_requests
set provider_snapshot_status='sealed', provider_snapshot_seal_version=1,
    provider_snapshot_sealed_at=transaction_timestamp(), provider_snapshot_target_count=1,
    provider_verified_absent_count=1, provider_cleanup_status='not_needed',
    provider_sub_finalized_at=transaction_timestamp(),
    provider_locator_scrubbed_at=transaction_timestamp()
where id='22000000-0000-4000-8000-000000000021';
insert into public.account_deletion_provider_targets(
  deletion_request_id,user_id,status,delete_outcome,reconciliation_status,
  verified_absent_at,locator_scrubbed_at
)
select id,user_id,'verified_absent','not_found','verified_absent',provider_sub_finalized_at,provider_sub_finalized_at
from public.account_deletion_requests
where id='22000000-0000-4000-8000-000000000021';
set session_replication_role = origin;
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000021','21000000-0000-4000-8000-000000000021'
);
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000021','11000000-0000-4000-8000-000000000021','g5d-2h.account-db.v1')$$,
  array['55006'],'prior Provider not_needed/nonzero polarity'
);
select pg_temp.assert_true(
  exists(select 1 from public.profiles where id='11000000-0000-4000-8000-000000000021')
    and exists(select 1 from public.account_deletion_requests where id='22000000-0000-4000-8000-000000000021')
    and exists(select 1 from public.account_deletion_provider_targets
      where deletion_request_id='22000000-0000-4000-8000-000000000021')
    and (select db_cleanup_status='pending' and db_sub_finalized_at is null
      and db_observed_row_count=0 and db_deleted_row_count=0
      and db_anonymized_row_count=0 and db_retained_row_count=0
      from public.account_deletion_requests where id='21000000-0000-4000-8000-000000000021'),
  'prior Provider polarity rejection mutated product, prior evidence, or terminal counts'
);

insert into public.account_deletion_requests(id,user_id,status,cancelled_at) values
  ('22000000-0000-4000-8000-000000000022','11000000-0000-4000-8000-000000000022','cancelled',now());
set session_replication_role = replica;
update public.account_deletion_requests
set storage_snapshot_status='sealed', storage_snapshot_seal_version=1,
    storage_snapshot_collection_started_at=transaction_timestamp(),
    storage_snapshot_sealed_at=transaction_timestamp(), storage_snapshot_fingerprint=null,
    storage_snapshot_target_count=1, storage_verified_absent_count=1,
    storage_cleanup_status='not_needed', storage_sub_finalized_at=transaction_timestamp(),
    storage_locator_scrubbed_at=transaction_timestamp()
where id='22000000-0000-4000-8000-000000000022';
insert into public.account_deletion_storage_targets(
  deletion_request_id,user_id,target_kind,status,delete_outcome,verification_status,
  verified_absent_at,locator_scrubbed_at,prefix_listed,source_refs
)
select id,user_id,'recording','verified_absent','succeeded','verified_absent',
  storage_sub_finalized_at,storage_sub_finalized_at,true,null
from public.account_deletion_requests
where id='22000000-0000-4000-8000-000000000022';
set session_replication_role = origin;
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000022','21000000-0000-4000-8000-000000000022'
);
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000022','11000000-0000-4000-8000-000000000022','g5d-2h.account-db.v1')$$,
  array['55006'],'prior Storage not_needed/nonzero polarity'
);
select pg_temp.assert_true(
  exists(select 1 from public.profiles where id='11000000-0000-4000-8000-000000000022')
    and exists(select 1 from public.account_deletion_requests where id='22000000-0000-4000-8000-000000000022')
    and exists(select 1 from public.account_deletion_storage_targets
      where deletion_request_id='22000000-0000-4000-8000-000000000022')
    and (select db_cleanup_status='pending' and db_sub_finalized_at is null
      and db_observed_row_count=0 and db_deleted_row_count=0
      and db_anonymized_row_count=0 and db_retained_row_count=0
      from public.account_deletion_requests where id='21000000-0000-4000-8000-000000000022')
    and (select count(*)=2 and bool_and(content like 'B%') from public.scripts
      where user_id='11000000-0000-4000-8000-000000000002'),
  'prior Storage polarity rejection mutated product, prior evidence, terminal counts, or User B'
);

-- Valid prior terminal combinations remain deletable: not_needed with zero
-- targets and succeeded with one verified/scrubbed target for both stages.
insert into public.account_deletion_requests(id,user_id,status,cancelled_at) values
  ('22000000-0000-4000-8000-000000000231','11000000-0000-4000-8000-000000000023','cancelled',now()),
  ('22000000-0000-4000-8000-000000000232','11000000-0000-4000-8000-000000000023','cancelled',now());
set session_replication_role = replica;
update public.account_deletion_requests
set provider_snapshot_status='sealed', provider_snapshot_seal_version=1,
    provider_snapshot_sealed_at=transaction_timestamp(), provider_cleanup_status='not_needed',
    provider_sub_finalized_at=transaction_timestamp(), provider_locator_scrubbed_at=transaction_timestamp(),
    storage_snapshot_status='sealed', storage_snapshot_seal_version=1,
    storage_snapshot_collection_started_at=transaction_timestamp(),
    storage_snapshot_sealed_at=transaction_timestamp(), storage_snapshot_fingerprint=null,
    storage_cleanup_status='not_needed', storage_sub_finalized_at=transaction_timestamp(),
    storage_locator_scrubbed_at=transaction_timestamp()
where id='22000000-0000-4000-8000-000000000231';
update public.account_deletion_requests
set provider_snapshot_status='sealed', provider_snapshot_seal_version=1,
    provider_snapshot_sealed_at=transaction_timestamp(), provider_snapshot_target_count=1,
    provider_verified_absent_count=1, provider_cleanup_status='succeeded',
    provider_sub_finalized_at=transaction_timestamp(), provider_locator_scrubbed_at=transaction_timestamp(),
    storage_snapshot_status='sealed', storage_snapshot_seal_version=1,
    storage_snapshot_collection_started_at=transaction_timestamp(),
    storage_snapshot_sealed_at=transaction_timestamp(), storage_snapshot_fingerprint=null,
    storage_snapshot_target_count=1, storage_verified_absent_count=1,
    storage_cleanup_status='succeeded', storage_sub_finalized_at=transaction_timestamp(),
    storage_locator_scrubbed_at=transaction_timestamp()
where id='22000000-0000-4000-8000-000000000232';
insert into public.account_deletion_provider_targets(
  deletion_request_id,user_id,status,delete_outcome,reconciliation_status,
  verified_absent_at,locator_scrubbed_at
)
select id,user_id,'verified_absent','not_found','verified_absent',provider_sub_finalized_at,provider_sub_finalized_at
from public.account_deletion_requests
where id='22000000-0000-4000-8000-000000000232';
insert into public.account_deletion_storage_targets(
  deletion_request_id,user_id,target_kind,status,delete_outcome,verification_status,
  verified_absent_at,locator_scrubbed_at,prefix_listed,source_refs
)
select id,user_id,'recording','verified_absent','succeeded','verified_absent',
  storage_sub_finalized_at,storage_sub_finalized_at,true,null
from public.account_deletion_requests
where id='22000000-0000-4000-8000-000000000232';
set session_replication_role = origin;
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000023','21000000-0000-4000-8000-000000000023'
);
create temp table g5d2j_valid_prior_result as
select * from public.finalize_account_deletion_database_stage(
  '21000000-0000-4000-8000-000000000023','11000000-0000-4000-8000-000000000023','g5d-2h.account-db.v1'
);
select pg_temp.assert_true(
  (select db_cleanup_status='succeeded' and db_observed_row_count=6
    and db_deleted_row_count=5 and db_anonymized_row_count=0 and db_retained_row_count=1
    and not already_finalized from g5d2j_valid_prior_result)
    and not exists(select 1 from public.account_deletion_requests
      where id in ('22000000-0000-4000-8000-000000000231','22000000-0000-4000-8000-000000000232'))
    and not exists(select 1 from public.account_deletion_provider_targets
      where deletion_request_id='22000000-0000-4000-8000-000000000232')
    and not exists(select 1 from public.account_deletion_storage_targets
      where deletion_request_id='22000000-0000-4000-8000-000000000232'),
  'valid prior Provider/Storage polarity regression failed'
);

-- Blocking write intents and every unsafe voice-operation state fail closed.
do $$
declare
  v_status text;
  v_user uuid;
  v_request uuid;
  v_suffix integer := 10;
begin
  foreach v_status in array array['pending','processing','partial_failure','manual_required','failed'] loop
    v_user := ('11000000-0000-4000-8000-' || lpad(v_suffix::text,12,'0'))::uuid;
    v_request := ('21000000-0000-4000-8000-' || lpad(v_suffix::text,12,'0'))::uuid;
    insert into auth.users(id,email,created_at,updated_at)
    values(v_user,'g5d2j-voice-' || v_status || '@example.invalid',now(),now());
    insert into public.voice_deletion_operations(user_id,status) values(v_user,v_status);
    perform pg_temp.create_ready_request(v_user,v_request);
    begin
      perform public.finalize_account_deletion_database_stage(v_request,v_user,'g5d-2h.account-db.v1');
      raise exception 'voice blocker % unexpectedly finalized',v_status;
    exception when object_in_use then null;
    end;
    if not exists(select 1 from public.profiles where id=v_user)
      or (select db_sub_finalized_at is not null from public.account_deletion_requests where id=v_request) then
      raise exception 'voice blocker % mutated state',v_status;
    end if;
    v_suffix := v_suffix + 1;
  end loop;
end;
$$;

insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000015','g5d2j-invalid-completed@example.invalid',now(),now());
insert into public.voice_deletion_operations(
  id,user_id,status,snapshot_status,consent_withdrawal_status,post_delete_verification_status,
  completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at
) values (
  '49000000-0000-4000-8000-000000000015','11000000-0000-4000-8000-000000000015',
  'completed','succeeded','not_needed','succeeded',now(),now(),now()+interval '90 days'
);
insert into public.voice_deletion_targets(
  operation_id,user_id,target_kind,source_row_id,target_fingerprint
) values (
  '49000000-0000-4000-8000-000000000015','11000000-0000-4000-8000-000000000015',
  'voice_binding',gen_random_uuid(),'invalid-completed-target'
);
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000015','21000000-0000-4000-8000-000000000015'
);
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000015','11000000-0000-4000-8000-000000000015','g5d-2h.account-db.v1')$$,
  array['55006'],'invalid completed voice audit'
);

insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000016','g5d2j-reserved-intent@example.invalid',now(),now()),
  ('11000000-0000-4000-8000-000000000017','g5d2j-manual-intent@example.invalid',now(),now());
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000016','21000000-0000-4000-8000-000000000016'
);
insert into public.voice_asset_write_intents(user_id,kind,status,lease_token,lease_expires_at) values (
  '11000000-0000-4000-8000-000000000016','voice_create','reserved',gen_random_uuid(),now()+interval '10 minutes'
);
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000016','11000000-0000-4000-8000-000000000016','g5d-2h.account-db.v1')$$,
  array['55006'],'reserved writer intent'
);
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000017','21000000-0000-4000-8000-000000000017'
);
insert into public.voice_asset_write_intents(user_id,kind,status) values (
  '11000000-0000-4000-8000-000000000017','voice_create','manual_required'
);
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000017','11000000-0000-4000-8000-000000000017','g5d-2h.account-db.v1')$$,
  array['55006'],'manual writer intent'
);
select pg_temp.assert_true(
  (select count(*)=8 from public.profiles where id between
    '11000000-0000-4000-8000-000000000010' and '11000000-0000-4000-8000-000000000017')
    and (select count(*)=0 from public.account_deletion_requests where id between
      '21000000-0000-4000-8000-000000000010' and '21000000-0000-4000-8000-000000000017'
      and db_sub_finalized_at is not null),
  'blocking authority mutated product or terminal evidence'
);

-- Forced late failure rolls back deletes, anonymization, and terminal evidence; retry succeeds.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000018','g5d2j-rollback@example.invalid',now(),now());
insert into public.scripts(id,user_id,title,content) values (
  '31000000-0000-4000-8000-000000000018','11000000-0000-4000-8000-000000000018','rollback','recovery data'
);
insert into public.quota_events(
  id,user_id,event_type,status,subject_type,subject_id,idempotency_key,metadata,attempted_at
) values (
  '4b000000-0000-4000-8000-000000000018','11000000-0000-4000-8000-000000000018',
  'script_generation_attempt','succeeded','script_studio','31000000-0000-4000-8000-000000000018',
  'rollback-key','{"recovery":true}',now()
);
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000018','21000000-0000-4000-8000-000000000018'
);
create or replace function public.g5d2j_proof_force_profile_failure()
returns trigger language plpgsql as $$
begin
  if old.id='11000000-0000-4000-8000-000000000018' then
    raise exception using errcode='P0001',message='forced finalizer rollback proof';
  end if;
  return old;
end;
$$;
create trigger g5d2j_proof_force_profile_failure before delete on public.profiles
for each row execute function public.g5d2j_proof_force_profile_failure();
select pg_temp.expect_sqlstate(
  $$select * from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000018','11000000-0000-4000-8000-000000000018','g5d-2h.account-db.v1')$$,
  array['P0001'],'forced transaction rollback'
);
select pg_temp.assert_true(
  exists(select 1 from public.profiles where id='11000000-0000-4000-8000-000000000018')
    and (select content='recovery data' from public.scripts where id='31000000-0000-4000-8000-000000000018')
    and (select user_id='11000000-0000-4000-8000-000000000018'
      and identifier_scrubbed_at is null and metadata='{"recovery":true}'::jsonb
      from public.quota_events where id='4b000000-0000-4000-8000-000000000018')
    and (select db_cleanup_status='pending' and db_sub_finalized_at is null
      and db_observed_row_count=0 from public.account_deletion_requests
      where id='21000000-0000-4000-8000-000000000018'),
  'forced failure committed partial mutation'
);
drop trigger g5d2j_proof_force_profile_failure on public.profiles;
drop function public.g5d2j_proof_force_profile_failure();
select pg_temp.assert_true(
  (select db_cleanup_status='succeeded' and db_observed_row_count=4
    and db_deleted_row_count=2 and db_anonymized_row_count=1 and db_retained_row_count=1
    from public.finalize_account_deletion_database_stage(
      '21000000-0000-4000-8000-000000000018','11000000-0000-4000-8000-000000000018','g5d-2h.account-db.v1')),
  'safe retry after rollback failed'
);

-- Independent sessions: one mutation, one already-finalized replay, target-user
-- late insert rejected, and unrelated User B insert succeeds while A holds lock.
insert into auth.users(id,email,created_at,updated_at) values
  ('11000000-0000-4000-8000-000000000019','g5d2j-concurrency@example.invalid',now(),now());
select pg_temp.create_ready_request(
  '11000000-0000-4000-8000-000000000019','21000000-0000-4000-8000-000000000019'
);
create or replace function public.g5d2j_proof_hold_finalizer()
returns trigger language plpgsql as $$
begin
  if old.id='11000000-0000-4000-8000-000000000019' then
    perform pg_sleep(2);
  end if;
  return old;
end;
$$;
create trigger g5d2j_proof_hold_finalizer before delete on public.profiles
for each row execute function public.g5d2j_proof_hold_finalizer();
select extensions.dblink_connect('g5d2j_a','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('g5d2j_b','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select extensions.dblink_send_query('g5d2j_a',$q$
  select to_jsonb(result)::text from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000019','11000000-0000-4000-8000-000000000019','g5d-2h.account-db.v1'
  ) result
$q$);
select pg_sleep(0.25);
select extensions.dblink_send_query('g5d2j_b',$q$
  select to_jsonb(result)::text from public.finalize_account_deletion_database_stage(
    '21000000-0000-4000-8000-000000000019','11000000-0000-4000-8000-000000000019','g5d-2h.account-db.v1'
  ) result
$q$);
select pg_temp.expect_sqlstate(
  $$insert into public.scripts(user_id,title,content)
    values('11000000-0000-4000-8000-000000000019','late concurrent','must not commit')$$,
  array['55006'],'concurrent target-user writer'
);
insert into public.scripts(id,user_id,title,content) values (
  '31000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000002',
  'B concurrent','B remains writable'
);
create temp table g5d2j_concurrent_results(source text,payload jsonb);
insert into g5d2j_concurrent_results
select 'a',payload::jsonb from extensions.dblink_get_result('g5d2j_a') as result(payload text);
insert into g5d2j_concurrent_results
select 'b',payload::jsonb from extensions.dblink_get_result('g5d2j_b') as result(payload text);
select pg_temp.assert_true(
  (select count(*)=2 and count(*) filter(where (payload->>'already_finalized')::boolean)=1
    and min((payload->>'db_observed_row_count')::integer)=2
    and max((payload->>'db_deleted_row_count')::integer)=1
    and min((payload->>'db_retained_row_count')::integer)=1
    from g5d2j_concurrent_results)
    and not exists(select 1 from public.scripts where user_id='11000000-0000-4000-8000-000000000019')
    and exists(select 1 from public.scripts where id='31000000-0000-4000-8000-000000000004'),
  'concurrent finalizer/writer/User B result mismatch'
);
select extensions.dblink_disconnect('g5d2j_a');
select extensions.dblink_disconnect('g5d2j_b');
drop trigger g5d2j_proof_hold_finalizer on public.profiles;
drop function public.g5d2j_proof_hold_finalizer();

-- The disposable database itself is destroyed after this proof. Remove the only
-- proof-only persistent helpers and verify they are gone before reporting PASS.
select pg_temp.assert_true(
  to_regprocedure('public.g5d2j_proof_force_profile_failure()') is null
    and to_regprocedure('public.g5d2j_proof_hold_finalizer()') is null
    and to_regprocedure('public.g5d2j_proof_preterminal_writer(uuid)') is null,
  'proof-only persistent helper cleanup failed'
);

\o
\echo 'G5D_2J_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS'
