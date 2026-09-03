\set ON_ERROR_STOP on

\if :{?g5d2m_isolated}
\else
  \echo 'g5d2m_isolated variable is required; refusing to run'
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
    if sqlstate = any(p_expected) then return; end if;
    raise exception '%: expected %, got % (%)', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception '%: expected failure %, but statement succeeded', p_label, p_expected;
end;
$$;

create or replace function pg_temp.finish_provider(p_user_id uuid, p_request_id uuid)
returns void language plpgsql as $$
declare
  v_token uuid := gen_random_uuid();
  v_target record;
  v_request public.account_deletion_requests;
begin
  perform public.seal_account_deletion_provider_snapshot(p_request_id, p_user_id);
  select * into v_request from public.claim_account_deletion_provider_lease(
    p_request_id, p_user_id, v_token, 600
  );
  for v_target in
    select id from public.account_deletion_provider_targets
    where deletion_request_id = p_request_id order by id
  loop
    perform public.begin_account_deletion_provider_delete_attempt(
      p_request_id, p_user_id, v_target.id, v_token, v_request.provider_runner_attempt_count, 0
    );
    perform public.record_account_deletion_provider_delete_result(
      p_request_id, p_user_id, v_target.id, v_token, v_request.provider_runner_attempt_count, 1,
      'not_found', 0
    );
    perform public.begin_account_deletion_provider_reconciliation_attempt(
      p_request_id, p_user_id, v_target.id, v_token, v_request.provider_runner_attempt_count, 0
    );
    perform public.record_account_deletion_provider_reconciliation_result(
      p_request_id, p_user_id, v_target.id, v_token, v_request.provider_runner_attempt_count, 1,
      'verified_absent', null, 0
    );
  end loop;
  perform public.finalize_account_deletion_provider_stage(
    p_request_id, p_user_id, v_token, v_request.provider_runner_attempt_count
  );
end;
$$;

create or replace function pg_temp.finish_storage(
  p_user_id uuid,
  p_request_id uuid,
  p_inventory jsonb
)
returns void language plpgsql as $$
declare
  v_collection uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_target record;
  v_request public.account_deletion_requests;
begin
  perform public.begin_account_deletion_storage_snapshot(p_request_id, p_user_id, v_collection);
  perform public.seal_account_deletion_storage_snapshot(p_request_id, p_user_id, v_collection, p_inventory);
  select * into v_request from public.claim_account_deletion_storage_lease(
    p_request_id, p_user_id, v_token, 600
  );
  for v_target in
    select id from public.account_deletion_storage_targets
    where deletion_request_id = p_request_id order by id
  loop
    perform public.begin_account_deletion_storage_delete_attempt(
      p_request_id, p_user_id, v_target.id, v_token, v_request.storage_runner_attempt_count, 0
    );
    perform public.record_account_deletion_storage_delete_result(
      p_request_id, p_user_id, v_target.id, v_token, v_request.storage_runner_attempt_count, 1,
      'request_succeeded', 0
    );
    perform public.begin_account_deletion_storage_verification_attempt(
      p_request_id, p_user_id, v_target.id, v_token, v_request.storage_runner_attempt_count, 0
    );
    perform public.record_account_deletion_storage_verification_result(
      p_request_id, p_user_id, v_target.id, v_token, v_request.storage_runner_attempt_count, 1,
      'absent', 0
    );
  end loop;
  perform public.finalize_account_deletion_storage_stage(
    p_request_id, p_user_id, v_token, v_request.storage_runner_attempt_count
  );
end;
$$;

create or replace function pg_temp.create_zero_db_terminal_request(p_user_id uuid, p_request_id uuid)
returns void language plpgsql as $$
begin
  insert into public.account_deletion_requests(id,user_id,status,confirmed_at)
  values(p_request_id,p_user_id,'confirmed',transaction_timestamp());
  perform pg_temp.finish_provider(p_user_id,p_request_id);
  perform pg_temp.finish_storage(
    p_user_id,p_request_id,
    jsonb_build_object(
      'recordings','[]'::jsonb,'script-audios','[]'::jsonb,
      'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb
    )
  );
  perform public.finalize_account_deletion_database_stage(
    p_request_id,p_user_id,'g5d-2h.account-db.v1'
  );
end;
$$;

-- Clean migration history and catalog identity.
select pg_temp.assert_true(
  (select array_agg(version order by version) from supabase_migrations.schema_migrations) =
    array['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012',
          '0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024','0025','0026'],
  'migration history is not exact 0001 through 0026'
);

select pg_temp.assert_true(
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='account_deletion_requests'
      and column_name in (
        'auth_intent_version','auth_delete_target_user_id','auth_delete_generation',
        'auth_delete_requested_at','auth_verification_attempt_count',
        'auth_verification_result','auth_verification_result_attempt_count',
        'auth_verified_absent_at','auth_sub_finalized_at'
      )) = 9,
  'Auth durable columns are incomplete'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_constraint constraint_value
    join pg_attribute attribute_value
      on attribute_value.attrelid=constraint_value.conrelid
      and attribute_value.attnum=any(constraint_value.conkey)
    where constraint_value.conrelid='public.account_deletion_requests'::regclass
      and constraint_value.contype='f'
      and attribute_value.attname='auth_delete_target_user_id'
  ),
  'temporary Auth target unexpectedly has a foreign key'
);

select pg_temp.assert_true(
  (select count(*) from pg_constraint where conrelid='public.account_deletion_requests'::regclass
    and conname in (
      'account_deletion_requests_auth_delete_generation_check',
      'account_deletion_requests_auth_verification_attempt_count_check',
      'account_deletion_requests_auth_verification_result_check',
      'account_deletion_requests_auth_verification_result_binding_check',
      'account_deletion_requests_auth_durable_shape_check'
    ))=5,
  'Auth durable constraints are incomplete'
);

select pg_temp.assert_true(
  (select bool_and(proowner='postgres'::regrole and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']
      and position('current_setting(' in prosrc)=0
      and position('set_config(' in prosrc)=0)
   from pg_proc
   where oid in (
     'public.seal_account_deletion_auth_intent(uuid,uuid,text)'::regprocedure,
     'public.begin_account_deletion_auth_verification_attempt(uuid,uuid,text,integer)'::regprocedure,
     'public.record_account_deletion_auth_verification_result(uuid,uuid,text,integer,text)'::regprocedure,
     'public.authorize_account_deletion_auth_delete_dispatch(uuid,uuid,text,integer)'::regprocedure,
     'public.record_account_deletion_auth_dispatch_outcome(uuid,uuid,text,text)'::regprocedure,
     'public.finalize_account_deletion_auth_stage(uuid,text,integer,integer)'::regprocedure
   )) is true,
  'focused Auth RPC owner/security/search_path/source mismatch'
);

select pg_temp.assert_true(
  (select bool_and(
      has_function_privilege('service_role',oid,'execute')
      and not has_function_privilege('public',oid,'execute')
      and not has_function_privilege('anon',oid,'execute')
      and not has_function_privilege('authenticated',oid,'execute')
    ) from pg_proc where oid in (
      'public.seal_account_deletion_auth_intent(uuid,uuid,text)'::regprocedure,
      'public.begin_account_deletion_auth_verification_attempt(uuid,uuid,text,integer)'::regprocedure,
      'public.record_account_deletion_auth_verification_result(uuid,uuid,text,integer,text)'::regprocedure,
      'public.authorize_account_deletion_auth_delete_dispatch(uuid,uuid,text,integer)'::regprocedure,
      'public.record_account_deletion_auth_dispatch_outcome(uuid,uuid,text,text)'::regprocedure,
      'public.finalize_account_deletion_auth_stage(uuid,text,integer,integer)'::regprocedure
    )) is true,
  'focused Auth RPC execute ACL mismatch'
);

select pg_temp.assert_true(
  (select bool_and(not has_column_privilege(role_name,'public.account_deletion_requests',column_name,'update'))
   from unnest(array['public','anon','authenticated','service_role']) as roles(role_name)
   cross join unnest(array[
       'auth_intent_version','auth_delete_target_user_id','auth_delete_generation',
       'auth_delete_requested_at','auth_verification_attempt_count',
       'auth_verification_result','auth_verification_result_attempt_count','auth_verified_absent_at',
       'auth_sub_finalized_at','auth_cleanup_status'
     ]) as protected(column_name)),
  'application role or service_role can directly update protected Auth durable columns'
);

select pg_temp.assert_true(
  has_table_privilege('service_role','public.account_deletion_requests','select')
  and not has_table_privilege('public','public.account_deletion_requests','select')
  and not has_table_privilege('anon','public.account_deletion_requests','select')
  and not has_table_privilege('authenticated','public.account_deletion_requests','select')
  and not has_column_privilege('authenticated','public.account_deletion_requests','auth_delete_target_user_id','select')
  and not has_column_privilege('anon','public.account_deletion_requests','auth_delete_target_user_id','select')
  and not has_column_privilege('authenticated','public.account_deletion_requests','auth_verification_result','select')
  and not has_column_privilege('authenticated','public.account_deletion_requests','auth_verification_result_attempt_count','select')
  and has_column_privilege('authenticated','public.account_deletion_requests','status','select')
  and has_column_privilege('service_role','public.account_deletion_requests','auth_delete_target_user_id','select'),
  'temporary Auth target SELECT exposure is not server-only'
);

-- Main fixture: valid product data is cleaned by DB first; Auth never inherits it.
insert into auth.users(id,email,created_at,updated_at) values
  ('10000000-0000-4000-8000-000000000001','g5d2m-a@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000002','g5d2m-b@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000003','g5d2m-c@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000004','g5d2m-d@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000005','g5d2m-e@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000006','g5d2m-f@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000007','g5d2m-g@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000008','g5d2m-h@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000009','g5d2m-i@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000010','g5d2m-j@example.invalid',now(),now());

insert into public.scripts(id,user_id,title,content) values(
  '30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'Disposable A','Disposable one-minute content'
);
insert into public.takes(id,script_id,user_id,audio_path,status) values(
  '40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'storage://recordings/10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/take.wav',
  'completed'
);
insert into public.voice_consents(id,user_id,provider,metadata) values(
  '50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'elevenlabs','{}'::jsonb
);
insert into public.voices(
  id,user_id,provider,provider_voice_id,label,sample_audio_path,consent_id
) values(
  '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'elevenlabs','g5d2m_voice_a','Disposable voice',
  'storage://voice-samples/10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001/sample.wav',
  '50000000-0000-4000-8000-000000000001'
);

insert into public.voice_deletion_operations(
  id,user_id,status,current_stage,snapshot_status,consent_withdrawal_status,
  post_delete_verification_status,completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at
) values(
  '70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'completed',null,'succeeded','not_needed','succeeded',now(),now(),now()+interval '90 days'
);
insert into public.voice_deletion_targets(
  id,operation_id,user_id,target_kind,status,delete_outcome,reconciliation_status,
  verification_status,verified_absent_at,locator_scrubbed_at
) values(
  '71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','voice_binding','verified_absent','not_needed',
  'not_applicable','verified_absent',now(),now()
);
insert into public.quota_events(
  id,user_id,event_type,status,subject_type,subject_id,idempotency_key,metadata,attempted_at
) values(
  '72000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'script_generation_attempt','succeeded','script_studio','30000000-0000-4000-8000-000000000001',
  'g5d2m-a-quota','{"private":"must_scrub"}'::jsonb,now()
);

insert into public.account_deletion_requests(id,user_id,status,confirmed_at) values(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed',now()
);
select pg_temp.finish_provider(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'
);

-- Auth intent cannot be created while DB is nonterminal even when caller data says otherwise.
select pg_temp.expect_sqlstate(
  $$select public.seal_account_deletion_auth_intent(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    'g5d-2m.auth-delete.v1')$$,
  array['23514'],'DB-nonterminal Auth intent'
);

select pg_temp.finish_storage(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'recordings',jsonb_build_array(
      '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/take.wav'
    ),
    'script-audios','[]'::jsonb,
    'voice-samples',jsonb_build_array(
      '10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001/sample.wav'
    ),
    'voice-consents','[]'::jsonb
  )
);
select * from public.finalize_account_deletion_database_stage(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2h.account-db.v1'
);

-- A single nullable prerequisite must be false rather than SQL UNKNOWN.
select pg_temp.assert_true(
  public.account_deletion_auth_prior_stages_terminal(
    jsonb_populate_record(
      null::public.account_deletion_requests,
      to_jsonb(request_value) || jsonb_build_object('provider_snapshot_version', null)
    )
  ) is false,
  'nullable prior-stage drift did not fail closed'
)
from public.account_deletion_requests request_value
where id='20000000-0000-4000-8000-000000000001';

select pg_temp.assert_true(
  not exists(select 1 from public.scripts where user_id='10000000-0000-4000-8000-000000000001')
  and not exists(select 1 from public.takes where user_id='10000000-0000-4000-8000-000000000001')
  and not exists(select 1 from public.voices where user_id='10000000-0000-4000-8000-000000000001'),
  'DB-terminal prerequisite left product rows for Auth CASCADE'
);

select pg_temp.expect_sqlstate(
  $$select public.seal_account_deletion_auth_intent(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
    'g5d-2m.auth-delete.v1')$$,
  array['23514'],'caller target substitution'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2m.auth-delete.v1'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2m.auth-delete.v1',1,'present'
);

-- The server repository performs this table SELECT as service_role. Exercise the
-- complete REQUEST_SELECT surface with non-null target/current-result authority.
set role service_role;
select
  id, user_id, anonymized_user_ref, status, failure_stage, failure_reason_code,
  provider_cleanup_status, provider_snapshot_version, provider_snapshot_status,
  provider_snapshot_seal_version, provider_snapshot_sealed_at, provider_snapshot_target_count,
  provider_verified_absent_count, provider_runner_lease_token, provider_runner_lease_expires_at,
  provider_sub_finalized_at, provider_locator_scrubbed_at, storage_cleanup_status,
  storage_snapshot_version, storage_snapshot_status, storage_snapshot_seal_version,
  storage_snapshot_sealed_at, storage_snapshot_fingerprint, storage_snapshot_target_count,
  storage_verified_absent_count, storage_runner_lease_token, storage_runner_lease_expires_at,
  storage_sub_finalized_at, storage_locator_scrubbed_at, db_cleanup_status,
  db_inventory_version, db_observed_row_count, db_deleted_row_count,
  db_anonymized_row_count, db_retained_row_count, db_sub_finalized_at,
  auth_cleanup_status, auth_intent_version, auth_delete_target_user_id,
  auth_delete_generation, auth_delete_requested_at, auth_verification_attempt_count,
  auth_verification_result, auth_verification_result_attempt_count,
  auth_verified_absent_at, auth_sub_finalized_at, retry_count, last_attempted_at, metadata
from public.account_deletion_requests
where id='20000000-0000-4000-8000-000000000001';

select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set
      auth_intent_version=auth_intent_version,
      auth_delete_target_user_id=auth_delete_target_user_id,
      auth_delete_generation=auth_delete_generation,
      auth_delete_requested_at=auth_delete_requested_at,
      auth_verification_attempt_count=auth_verification_attempt_count,
      auth_verification_result=auth_verification_result,
      auth_verification_result_attempt_count=auth_verification_result_attempt_count,
      auth_verified_absent_at=auth_verified_absent_at,
      auth_sub_finalized_at=auth_sub_finalized_at,
      auth_cleanup_status=auth_cleanup_status
    where false$$,
  array['42501'],'service_role protected Auth durable UPDATE'
);
reset role;

set role anon;
select pg_temp.expect_sqlstate(
  $$select auth_delete_target_user_id, auth_verification_result,
      auth_verification_result_attempt_count
    from public.account_deletion_requests limit 1$$,
  array['42501'],'anon protected Auth durable SELECT'
);
reset role;

set role authenticated;
select pg_temp.expect_sqlstate(
  $$select auth_delete_target_user_id, auth_verification_result,
      auth_verification_result_attempt_count
    from public.account_deletion_requests limit 1$$,
  array['42501'],'authenticated protected Auth durable SELECT'
);
reset role;

create role g5d2m_public_probe nologin;
grant g5d2m_public_probe to postgres;
set role g5d2m_public_probe;
select pg_temp.expect_sqlstate(
  $$select auth_delete_target_user_id, auth_verification_result,
      auth_verification_result_attempt_count
    from public.account_deletion_requests limit 1$$,
  array['42501'],'PUBLIC-only protected Auth durable SELECT'
);
reset role;
drop role g5d2m_public_probe;

-- P1-1 A: beginning a GET attempt alone never authorizes DELETE.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000007'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  'g5d-2m.auth-delete.v1',0
);
select pg_temp.assert_true(
  public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
    'g5d-2m.auth-delete.v1',1
  ) is null
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000007'
      and auth_delete_generation=0 and auth_verification_attempt_count=1
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null),
  'verification begin without a recorded GET result authorized DELETE'
);

-- Partial/misaligned current-result combinations are rejected by table checks.
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set auth_verification_result='present'
    where id='20000000-0000-4000-8000-000000000007'$$,
  array['23514'],'verification result without attempt binding'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set auth_verification_result_attempt_count=1
    where id='20000000-0000-4000-8000-000000000007'$$,
  array['23514'],'verification attempt binding without result'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests
    set auth_verification_result='present',auth_verification_result_attempt_count=2
    where id='20000000-0000-4000-8000-000000000007'$$,
  array['23514'],'verification result binding beyond current attempt'
);

-- P1-1 B: an exact current UNKNOWN result is durable but cannot authorize.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000008'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  'g5d-2m.auth-delete.v1',1,'network_error'
);
select pg_temp.assert_true(
  public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
    'g5d-2m.auth-delete.v1',1
  ) is null
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000008'
      and auth_delete_generation=0 and auth_verification_result='unknown'
      and auth_verification_result_attempt_count=1),
  'current UNKNOWN verification result authorized DELETE'
);

-- P1-1 C: strict current ABSENT evidence cannot authorize DELETE.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000009'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009',
  'g5d-2m.auth-delete.v1'
);
delete from auth.users where id='10000000-0000-4000-8000-000000000009';
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009',
  'g5d-2m.auth-delete.v1',1,'verified_absent'
);
select pg_temp.assert_true(
  public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009',
    'g5d-2m.auth-delete.v1',1
  ) is null
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000009'
      and auth_delete_generation=0 and auth_verification_result='absent'
      and auth_verification_result_attempt_count=1),
  'current ABSENT verification result authorized DELETE'
);

-- P1-1 D/E/F: a new begin clears old PRESENT; only current PRESENT wins once.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000010'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
  'g5d-2m.auth-delete.v1',1,'present'
);
select pg_temp.assert_true(
  public.record_account_deletion_auth_verification_result(
    '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
    'g5d-2m.auth-delete.v1',1,'network_error'
  ) is null,
  'duplicate conflicting verification result was accepted'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
  'g5d-2m.auth-delete.v1',1
);
select pg_temp.assert_true(
  public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
    'g5d-2m.auth-delete.v1',1
  ) is null
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000010'
      and auth_delete_generation=0 and auth_verification_attempt_count=2
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null),
  'stale prior-attempt PRESENT evidence authorized DELETE'
);
select pg_temp.assert_true(
  public.record_account_deletion_auth_verification_result(
    '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
    'g5d-2m.auth-delete.v1',3,'present'
  ) is null
  and public.record_account_deletion_auth_verification_result(
    '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000002',
    'g5d-2m.auth-delete.v1',2,'present'
  ) is null,
  'future-attempt or wrong-target verification result was accepted'
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
  'g5d-2m.auth-delete.v1',2,'present'
);
select pg_temp.assert_true(
  (public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
    'g5d-2m.auth-delete.v1',2
  )).auth_delete_generation=1,
  'current-attempt PRESENT evidence did not authorize one DELETE generation'
);
select pg_temp.assert_true(
  exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000010'
      and auth_delete_generation=1
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null)
  and public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
    'g5d-2m.auth-delete.v1',2
  ) is null,
  'successful dispatch did not consume PRESENT or replay was authorized'
);
select public.record_account_deletion_auth_dispatch_outcome(
  '20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
  'g5d-2m.auth-delete.v1','malformed'
);
select pg_temp.assert_true(
  exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000010'
      and auth_cleanup_status='failed'
      and failure_reason_code='auth_delete_malformed_outcome_unknown'
      and auth_delete_generation=1
      and auth_delete_target_user_id='10000000-0000-4000-8000-000000000010'
      and auth_sub_finalized_at is null),
  'malformed DELETE response became terminal or sticky manual'
);

-- P1-1 G: two independent sessions contend for the same current PRESENT.
create extension if not exists dblink with schema extensions;
create or replace function public.g5d2m_proof_auth_cas(p_request uuid,p_target uuid)
returns boolean language plpgsql as $$
declare v_request public.account_deletion_requests;
begin
  v_request := public.authorize_account_deletion_auth_delete_dispatch(
    p_request,p_target,'g5d-2m.auth-delete.v1',1
  );
  return coalesce(v_request.auth_delete_generation=1,false);
end;
$$;
select extensions.dblink_connect('g5d2m_cas_a','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('g5d2m_cas_b','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select extensions.dblink_send_query('g5d2m_cas_a',
  $$select public.g5d2m_proof_auth_cas('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$
);
select extensions.dblink_send_query('g5d2m_cas_b',
  $$select public.g5d2m_proof_auth_cas('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$
);
create temp table g5d2m_cas_results(won boolean);
insert into g5d2m_cas_results select won from extensions.dblink_get_result('g5d2m_cas_a') as result(won boolean);
insert into g5d2m_cas_results select won from extensions.dblink_get_result('g5d2m_cas_b') as result(won boolean);
select pg_temp.assert_true(
  (select count(*) filter(where won) from g5d2m_cas_results)=1
  and (select count(*) filter(where not won) from g5d2m_cas_results)=1
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000001'
      and auth_delete_generation=1
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null),
  'two-session Auth CAS did not produce exactly one winner'
);
select extensions.dblink_disconnect('g5d2m_cas_a');
select extensions.dblink_disconnect('g5d2m_cas_b');
drop function public.g5d2m_proof_auth_cas(uuid,uuid);

select pg_temp.assert_true(
  public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    'g5d-2m.auth-delete.v1',1
  ) is null,
  'stale generation-1 CAS unexpectedly won'
);

select pg_temp.expect_sqlstate(
  $$set local role service_role;
    update public.account_deletion_requests set auth_delete_generation=0
    where id='20000000-0000-4000-8000-000000000001'$$,
  array['42501'],'service-role protected-column update'
);

-- Local disposable auth.users deletion simulates external Auth hard deletion.
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000001'
      and user_id is null
      and auth_delete_target_user_id='10000000-0000-4000-8000-000000000001'
      and auth_delete_generation=1
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null
      and auth_sub_finalized_at is null
      and completed_at is null and expires_at is null)
  and (select count(*) from public.account_deletion_provider_targets
    where deletion_request_id='20000000-0000-4000-8000-000000000001' and user_id is null)=1
  and (select count(*) from public.account_deletion_storage_targets
    where deletion_request_id='20000000-0000-4000-8000-000000000001' and user_id is null)=2
  and exists(select 1 from public.voice_deletion_operations
    where id='70000000-0000-4000-8000-000000000001' and user_id is null)
  and exists(select 1 from public.voice_deletion_targets
    where id='71000000-0000-4000-8000-000000000001' and user_id is null)
  and exists(select 1 from public.quota_events
    where id='72000000-0000-4000-8000-000000000001' and user_id is null
      and identifier_scrubbed_at is not null and metadata='{}'::jsonb),
  'owner-null lifecycle did not retain exact durable/audit authority'
);

select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2m.auth-delete.v1',1
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'g5d-2m.auth-delete.v1',2,'verified_absent'
);
select public.finalize_account_deletion_auth_stage(
  '20000000-0000-4000-8000-000000000001','g5d-2m.auth-delete.v1',1,2
);

select pg_temp.assert_true(
  exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000001'
      and user_id is null and auth_delete_target_user_id is null
      and auth_cleanup_status='succeeded' and auth_delete_generation=1
      and auth_verification_result is null
      and auth_verification_result_attempt_count is null
      and auth_verified_absent_at is not null and auth_sub_finalized_at is not null
      and status='confirmed' and failure_stage is null and failure_reason_code is null
      and completed_at is null and expires_at is null)
  and (select count(*) from public.account_deletion_provider_targets
    where deletion_request_id='20000000-0000-4000-8000-000000000001')=1
  and (select count(*) from public.account_deletion_storage_targets
    where deletion_request_id='20000000-0000-4000-8000-000000000001')=2,
  'Auth succeeded sub-finalization/continuation shape is invalid'
);

select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set auth_verified_absent_at=now()
    where id='20000000-0000-4000-8000-000000000001'$$,
  array['23514'],'terminal Auth evidence immutability'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set auth_delete_target_user_id='10000000-0000-4000-8000-000000000001'
    where id='20000000-0000-4000-8000-000000000001'$$,
  array['23514'],'terminal Auth target restoration'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests
    set auth_verification_result='present',auth_verification_result_attempt_count=2
    where id='20000000-0000-4000-8000-000000000001'$$,
  array['23514'],'terminal Auth row retained current verification authority'
);
select pg_temp.assert_true(
  public.record_account_deletion_auth_verification_result(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    'g5d-2m.auth-delete.v1',2,'present'
  ) is null,
  'terminal Auth request accepted a new verification result'
);

-- Generation zero + owner-null + exact absence has the opposite terminal polarity.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',
  'g5d-2m.auth-delete.v1'
);
delete from auth.users where id='10000000-0000-4000-8000-000000000003';
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',
  'g5d-2m.auth-delete.v1',1,'verified_absent'
);
select public.finalize_account_deletion_auth_stage(
  '20000000-0000-4000-8000-000000000003','g5d-2m.auth-delete.v1',0,1
);
select pg_temp.assert_true(
  exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000003'
      and auth_cleanup_status='not_needed' and auth_delete_generation=0
      and auth_delete_target_user_id is null and auth_sub_finalized_at is not null
      and completed_at is null),
  'generation-zero not_needed polarity is invalid'
);

-- Strict absence without owner-null is persisted as sticky manual, never terminal.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
  'g5d-2m.auth-delete.v1',1,'verified_absent'
);
select pg_temp.assert_true(
  public.finalize_account_deletion_auth_stage(
    '20000000-0000-4000-8000-000000000004','g5d-2m.auth-delete.v1',0,1
  ) is null
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000004'
      and user_id='10000000-0000-4000-8000-000000000004'
      and auth_cleanup_status='manual_required'
      and auth_delete_target_user_id='10000000-0000-4000-8000-000000000004'
      and auth_sub_finalized_at is null),
  'owner-nonnull verified absence unexpectedly terminalized'
);

-- CAS-success/process-crash ambiguity: generation 1 plus present becomes sticky manual.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  'g5d-2m.auth-delete.v1'
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  'g5d-2m.auth-delete.v1',1,'present'
);
select public.authorize_account_deletion_auth_delete_dispatch(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  'g5d-2m.auth-delete.v1',1
);
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  'g5d-2m.auth-delete.v1',1
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  'g5d-2m.auth-delete.v1',2,'present'
);
select pg_temp.assert_true(
  public.authorize_account_deletion_auth_delete_dispatch(
    '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
    'g5d-2m.auth-delete.v1',2
  ) is null
  and exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000005'
      and auth_delete_generation=1 and auth_verification_attempt_count=2
      and auth_cleanup_status='manual_required'
      and auth_delete_target_user_id='10000000-0000-4000-8000-000000000005'
      and auth_sub_finalized_at is null),
  'generation-1 present ambiguity was not sticky/manual'
);

-- The sub-finalizer rechecks each closed parent authority. Corruption is created
-- only with trigger bypass inside this disposable proof database, then restored.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006'
);
select public.seal_account_deletion_auth_intent(
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  'g5d-2m.auth-delete.v1'
);
delete from auth.users where id='10000000-0000-4000-8000-000000000006';
select public.begin_account_deletion_auth_verification_attempt(
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  'g5d-2m.auth-delete.v1',0
);
select public.record_account_deletion_auth_verification_result(
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  'g5d-2m.auth-delete.v1',1,'verified_absent'
);
create temp table g5d2m_parent_baseline as
select provider_cleanup_status,provider_sub_finalized_at,
  storage_cleanup_status,storage_sub_finalized_at,
  db_cleanup_status,db_sub_finalized_at,
  db_observed_row_count,db_deleted_row_count,db_anonymized_row_count,db_retained_row_count
from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000006';

set session_replication_role=replica;
update public.account_deletion_requests
set provider_cleanup_status='pending',provider_sub_finalized_at=null
where id='20000000-0000-4000-8000-000000000006';
set session_replication_role=origin;
select pg_temp.assert_true(
  public.finalize_account_deletion_auth_stage(
    '20000000-0000-4000-8000-000000000006','g5d-2m.auth-delete.v1',0,1
  ) is null,
  'Auth sub-finalizer ignored Provider terminal drift'
);
set session_replication_role=replica;
update public.account_deletion_requests request
set provider_cleanup_status=baseline.provider_cleanup_status,
    provider_sub_finalized_at=baseline.provider_sub_finalized_at
from g5d2m_parent_baseline baseline
where request.id='20000000-0000-4000-8000-000000000006';

update public.account_deletion_requests
set storage_cleanup_status='pending',storage_sub_finalized_at=null
where id='20000000-0000-4000-8000-000000000006';
set session_replication_role=origin;
select pg_temp.assert_true(
  public.finalize_account_deletion_auth_stage(
    '20000000-0000-4000-8000-000000000006','g5d-2m.auth-delete.v1',0,1
  ) is null,
  'Auth sub-finalizer ignored Storage terminal drift'
);
set session_replication_role=replica;
update public.account_deletion_requests request
set storage_cleanup_status=baseline.storage_cleanup_status,
    storage_sub_finalized_at=baseline.storage_sub_finalized_at
from g5d2m_parent_baseline baseline
where request.id='20000000-0000-4000-8000-000000000006';

update public.account_deletion_requests
set db_cleanup_status='pending',db_sub_finalized_at=null,
    db_observed_row_count=0,db_deleted_row_count=0,db_anonymized_row_count=0,db_retained_row_count=0
where id='20000000-0000-4000-8000-000000000006';
set session_replication_role=origin;
select pg_temp.assert_true(
  public.finalize_account_deletion_auth_stage(
    '20000000-0000-4000-8000-000000000006','g5d-2m.auth-delete.v1',0,1
  ) is null,
  'Auth sub-finalizer ignored DB terminal drift'
);
set session_replication_role=replica;
update public.account_deletion_requests request
set db_cleanup_status=baseline.db_cleanup_status,db_sub_finalized_at=baseline.db_sub_finalized_at,
    db_observed_row_count=baseline.db_observed_row_count,
    db_deleted_row_count=baseline.db_deleted_row_count,
    db_anonymized_row_count=baseline.db_anonymized_row_count,
    db_retained_row_count=baseline.db_retained_row_count
from g5d2m_parent_baseline baseline
where request.id='20000000-0000-4000-8000-000000000006';
set session_replication_role=origin;
select pg_temp.assert_true(
  (public.finalize_account_deletion_auth_stage(
    '20000000-0000-4000-8000-000000000006','g5d-2m.auth-delete.v1',0,1
  )).auth_cleanup_status='not_needed',
  'Auth sub-finalizer did not recover after valid parent authority restoration'
);

-- User B remains outside every User A transition.
select pg_temp.create_zero_db_terminal_request(
  '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'
);
select pg_temp.expect_sqlstate(
  $$select public.seal_account_deletion_auth_intent(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
    'g5d-2m.auth-delete.v1')$$,
  array['23514'],'User A/B intent isolation'
);
select pg_temp.assert_true(
  exists(select 1 from public.account_deletion_requests
    where id='20000000-0000-4000-8000-000000000002'
      and user_id='10000000-0000-4000-8000-000000000002'
      and auth_intent_version is null and auth_delete_generation=0
      and auth_verification_attempt_count=0),
  'User B durable state changed'
);

\o
\echo 'G5D_2M_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS'
