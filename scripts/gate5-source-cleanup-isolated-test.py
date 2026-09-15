#!/usr/bin/env python3
"""Disposable offline PostgreSQL proof. Never reads env files or remote DB URLs."""
from pathlib import Path
import json
import os
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAME = 'native-minute-r1-proof-' + uuid.uuid4().hex[:10]
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
    assert [p.name[:4] for p in migrations] == [f'{i:04}' for i in range(1, 31)]
    for migration in migrations:
        sql(migration.read_text() + f"\ninsert into supabase_migrations.schema_migrations values ('{migration.name[:4]}');")
    print('R1_FRESH_0001_0030_NETWORK_NONE_PASS', flush=True)
    suite = ROOT / 'scripts/gate5-source-cleanup-isolated-test.sql'
    foundation = (ROOT / 'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
    helpers = foundation[foundation.index('create or replace function pg_temp.assert_true'):foundation.index('-- Clean migration history')]
    # Helper-only reuse, not a G5D4 replay or a broad R2/R3 re-audit.
    sql(helpers + suite.read_text() + (ROOT / 'scripts/gate5-source-cleanup-account-test.sql').read_text())


    import runpy
    concurrency = runpy.run_path(str(ROOT / 'scripts/gate5-source-cleanup-concurrency-test.py'))
    concurrency['run_concurrency'](NAME, sql)
    connected = command(['node', '--conditions=react-server', '--import', 'tsx', str(ROOT / 'scripts/voice-source-cleanup-connected-isolated-test.mjs'), NAME], cwd=ROOT)
    print(connected.stdout.strip(), flush=True)
    consent = subprocess.run([str(ROOT / 'node_modules/.bin/vitest'), 'run', '--config',
                       str(ROOT / 'apps/mobile/vitest.config.ts'), '--root', str(ROOT / 'apps/mobile'),
                       'tests/voice-consent-read-isolated.test.ts'], cwd=ROOT,
                      env={**os.environ, 'R1_READ_TEST_CONTAINER': NAME}, text=True, capture_output=True)
    print(consent.stdout.strip(), flush=True)
    if consent.returncode:
        print(consent.stderr.strip(), flush=True)
        consent.check_returncode()

finally:
    subprocess.run(['docker', 'rm', '-f', '-v', NAME], check=True, capture_output=True)
    print('R1_ISOLATED_CONTAINER_REMOVED', flush=True)
