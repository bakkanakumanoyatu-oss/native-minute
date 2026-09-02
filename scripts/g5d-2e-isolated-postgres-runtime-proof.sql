\set ON_ERROR_STOP on

\if :{?g5d2e_isolated}
\else
  \echo 'g5d2e_isolated variable is required; refusing to run'
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
  raise exception '%: expected failure % but statement succeeded', p_label, p_expected;
end;
$$;

create or replace function pg_temp.assert_row_count(p_sql text, p_expected bigint, p_label text)
returns void language plpgsql as $$
declare v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  if v_count is distinct from p_expected then
    raise exception '%: expected row count %, got %', p_label, p_expected, v_count;
  end if;
end;
$$;

create or replace function pg_temp.create_provider_ready_request(p_user_id uuid, p_request_id uuid)
returns void language plpgsql as $$
declare v_token uuid := gen_random_uuid();
begin
  insert into public.account_deletion_requests (id, user_id, status, confirmed_at)
  values (p_request_id, p_user_id, 'confirmed', now());
  perform public.seal_account_deletion_provider_snapshot(p_request_id, p_user_id);
  perform public.claim_account_deletion_provider_lease(p_request_id, p_user_id, v_token, 60);
  if (public.finalize_account_deletion_provider_stage(p_request_id, p_user_id, v_token, 1)).provider_cleanup_status
      is distinct from 'not_needed' then
    raise exception 'provider prerequisite finalization failed for fixture %', p_request_id;
  end if;
end;
$$;

-- Make the proof safely repeatable inside the same disposable database.
drop trigger if exists g5d2e_isolated_proof_fail_scrub on public.account_deletion_storage_targets;
drop function if exists public.g5d2e_isolated_proof_fail_scrub();
drop function if exists public.g5d2e_isolated_proof_hold_lease();
delete from public.account_deletion_requests where id between
  '20000000-0000-4000-8000-000000000001' and '20000000-0000-4000-8000-000000000008';
delete from public.scripts where user_id between
  '10000000-0000-4000-8000-000000000001' and '10000000-0000-4000-8000-000000000008';
delete from auth.users where id between
  '10000000-0000-4000-8000-000000000001' and '10000000-0000-4000-8000-000000000008';
begin;
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like '10000000-0000-4000-8000-000000000001/%';
commit;

-- Clean 0001 -> 0023 history and actual catalog/ACL proof.
select pg_temp.assert_true(
  (select array_agg(version order by version) from supabase_migrations.schema_migrations) =
    array['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012',
          '0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023'],
  'migration history is not exact 0001 through 0023'
);

select pg_temp.assert_true(
  (select c.relowner = 'postgres'::regrole and c.relrowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'account_deletion_storage_targets'),
  'Storage target table owner/RLS mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 0 from pg_policy
    where polrelid = 'public.account_deletion_storage_targets'::regclass),
  'Storage target table must have no RLS policy'
);
select pg_temp.assert_true(
  not has_table_privilege('public', 'public.account_deletion_storage_targets', 'select')
    and not has_table_privilege('anon', 'public.account_deletion_storage_targets', 'select')
    and not has_table_privilege('authenticated', 'public.account_deletion_storage_targets', 'select')
    and has_table_privilege('service_role', 'public.account_deletion_storage_targets', 'select')
    and not has_table_privilege('service_role', 'public.account_deletion_storage_targets', 'insert,update,delete'),
  'Storage target table ACL mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(confdeltype = 'c') and bool_and(confupdtype in ('a','c'))
     from pg_constraint
    where conrelid = 'public.account_deletion_storage_targets'::regclass and contype = 'f'),
  'Storage target dual FK lifecycle mismatch'
);
select pg_temp.assert_true(
  (select array_agg(conname::text order by conname) = array[
      'account_deletion_storage_targets_attempt_counts_check',
      'account_deletion_storage_targets_delete_outcome_check',
      'account_deletion_storage_targets_kind_bucket_check',
      'account_deletion_storage_targets_kind_check',
      'account_deletion_storage_targets_locator_shape_check',
      'account_deletion_storage_targets_pkey',
      'account_deletion_storage_targets_request_fkey',
      'account_deletion_storage_targets_request_owner_fkey',
      'account_deletion_storage_targets_scrubbed_check',
      'account_deletion_storage_targets_source_kind_check',
      'account_deletion_storage_targets_source_refs_check',
      'account_deletion_storage_targets_status_check',
      'account_deletion_storage_targets_verification_status_check',
      'account_deletion_storage_targets_verified_absent_check'
    ]
   from pg_constraint where conrelid='public.account_deletion_storage_targets'::regclass),
  'Storage target constraint inventory mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 5 from pg_indexes
    where schemaname = 'public' and tablename = 'account_deletion_storage_targets'),
  'Storage target index inventory mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 2 from pg_trigger
    where tgrelid = 'public.account_deletion_storage_targets'::regclass and not tgisinternal),
  'Storage target trigger attachment mismatch'
);
select pg_temp.assert_true(
  (select count(*) = 5 from pg_trigger
    where tgname in (
      'enforce_account_deletion_take_storage_writer_fence',
      'enforce_account_deletion_voice_consent_storage_writer_fence',
      'enforce_account_deletion_voice_storage_writer_fence',
      'enforce_account_deletion_script_audio_storage_writer_fence',
      'enforce_account_deletion_script_storage_source_fence'
    ) and not tgisinternal),
  'writer/source trigger attachment mismatch'
);

with expected(signature) as (values
  ('public.begin_account_deletion_storage_snapshot(uuid,uuid,uuid)'),
  ('public.seal_account_deletion_storage_snapshot(uuid,uuid,uuid,jsonb)'),
  ('public.claim_account_deletion_storage_lease(uuid,uuid,uuid,integer)'),
  ('public.release_account_deletion_storage_lease(uuid,uuid,uuid)'),
  ('public.begin_account_deletion_storage_delete_attempt(uuid,uuid,uuid,uuid,integer,integer)'),
  ('public.record_account_deletion_storage_delete_result(uuid,uuid,uuid,uuid,integer,integer,text,integer)'),
  ('public.begin_account_deletion_storage_verification_attempt(uuid,uuid,uuid,uuid,integer,integer)'),
  ('public.record_account_deletion_storage_verification_result(uuid,uuid,uuid,uuid,integer,integer,text,integer)'),
  ('public.finalize_account_deletion_storage_stage(uuid,uuid,uuid,integer)'),
  ('public.finalize_recording_upload_write_intent(uuid,uuid,uuid,text)')
), actual as (
  select signature, to_regprocedure(signature) oid from expected
)
select pg_temp.assert_true(
  (select count(*) = 10 and bool_and(
      oid is not null
      and (select proowner = 'postgres'::regrole and prosecdef
             and proconfig @> array['search_path=pg_catalog, public']
           from pg_proc where pg_proc.oid = actual.oid)
      and not has_function_privilege('public', oid, 'execute')
      and not has_function_privilege('anon', oid, 'execute')
      and not has_function_privilege('authenticated', oid, 'execute')
      and has_function_privilege('service_role', oid, 'execute')
    ) from actual),
  'Storage RPC owner/security/search_path/ACL mismatch'
);

select pg_temp.assert_true(
  (select count(*) = 4 from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname in ('recordings_select_own','script-audios_select_own','voice-samples_select_own','voice-consents_select_own'))
  and (select count(*) = 0 from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polcmd in ('a','w','d')
      and polname ~ '^(recordings|script-audios|voice-samples|voice-consents)_'),
  'effective four-bucket Storage policy mismatch'
);

-- Actual role behavior: authenticated reads survive, mutation is denied/zero;
-- the server/service role retains exact-object mutation authority.
insert into storage.objects (id, bucket_id, name, owner_id)
select gen_random_uuid(), bucket, '10000000-0000-4000-8000-000000000001/policy-probe.bin',
       '10000000-0000-4000-8000-000000000001'
from unnest(array['recordings','script-audios','voice-samples','voice-consents']) bucket;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) = 4 from storage.objects
    where name = '10000000-0000-4000-8000-000000000001/policy-probe.bin'),
  'authenticated owner-prefix read was not preserved'
);
select pg_temp.expect_sqlstate(
  $$insert into storage.objects(bucket_id,name,owner_id) values
    ('script-audios','10000000-0000-4000-8000-000000000001/direct-insert.bin','10000000-0000-4000-8000-000000000001')$$,
  array['42501'], 'authenticated script-audios INSERT'
);
select pg_temp.expect_sqlstate(
  $$insert into storage.objects(bucket_id,name,owner_id) values
    ('recordings','10000000-0000-4000-8000-000000000001/direct-insert.bin','10000000-0000-4000-8000-000000000001')$$,
  array['42501'], 'authenticated recordings INSERT'
);
select pg_temp.expect_sqlstate(
  $$insert into storage.objects(bucket_id,name,owner_id) values
    ('voice-samples','10000000-0000-4000-8000-000000000001/direct-insert.bin','10000000-0000-4000-8000-000000000001')$$,
  array['42501'], 'authenticated voice-samples INSERT'
);
select pg_temp.expect_sqlstate(
  $$insert into storage.objects(bucket_id,name,owner_id) values
    ('voice-consents','10000000-0000-4000-8000-000000000001/direct-insert.bin','10000000-0000-4000-8000-000000000001')$$,
  array['42501'], 'authenticated voice-consents INSERT'
);
select pg_temp.assert_row_count(
  $$update storage.objects set metadata = '{}'::jsonb
    where bucket_id in ('recordings','script-audios','voice-samples','voice-consents')
      and name = '10000000-0000-4000-8000-000000000001/policy-probe.bin'$$,
  0, 'authenticated four-bucket UPDATE'
);
select pg_temp.expect_sqlstate(
  $$delete from storage.objects
    where bucket_id = 'script-audios' and name = '10000000-0000-4000-8000-000000000001/policy-probe.bin'$$,
  array['42501'], 'authenticated script-audios DELETE'
);
commit;

begin;
set local role service_role;
set local storage.allow_delete_query = 'true';
insert into storage.objects (bucket_id, name, owner_id)
values ('script-audios','10000000-0000-4000-8000-000000000001/server-authorized.bin',
        '10000000-0000-4000-8000-000000000001');
update storage.objects set metadata = '{}'::jsonb
where bucket_id = 'script-audios'
  and name = '10000000-0000-4000-8000-000000000001/server-authorized.bin';
delete from storage.objects where bucket_id = 'script-audios'
  and name = '10000000-0000-4000-8000-000000000001/server-authorized.bin';
commit;

-- Users: writer, transition, unrelated B, zero, manual, drift, atomic/Auth-null, retry.
insert into auth.users (id, email, created_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001','g5d2e-writer@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000002','g5d2e-transition@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000003','g5d2e-user-b@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000004','g5d2e-zero@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000005','g5d2e-manual@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000006','g5d2e-drift@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000007','g5d2e-atomic@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000008','g5d2e-retry@example.invalid',now(),now());

-- Four real writer-intent kinds complete before any deletion, including the
-- legitimate Listen path's atomic script_audios row completion.
insert into public.scripts (id,user_id,title,content)
values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','proof','proof');
insert into public.voice_consents (id,user_id,provider,metadata)
values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mock','{}');
insert into public.voices (id,user_id,provider,provider_voice_id,label,consent_id)
values ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
        'mock','proof-voice','proof','50000000-0000-4000-8000-000000000001');

do $$
declare v_intent public.voice_asset_write_intents;
  v_user constant uuid := '10000000-0000-4000-8000-000000000001';
  v_script constant uuid := '40000000-0000-4000-8000-000000000001';
  v_voice constant uuid := '60000000-0000-4000-8000-000000000001';
  v_consent constant uuid := '50000000-0000-4000-8000-000000000001';
begin
  v_intent := public.reserve_voice_asset_write_intent(v_user,'voice_consent_upload',gen_random_uuid(),900,
    null,null,null,'voice-consents',v_user || '/consent.wav');
  perform public.finalize_voice_upload_write_intent(v_intent.id,v_user,v_intent.lease_token,
    'voice-consents',v_user || '/consent.wav');
  v_intent := public.reserve_voice_asset_write_intent(v_user,'voice_sample_upload',gen_random_uuid(),900,
    null,null,null,'voice-samples',v_user || '/' || v_consent || '/sample.wav');
  perform public.finalize_voice_upload_write_intent(v_intent.id,v_user,v_intent.lease_token,
    'voice-samples',v_user || '/' || v_consent || '/sample.wav');
  v_intent := public.reserve_voice_asset_write_intent(v_user,'recording_upload',gen_random_uuid(),900,
    v_script,null,null,'recordings',v_user || '/' || v_script || '/recording.wav');
  perform public.finalize_recording_upload_write_intent(v_intent.id,v_user,v_intent.lease_token,
    v_user || '/' || v_script || '/recording.wav');
  v_intent := public.reserve_voice_asset_write_intent(v_user,'script_audio_create',gen_random_uuid(),900,
    v_script,v_voice,'cache-proof','script-audios',v_user || '/' || v_script || '/' || v_voice || '/cache.bin');
  perform public.finalize_script_audio_write_intent(v_intent.id,v_user,v_intent.lease_token,'mock',
    '/api/script-audio/proof',jsonb_build_object(
      'storageBucket','script-audios','storageObjectKey',v_user || '/' || v_script || '/' || v_voice || '/cache.bin',
      'contentType','audio/mpeg','byteLength',4),null);
end;
$$;
select pg_temp.assert_true(
  (select count(*) = 4 from public.voice_asset_write_intents
    where user_id = '10000000-0000-4000-8000-000000000001' and status = 'completed')
  and (select count(*) = 1 from public.script_audios
    where script_id = '40000000-0000-4000-8000-000000000001'),
  'four writer kinds or Listen completion did not persist'
);

select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001');
select pg_temp.expect_sqlstate(
  $$select public.reserve_voice_asset_write_intent(
    '10000000-0000-4000-8000-000000000001','script_audio_create',gen_random_uuid(),900,
    '40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
    'blocked-collecting','script-audios',
    '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/blocked.bin')$$,
  array['55006'], 'collecting script-audio writer fence'
);
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'recordings',jsonb_build_array('10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/recording.wav'),
    'script-audios',jsonb_build_array('10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/cache.bin'),
    'voice-samples',jsonb_build_array('10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001/sample.wav'),
    'voice-consents',jsonb_build_array('10000000-0000-4000-8000-000000000001/consent.wav'))
);
select pg_temp.assert_true(
  (select storage_snapshot_target_count = 4 from public.account_deletion_requests
    where id = '20000000-0000-4000-8000-000000000001')
  and (select count(distinct target_kind) = 4 from public.account_deletion_storage_targets
    where deletion_request_id = '20000000-0000-4000-8000-000000000001'),
  'completed four-writer universe was not sealed exactly'
);
select pg_temp.expect_sqlstate(
  $$select public.reserve_voice_asset_write_intent(
    '10000000-0000-4000-8000-000000000001','recording_upload',gen_random_uuid(),900,
    '40000000-0000-4000-8000-000000000001',null,null,'recordings',
    '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/blocked.wav')$$,
  array['55006'], 'sealed recording writer fence'
);

-- Transition fixture plus unrelated User B.
select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
insert into public.account_deletion_requests(id,user_id,status)
values ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','requested');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002');
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  jsonb_build_object('recordings',jsonb_build_array('10000000-0000-4000-8000-000000000002/orphan.wav'),
    'script-audios','[]'::jsonb,'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb));

select pg_temp.expect_sqlstate(
  $$update public.account_deletion_requests set storage_cleanup_status='succeeded'
    where id='20000000-0000-4000-8000-000000000002'$$,
  array['42501'], 'illegal parent terminal write'
);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_storage_targets set target_kind='script_audio'
    where deletion_request_id='20000000-0000-4000-8000-000000000002'$$,
  array['23514'], 'target identity mutation'
);
select pg_temp.expect_sqlstate(
  $$select public.begin_account_deletion_storage_snapshot(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',gen_random_uuid())$$,
  array['23514'], 'sealed universe reseal'
);
select pg_temp.expect_sqlstate(
  $$insert into public.account_deletion_storage_targets(
      deletion_request_id,user_id,target_kind,storage_bucket,storage_object_key,target_fingerprint,source_refs,prefix_listed)
    values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
      'recording','recordings','10000000-0000-4000-8000-000000000003/cross.wav','cross','[]',true)$$,
  array['23503'], 'cross-user parent/child pair'
);

-- Actual independent PostgreSQL sessions: winner holds the row lock past lease
-- expiry; the concurrent loser receives no dispatch authority after the commit.
create extension if not exists dblink with schema extensions;
create or replace function public.g5d2e_isolated_proof_hold_lease()
returns uuid language plpgsql as $$
declare v_request public.account_deletion_requests;
begin
  v_request := public.claim_account_deletion_storage_lease(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000011',1);
  perform pg_sleep(2);
  return v_request.id;
end;
$$;
select extensions.dblink_connect('g5d2e_a','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('g5d2e_b','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_send_query('g5d2e_a','select public.g5d2e_isolated_proof_hold_lease()');
select pg_sleep(0.2);
select extensions.dblink_send_query('g5d2e_b',$q$
  select (public.claim_account_deletion_storage_lease(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000012',60)).id$q$);
create temporary table g5d2e_concurrency_result(label text, request_id uuid);
insert into g5d2e_concurrency_result
select 'winner', request_id from extensions.dblink_get_result('g5d2e_a') as t(request_id uuid);
insert into g5d2e_concurrency_result
select 'loser', request_id from extensions.dblink_get_result('g5d2e_b') as t(request_id uuid);
select pg_temp.assert_true(
  (select request_id = '20000000-0000-4000-8000-000000000002' from g5d2e_concurrency_result where label='winner')
  and (select request_id is null from g5d2e_concurrency_result where label='loser'),
  'independent-session lease winner/loser authority mismatch'
);
select extensions.dblink_disconnect('g5d2e_a');
select extensions.dblink_disconnect('g5d2e_b');
drop function public.g5d2e_isolated_proof_hold_lease();

-- Expiry takeover, stale authority rejection, generation 0 -> 1 only, and
-- verification-first recovery after an intentionally lost DELETE result.
select pg_temp.assert_true(
  (select (public.claim_account_deletion_storage_lease(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000013',60)).storage_runner_attempt_count = 2),
  'expired lease takeover failed'
);
select pg_temp.assert_true(
  (select (public.begin_account_deletion_storage_verification_attempt(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    id,'30000000-0000-4000-8000-000000000013',2,0)).id is null
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'verification was allowed before DELETE generation'
);
select pg_temp.assert_true(
  (select (public.begin_account_deletion_storage_delete_attempt(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    id,'30000000-0000-4000-8000-000000000011',1,0)).id is null
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'stale lease A retained dispatch authority'
);
select pg_temp.assert_true(
  (select (public.begin_account_deletion_storage_delete_attempt(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    id,'30000000-0000-4000-8000-000000000013',2,0)).delete_attempt_count = 1
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'lease winner did not receive generation-1 authority'
);
select pg_temp.assert_true(
  (select (public.begin_account_deletion_storage_delete_attempt(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    id,'30000000-0000-4000-8000-000000000013',2,0)).id is null
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'second automatic DELETE generation was allowed'
);
select public.release_account_deletion_storage_lease(
  '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000013');
select pg_temp.assert_true(
  (select (public.claim_account_deletion_storage_lease(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000014',60)).storage_runner_attempt_count = 3),
  'recovery lease claim failed'
);
select pg_temp.assert_true(
  (select (public.begin_account_deletion_storage_verification_attempt(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    id,'30000000-0000-4000-8000-000000000014',3,0)).verification_attempt_count = 1
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'ambiguous DELETE did not recover verification-first'
);
select pg_temp.assert_true(
  (select (public.record_account_deletion_storage_verification_result(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    id,'30000000-0000-4000-8000-000000000014',3,1,'absent',0)).status='verified_absent'
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'verified absence recording failed'
);
select pg_temp.assert_true(
  (public.finalize_account_deletion_storage_stage(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000014',3)).storage_cleanup_status='succeeded',
  'all-absent Storage sub-finalizer failed'
);
select pg_temp.assert_true(
  (select status='confirmed' and storage_cleanup_status='succeeded'
      and storage_sub_finalized_at=storage_locator_scrubbed_at
      and storage_snapshot_fingerprint is null
      and storage_runner_lease_token is null and storage_runner_lease_expires_at is null
      and db_cleanup_status='pending' and auth_cleanup_status='pending' and completed_at is null
   from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000002')
  and (select count(*)=1 and bool_and(storage_bucket is null and storage_object_key is null
        and target_fingerprint is null and source_refs is null and locator_scrubbed_at is not null)
       from public.account_deletion_storage_targets
       where deletion_request_id='20000000-0000-4000-8000-000000000002'),
  'Storage finalizer scrub/account-terminal boundary mismatch'
);

-- Zero target -> not_needed.
select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000004');
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000004',
  jsonb_build_object('recordings','[]'::jsonb,'script-audios','[]'::jsonb,'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb));
select public.claim_account_deletion_storage_lease(
  '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000024',60);
select pg_temp.assert_true(
  (public.finalize_account_deletion_storage_stage(
    '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000024',1)).storage_cleanup_status='not_needed',
  'zero target did not finalize not_needed'
);

-- Incomplete and present/manual cases preserve recovery locators and reject finalization.
select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000005');
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000005',
  jsonb_build_object('recordings',jsonb_build_array('10000000-0000-4000-8000-000000000005/manual.wav'),
    'script-audios','[]'::jsonb,'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb));
select public.claim_account_deletion_storage_lease(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000025',60);
select pg_temp.assert_true(
  (public.finalize_account_deletion_storage_stage(
    '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000025',1)).id is null
  and (select storage_object_key is not null from public.account_deletion_storage_targets
       where deletion_request_id='20000000-0000-4000-8000-000000000005'),
  'incomplete target finalization did not fail closed'
);
select public.begin_account_deletion_storage_delete_attempt(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000005'),
  '30000000-0000-4000-8000-000000000025',1,0);
select public.begin_account_deletion_storage_verification_attempt(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000005'),
  '30000000-0000-4000-8000-000000000025',1,0);
select public.record_account_deletion_storage_verification_result(
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000005'),
  '30000000-0000-4000-8000-000000000025',1,1,'present',0);
select pg_temp.expect_sqlstate(
  $$update public.account_deletion_storage_targets set status='pending'
    where deletion_request_id='20000000-0000-4000-8000-000000000005'$$,
  array['23514'], 'sticky manual target'
);

-- Count drift rejects finalization.
select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000006');
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000006',
  jsonb_build_object('recordings','[]'::jsonb,'script-audios','[]'::jsonb,'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb));
insert into public.account_deletion_storage_targets(
  deletion_request_id,user_id,target_kind,storage_bucket,storage_object_key,target_fingerprint,source_refs,prefix_listed,
  status,verification_status,verified_absent_at)
values ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  'recording','recordings','10000000-0000-4000-8000-000000000006/drift.wav','drift','[]',true,
  'verified_absent','verified_absent',now());
select public.claim_account_deletion_storage_lease(
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000026',60);
select pg_temp.assert_true(
  (public.finalize_account_deletion_storage_stage(
    '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
    '30000000-0000-4000-8000-000000000026',1)).id is null
  and (select storage_cleanup_status='pending' and storage_sub_finalized_at is null
       from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000006'),
  'count drift did not reject without terminal mutation'
);

-- Atomic rollback on a forced mid-finalizer failure, safe retry, dual-FK owner
-- null lifecycle, and parent purge cascade.
select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000007');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000007');
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000007',
  jsonb_build_object('recordings',jsonb_build_array('10000000-0000-4000-8000-000000000007/atomic.wav'),
    'script-audios','[]'::jsonb,'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb));
select public.claim_account_deletion_storage_lease(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000027',60);
select public.begin_account_deletion_storage_delete_attempt(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000007'),
  '30000000-0000-4000-8000-000000000027',1,0);
select public.begin_account_deletion_storage_verification_attempt(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000007'),
  '30000000-0000-4000-8000-000000000027',1,0);
select public.record_account_deletion_storage_verification_result(
  '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000007'),
  '30000000-0000-4000-8000-000000000027',1,1,'absent',0);
create or replace function public.g5d2e_isolated_proof_fail_scrub()
returns trigger language plpgsql as $$ begin
  if old.locator_scrubbed_at is null and new.locator_scrubbed_at is not null
    and new.deletion_request_id='20000000-0000-4000-8000-000000000007' then
    raise exception using errcode='P0001',message='forced isolated finalizer failure';
  end if;
  return new;
end $$;
create trigger g5d2e_isolated_proof_fail_scrub
after update on public.account_deletion_storage_targets
for each row execute function public.g5d2e_isolated_proof_fail_scrub();
select pg_temp.expect_sqlstate(
  $$select public.finalize_account_deletion_storage_stage(
    '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000027',1)$$,
  array['P0001'], 'forced atomic finalizer failure'
);
select pg_temp.assert_true(
  (select storage_cleanup_status='pending' and storage_sub_finalized_at is null
      and storage_snapshot_fingerprint is not null
   from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000007')
  and (select storage_object_key is not null and locator_scrubbed_at is null
       from public.account_deletion_storage_targets
       where deletion_request_id='20000000-0000-4000-8000-000000000007'),
  'forced finalizer failure committed partial scrub/terminal state'
);
drop trigger g5d2e_isolated_proof_fail_scrub on public.account_deletion_storage_targets;
drop function public.g5d2e_isolated_proof_fail_scrub();
select pg_temp.assert_true(
  (public.finalize_account_deletion_storage_stage(
    '20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000027',1)).storage_cleanup_status='succeeded',
  'safe finalizer retry failed'
);
delete from auth.users where id='10000000-0000-4000-8000-000000000007';
select pg_temp.assert_true(
  (select user_id is null from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000007')
  and (select count(*)=1 and bool_and(user_id is null) from public.account_deletion_storage_targets
       where deletion_request_id='20000000-0000-4000-8000-000000000007'),
  'Auth-null dual-FK owner transition detached or lost child'
);
delete from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000007';
select pg_temp.assert_true(
  (select count(*)=0 from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000007'),
  'parent purge did not cascade child'
);

-- Retry budget reaches sticky manual through actual RPC transitions.
select pg_temp.create_provider_ready_request(
  '10000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000008');
select public.begin_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000008');
select public.seal_account_deletion_storage_snapshot(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000008',
  jsonb_build_object('recordings',jsonb_build_array('10000000-0000-4000-8000-000000000008/retry.wav'),
    'script-audios','[]'::jsonb,'voice-samples','[]'::jsonb,'voice-consents','[]'::jsonb));
select public.claim_account_deletion_storage_lease(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000028',60);
select public.begin_account_deletion_storage_delete_attempt(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000008'),
  '30000000-0000-4000-8000-000000000028',1,0);
create or replace function pg_temp.record_retry(p_expected_count integer)
returns void language plpgsql as $$
declare v_target uuid := (select id from public.account_deletion_storage_targets
  where deletion_request_id='20000000-0000-4000-8000-000000000008');
begin
  perform public.begin_account_deletion_storage_verification_attempt(
    '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
    v_target,'30000000-0000-4000-8000-000000000028',1,p_expected_count);
  perform public.record_account_deletion_storage_verification_result(
    '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
    v_target,'30000000-0000-4000-8000-000000000028',1,p_expected_count+1,'unavailable',1);
end;
$$;
select pg_temp.record_retry(0); select pg_sleep(1.05);
select pg_temp.record_retry(1); select pg_sleep(1.05);
select pg_temp.record_retry(2); select pg_sleep(1.05);
select pg_temp.record_retry(3); select pg_sleep(1.05);
select pg_temp.record_retry(4); select pg_sleep(1.05);
select public.begin_account_deletion_storage_verification_attempt(
  '20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',
  (select id from public.account_deletion_storage_targets where deletion_request_id='20000000-0000-4000-8000-000000000008'),
  '30000000-0000-4000-8000-000000000028',1,5);
select pg_temp.assert_true(
  (select status='manual_required' and verification_status='manual_required'
      and last_failure_category='retry_budget_exhausted'
   from public.account_deletion_storage_targets
   where deletion_request_id='20000000-0000-4000-8000-000000000008')
  and (select storage_cleanup_status='manual_required'
       from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000008'),
  'verification retry budget did not become sticky manual'
);

select pg_temp.assert_true(
  (select status='requested' and user_id='10000000-0000-4000-8000-000000000003'
   from public.account_deletion_requests where id='20000000-0000-4000-8000-000000000003')
  and (select count(*)=0 from public.account_deletion_storage_targets
       where user_id='10000000-0000-4000-8000-000000000003'),
  'unrelated User B changed'
);

-- Authenticated callers cannot invoke mutation RPCs.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select pg_temp.expect_sqlstate(
  $$select public.begin_account_deletion_storage_snapshot(
    '20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',gen_random_uuid())$$,
  array['42501'], 'authenticated Storage RPC execute'
);
commit;

-- Fixture cleanup; local Storage catalog probes and all tagged rows return to zero.
begin;
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like '10000000-0000-4000-8000-000000000001/%';
commit;
delete from public.account_deletion_requests where id between
  '20000000-0000-4000-8000-000000000001' and '20000000-0000-4000-8000-000000000008';
delete from public.scripts where user_id between
  '10000000-0000-4000-8000-000000000001' and '10000000-0000-4000-8000-000000000008';
delete from auth.users where id between
  '10000000-0000-4000-8000-000000000001' and '10000000-0000-4000-8000-000000000008';
select pg_temp.assert_true(
  (select count(*)=0 from public.account_deletion_requests
    where id between '20000000-0000-4000-8000-000000000001' and '20000000-0000-4000-8000-000000000008')
  and (select count(*)=0 from public.account_deletion_storage_targets
    where deletion_request_id between '20000000-0000-4000-8000-000000000001' and '20000000-0000-4000-8000-000000000008')
  and (select count(*)=0 from auth.users
    where id between '10000000-0000-4000-8000-000000000001' and '10000000-0000-4000-8000-000000000008')
  and (select count(*)=0 from storage.objects
    where name like '10000000-0000-4000-8000-000000000001/%'),
  'isolated proof fixture cleanup failed'
);

\o
select 'G5D_2E_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS' as result,
  0 as real_storage_calls, 0 as provider_calls, 0 as staging_mutations,
  0 as db_stage_calls, 0 as auth_stage_calls, 0 as completion_calls;
