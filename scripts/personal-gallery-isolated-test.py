#!/usr/bin/env python3
"""Personal Gallery contract on a disposable, network-isolated PostgreSQL 17 container."""
from pathlib import Path
import ast, subprocess, time, uuid, re
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
NAME = 'nm-personal-gallery-' + uuid.uuid4().hex[:9]
source = ast.parse((ROOT / 'scripts/script-revision-isolated-test.py').read_text())
BOOTSTRAP = next(ast.literal_eval(node.value) for node in source.body
                 if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'BOOTSTRAP' for t in node.targets))

def sql(text):
    result = subprocess.run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
                             '-v', 'ON_ERROR_STOP=1'], input=text, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-8000:])
    return result.stdout

try:
    subprocess.run(['docker', 'run', '-d', '--name', NAME, '--network', 'none', '--pull=never',
                    '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine'], check=True, capture_output=True)
    for _ in range(100):
        if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(.1)
    sql(BOOTSTRAP)
    for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        sql(migration.read_text())
    print('0038_MIGRATION_PASS', flush=True)
    sql((ROOT / 'scripts/personal-gallery-isolated-test.sql').read_text())
    print('OWNER_RLS_CASCADE_FENCE_IDEMPOTENCY_SCRIPT_PASS', flush=True)
    owner = '10000000-0000-4000-8000-000000000074'
    result = sql(f"insert into auth.users(id,email) values('{owner}','gallery-race@example.invalid'); "
                 f"set role authenticated; select set_config('request.jwt.claim.sub','{owner}',false); "
                 "select id from public.create_personal_gallery_item('{\"scene_title\":\"Race\",\"excerpt_text\":\"Race words.\"}'::jsonb);")
    item_id = re.findall(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', result)[-1]
    def create(_):
        output = sql(f"set role authenticated; select set_config('request.jwt.claim.sub','{owner}',false); "
                     f"select id from public.create_script_from_personal_gallery('{item_id}',1,'Race',null);")
        return re.findall(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', output)[-1]
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(create, range(2)))
    assert ids[0] == ids[1]
    assert '1' in sql(f"select count(*) from public.scripts where source_gallery_item_id='{item_id}';")
    print('CONCURRENT_DOUBLE_SUBMIT_ONE_SCRIPT_PASS', flush=True)
finally:
    subprocess.run(['docker', 'rm', '-f', '-v', NAME], check=True, capture_output=True)
    print('LOCAL_CONTAINER_REMOVED', flush=True)
