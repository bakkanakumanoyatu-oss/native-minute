#!/usr/bin/env python3
"""Disposable offline PostgreSQL proof. Never reads env files or remote DB URLs."""
from pathlib import Path
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAME = 'native-minute-r2-proof-' + uuid.uuid4().hex[:10]
IMAGE = 'postgres:17-alpine'


def command(args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs)


def sql(source):
    result = subprocess.run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-U', 'postgres',
                             '-v', 'ON_ERROR_STOP=1'], input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    for line in result.stdout.splitlines():
        if '_PASS' in line:
            print(line, flush=True)


BOOTSTRAP = """
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz,updated_at timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create schema extensions;
create extension pgcrypto with schema extensions;
create extension dblink with schema extensions;
alter database postgres set search_path = public,extensions;
set search_path = public,extensions;
grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
"""

try:
    command(['docker', 'run', '-d', '--name', NAME, '--network', 'none', '--pull=never',
             '-e', 'POSTGRES_PASSWORD=postgres', IMAGE])
    for _ in range(100):
        if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(0.1)
    state = json.loads(command(['docker', 'inspect', NAME]).stdout)[0]
    assert state['HostConfig']['NetworkMode'] == 'none' and not state['HostConfig']['PortBindings']
    sql(BOOTSTRAP)
    migrations = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    assert [p.name[:4] for p in migrations] == [f'{i:04}' for i in range(1, 30)]
    for migration in migrations:
        if migration.name.startswith('0029_'):
            # Genuine pre-forward owner-null/unbound rows, inserted under 0028.
            sql("""
            insert into public.quota_events(id,user_id,event_type,status,subject_type,attempted_at,identifier_scrubbed_at)
              values('f1000000-0000-4000-8000-000000000001',null,'script_generation_attempt','succeeded','script_studio',now()-interval '100 days',now());
            insert into public.voice_deletion_operations(id,user_id,status,snapshot_status,consent_withdrawal_status,
              post_delete_verification_status,completed_at,sensitive_snapshot_scrubbed_at,audit_expires_at)
              values('f2000000-0000-4000-8000-000000000001',null,'completed','succeeded','not_needed','succeeded',
                now()-interval '100 days',now()-interval '100 days',now()-interval '10 days');
            create schema r2_fixture;
            create table r2_fixture.before_linkage(kind text, value jsonb);
            insert into r2_fixture.before_linkage select 'quota',to_jsonb(q) from public.quota_events q;
            insert into r2_fixture.before_linkage select 'voice',to_jsonb(o) from public.voice_deletion_operations o;
            """)
        sql(migration.read_text() + f"\ninsert into supabase_migrations.schema_migrations values ('{migration.name[:4]}');")
    print('R2_FRESH_0001_0029_NETWORK_NONE_PASS', flush=True)
    # Re-run the existing full DB finalizer proof against 0029. Only its historic
    # exact migration-prefix assertion is scoped to the original 0001-0025.
    db_proof = (ROOT / 'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
    db_proof = db_proof.replace('from supabase_migrations.schema_migrations)',
                                "from supabase_migrations.schema_migrations where version <= '0025')")
    db_proof = db_proof.replace('host=host.docker.internal port=54322', 'host=127.0.0.1 port=5432')
    sql('\\set g5d2j_isolated 1\n' + db_proof)
    # Historical Completion and direct R3 suites run unchanged against 0029.
    direct = '\\set g5d_completion_isolated 1\n'
    for filename in ['g5d-completion-isolated-postgres-runtime-proof.sql',
                     'gate5-legal-hold-isolated-test.sql', 'gate5-legal-hold-voice-only-isolated-test.sql']:
        direct += (ROOT / 'scripts' / filename).read_text() + '\n'
    sql(direct)
    # Reuse canonical Provider/Storage helper functions, not old proof assertions.
    foundation = (ROOT / 'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
    helpers = foundation[foundation.index('create or replace function pg_temp.assert_true'):foundation.index('-- Clean migration history')]
    completion = (ROOT / 'scripts/g5d-completion-isolated-postgres-runtime-proof.sql').read_text()
    helpers += completion[completion.index('create or replace function pg_temp.seed_completion_ready'):completion.index('-- Migration/catalog identity')]
    sql(helpers + (ROOT / 'scripts/gate5-retention-isolated-test.sql').read_text())
finally:
    subprocess.run(['docker', 'rm', '-f', NAME], check=True, capture_output=True)
    print('R2_ISOLATED_CONTAINER_REMOVED', flush=True)
