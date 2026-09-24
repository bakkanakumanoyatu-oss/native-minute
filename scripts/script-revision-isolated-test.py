#!/usr/bin/env python3
"""Local PostgreSQL 17 only. No env, remote URLs, providers or Storage calls."""
from pathlib import Path
import subprocess, time, uuid, json
DB="postgres"
ROOT=Path(__file__).resolve().parents[1]
HELPERS=(ROOT/'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
HELPERS=HELPERS[HELPERS.index('create or replace function pg_temp.create_provider_terminal_request'):HELPERS.index('-- Clean migration history')]
NAME='nm-revision-'+uuid.uuid4().hex[:10]
def sql(source):
 r=subprocess.run(['docker','exec','-i',NAME,'psql','-X','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1'],input=source,text=True,capture_output=True)
 if r.returncode: raise RuntimeError(r.stderr[-7000:])
 return r.stdout
BOOTSTRAP="\ncreate role anon nologin;\ncreate role authenticated nologin;\ncreate role service_role nologin bypassrls;\ncreate schema auth;\ncreate table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz,updated_at timestamptz);\ncreate function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;\ncreate schema storage;\ncreate table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);\ncreate table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb);\nalter table storage.objects enable row level security;\ncreate function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;\ncreate schema extensions;\ncreate extension pgcrypto with schema extensions;\ncreate extension dblink with schema extensions;\nalter database postgres set search_path = public,extensions;\nset search_path = public,extensions;\ngrant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;\nalter default privileges in schema public grant all on tables to anon,authenticated,service_role;\ncreate schema supabase_migrations;\ncreate table supabase_migrations.schema_migrations(version text primary key);\n"
try:
 subprocess.run(['docker','run','-d','--name',NAME,'--network','none','--pull=never','-e','POSTGRES_PASSWORD=postgres','postgres:17-alpine'],check=True,capture_output=True)
 for _ in range(100):
  if subprocess.run(['docker','exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0: break
  time.sleep(.1)
 state=json.loads(subprocess.check_output(['docker','inspect',NAME]))[0]
 assert state['HostConfig']['NetworkMode']=='none' and not state['HostConfig']['PortBindings']
 sql(BOOTSTRAP)
 # Independent empty database applies every migration too (roles are cluster-wide).
 sql('create database nm_revision_clean;')
 DB='nm_revision_clean'
 clean_bootstrap=BOOTSTRAP.replace('alter database postgres', 'alter database nm_revision_clean')
 for role in ['anon nologin','authenticated nologin','service_role nologin bypassrls']:
  clean_bootstrap=clean_bootstrap.replace('create role '+role+';', '')
 sql(clean_bootstrap)
 for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')): sql(migration.read_text())
 print('CLEAN_DB_MIGRATIONS_PASS',flush=True)
 DB='postgres'
 for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
  if migration.name.startswith("0033"):
   sql((ROOT/"scripts/script-revision-legacy-fixture.sql").read_text())
   sql(HELPERS+"insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000040','v1@example.invalid'); select pg_temp.create_ready_request('10000000-0000-4000-8000-000000000040','70000000-0000-4000-8000-000000000040');")
   try: sql(migration.read_text())
   except RuntimeError as error: assert 'revision_cutover_requires_no_inflight_v1_deletion' in str(error)
   else: raise AssertionError('in-flight v1 cutover was not rejected')
   sql("select public.finalize_account_deletion_database_stage('70000000-0000-4000-8000-000000000040','10000000-0000-4000-8000-000000000040','g5d-2h.account-db.v1'); create schema test_revision; create table test_revision.closed_v1 as select to_jsonb(r) evidence from public.account_deletion_requests r where id='70000000-0000-4000-8000-000000000040';")
  sql(migration.read_text())
 print('LEGACY_FIXTURE_MIGRATIONS_PASS',flush=True)
 suite=ROOT/'scripts/script-revision-isolated-test.sql'
 if suite.exists():
  helpers=(ROOT/'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
  helpers=helpers[helpers.index('create or replace function pg_temp.create_provider_terminal_request'):helpers.index('-- Clean migration history')]
  result=sql(suite.read_text()+helpers+(ROOT/'scripts/script-revision-account-test.sql').read_text())
  print('DOMAIN_SECURITY_HISTORY_ACCOUNT_PASS',flush=True)
  cases=json.loads(subprocess.check_output(
   ['node','--import','tsx','scripts/script-length-rpc-cases.mjs'],cwd=ROOT,text=True))
  cases_literal=json.dumps(cases,ensure_ascii=True).replace("'","''")
  length_fixture=ROOT/'scripts/script-length-rpc-isolated-test.sql'
  sql("create temp table script_length_rpc_cases as select * from jsonb_to_recordset('"+
      cases_literal+"'::jsonb) as c(label text,content text,word_count integer,character_count integer,allowed boolean);\n"+
      length_fixture.read_text())
  print(f'JS_POSTGRES_COUNT_PARITY_AND_AUTHENTICATED_RPC_PASS {len(cases)}_CASES',flush=True)
  sql("do $$ begin if (select evidence from test_revision.closed_v1) is distinct from (select to_jsonb(r) from public.account_deletion_requests r where id='70000000-0000-4000-8000-000000000040') then raise exception 'v1 evidence rewritten'; end if; end $$; select public.finalize_account_deletion_database_stage('70000000-0000-4000-8000-000000000040','10000000-0000-4000-8000-000000000040','g5d-2h.account-db.v1');")
  print('V1_ACTIVE_CUTOVER_BLOCKED_CLOSED_EVIDENCE_PRESERVED_PASS',flush=True)
 # Independent client transactions compete for the same owner advisory lock.
 from concurrent.futures import ThreadPoolExecutor
 owner='10000000-0000-4000-8000-000000000020'
 sql(f"insert into auth.users(id,email) values ('{owner}','race@example.invalid');")
 def attempt(n):
  statement=f"select set_config('request.jwt.claim.sub','{owner}',false); select public.create_script('Race','Synthetic content','en-US',60);"
  try: sql(statement); return 'created'
  except RuntimeError as e:
   if 'script_limit_reached' in str(e): return 'limit'
   raise
 with ThreadPoolExecutor(max_workers=12) as pool: results=list(pool.map(attempt,range(16)))
 assert results.count('created')==10 and results.count('limit')==6,results
 sql(f"select pg_catalog.set_config('request.jwt.claim.sub','{owner}',false);")
 print('CONCURRENT_CREATE_16_ACTIVE_10_PASS',flush=True)

 # Create and restore compete for one final slot; only one may commit.
 mixed_owner='10000000-0000-4000-8000-000000000021'
 sql(f"insert into auth.users(id,email) values ('{mixed_owner}','mixed@example.invalid'); select set_config('request.jwt.claim.sub','{mixed_owner}',false); select public.create_script('Active','Content','en-US',60) from generate_series(1,9);")
 # -At is unnecessary; parse the final UUID row returned by psql.
 import re
 result=sql(f"select set_config('request.jwt.claim.sub','{mixed_owner}',false); select id from public.create_script('Archived','Content','en-US',60);")
 sid=re.findall(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',result)[-1]

 sql(f"select set_config('request.jwt.claim.sub','{mixed_owner}',false); select public.set_script_archived('{sid}',true,1);")
 def mixed_attempt(n):
  op=f"select public.set_script_archived('{sid}',false,2);" if n==0 else "select public.create_script('Race','Content','en-US',60);"
  try: sql(f"select set_config('request.jwt.claim.sub','{mixed_owner}',false); "+op); return 'committed'
  except RuntimeError as e:
   if 'script_limit_reached' in str(e): return 'limit'
   raise
 with ThreadPoolExecutor(max_workers=8) as pool: mixed=list(pool.map(mixed_attempt,range(8)))
 assert mixed.count('committed')==1 and mixed.count('limit')==7,mixed
 print('CONCURRENT_CREATE_RESTORE_LAST_SLOT_PASS',flush=True)
 # Two expected-version writers conflict even though both started with the same revision.
 edit_owner='10000000-0000-4000-8000-000000000022'
 result=sql(f"insert into auth.users(id,email) values ('{edit_owner}','edit-race@example.invalid'); select set_config('request.jwt.claim.sub','{edit_owner}',false); select id,current_revision_id from public.create_script('Race','Content','en-US',60);")
 identities=re.findall(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',result)
 race_script,race_revision=identities[-2:]
 def edit_attempt(n):
  op=f"select public.set_script_archived('{race_script}',true,1);" if n==0 else f"select public.edit_script('{race_script}','{race_revision}',1,'{{\"content\":\"Changed\"}}');"
  try: sql(f"select set_config('request.jwt.claim.sub','{edit_owner}',false); "+op); return 'committed'
  except RuntimeError as e:
   if 'script_edit_conflict' in str(e) or 'script_archived' in str(e): return 'conflict'
   raise
 with ThreadPoolExecutor(max_workers=2) as pool: edit_results=list(pool.map(edit_attempt,range(2)))
 assert sorted(edit_results)==['committed','conflict'],edit_results
 print('CONCURRENT_EDIT_ARCHIVE_EXPECTED_VERSION_PASS',flush=True)
finally:
 subprocess.run(['docker','rm','-f','-v',NAME],check=True,capture_output=True)
 print('LOCAL_CONTAINER_REMOVED',flush=True)
