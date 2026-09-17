#!/usr/bin/env python3
"""P2 metadata-only proof in a disposable, network-none DB. No remote credentials."""
import ast
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAME = 'native-minute-p2-' + uuid.uuid4().hex[:10]

def sql(source):
    result = subprocess.run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])
    for line in result.stdout.splitlines():
        if '_PASS' in line:
            print(line, flush=True)

try:
    subprocess.run(['docker', 'run', '-d', '--name', NAME, '--network', 'none', '--pull=never', '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine'], check=True, capture_output=True)
    for _ in range(100):
        if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(.1)
    state = json.loads(subprocess.check_output(['docker', 'inspect', NAME]))[0]
    assert state['HostConfig']['NetworkMode'] == 'none' and not state['HostConfig']['PortBindings']
    # Reuse only bootstrap/helper definitions; do not execute any Gate5 audit.
    tree = ast.parse((ROOT / 'scripts/gate5-source-cleanup-isolated-test.py').read_text())
    bootstrap = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'BOOTSTRAP' for t in node.targets))
    sql(bootstrap)
    migrations = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    assert [p.name[:4] for p in migrations] == [f'{i:04}' for i in range(1, 32)]
    for migration in migrations:
        sql(migration.read_text())
    print('P2_FRESH_0001_0031_NETWORK_NONE_PASS', flush=True)
    foundation = (ROOT / 'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
    helpers = foundation[foundation.index('create or replace function pg_temp.assert_true'):foundation.index('-- Clean migration history')]
    sql(helpers + (ROOT / 'scripts/take-metadata-isolated-test.sql').read_text())
    result = subprocess.run([str(ROOT / 'node_modules/.bin/vitest'), 'run', '--config', str(ROOT / 'apps/mobile/vitest.config.ts'), '--root', str(ROOT / 'apps/mobile'), 'tests/take-metadata-isolated.test.ts'], cwd=ROOT, env={**os.environ, 'P2_TEST_CONTAINER': NAME}, text=True, capture_output=True)
    print(result.stdout, flush=True)
    if result.returncode:
        print(result.stderr, flush=True)
        result.check_returncode()
finally:
    subprocess.run(['docker', 'rm', '-f', '-v', NAME], check=True, capture_output=True)
    print('P2_ISOLATED_CONTAINER_REMOVED', flush=True)
