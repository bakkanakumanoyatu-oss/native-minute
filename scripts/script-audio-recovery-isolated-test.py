#!/usr/bin/env python3
"""Focused recovery proof in local network-none PostgreSQL. No remote credentials."""
import ast
import json
from pathlib import Path
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
NAME = 'native-minute-recovery-' + uuid.uuid4().hex[:10]


def sql(source):
    result = subprocess.run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    return result.stdout.strip()


try:
    subprocess.run(['docker', 'run', '-d', '--name', NAME, '--network', 'none', '--pull=never', '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine'], check=True, capture_output=True)
    for _ in range(100):
        if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(.1)
    state = json.loads(subprocess.check_output(['docker', 'inspect', NAME]))[0]
    assert state['HostConfig']['NetworkMode'] == 'none' and not state['HostConfig']['PortBindings']
    tree = ast.parse((ROOT / 'scripts/gate5-source-cleanup-isolated-test.py').read_text())
    bootstrap = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'BOOTSTRAP' for t in node.targets))
    sql(bootstrap)
    migrations = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    assert [p.name[:4] for p in migrations] == [f'{i:04}' for i in range(1, 33)]
    for migration in migrations:
        sql(migration.read_text())
    print('RECOVERY_FRESH_0001_0032_NETWORK_NONE_PASS', flush=True)
    foundation = (ROOT / 'scripts/g5d-2j-isolated-postgres-runtime-proof.sql').read_text()
    helpers = foundation[foundation.index('create or replace function pg_temp.assert_true'):foundation.index('-- Clean migration history')]
    result = sql(helpers + (ROOT / 'scripts/script-audio-recovery-isolated-test.sql').read_text())
    for line in result.splitlines():
        if '_PASS' in line:
            print(line, flush=True)

    # Two real sessions: wait until the first owns the advisory lock, then dispatch
    # the contender. No assertion depends on a guessed sleep duration.
    def race(first, second, label):
        with ThreadPoolExecutor(2) as pool:
            leader = pool.submit(sql, "begin; set application_name='recovery_race_leader'; select public.g5c_b4_lock_voice_asset_user(recovery_test.uid(20)); " + first + "; select pg_sleep(1); commit;")
            for _ in range(200):
                if sql("select count(*) from pg_stat_activity a join pg_locks l on l.pid=a.pid where a.application_name='recovery_race_leader' and l.locktype='advisory' and l.granted;") != '0':
                    break
                time.sleep(.01)
            else:
                raise AssertionError('leader did not acquire lock')
            follower = pool.submit(sql, second)
            leader.result()
            result = follower.result()
            assert 'REJECTED' in result, result
        print(label + '_PASS', flush=True)

    sql('select recovery_test.seed(20);')
    race('select recovery_test.recover(20)', "select recovery_test.try_recover(20);", 'RECOVERY_CAS_TWO_SESSION')
    # Retired identity cannot be finalized even with the original lease token.
    assert 'REJECTED' in sql('select recovery_test.try_finalize(20);')
    sql('select recovery_test.seed(21);')
    # Finalize wins while lease valid. Recovery starts before commit and sees completed.
    with ThreadPoolExecutor(2) as pool:
        first = pool.submit(sql, "begin; set application_name='finalize_race_leader'; select recovery_test.finalize(21); select pg_sleep(1); commit;")
        for _ in range(200):
            if sql("select count(*) from pg_stat_activity a join pg_locks l on l.pid=a.pid where a.application_name='finalize_race_leader' and l.locktype='advisory' and l.granted;") != '0':
                break
            time.sleep(.01)
        else:
            raise AssertionError('finalize did not acquire lock')
        second = pool.submit(sql, 'select recovery_test.try_recover(21);')
        first.result()
        assert 'REJECTED' in second.result()
    print('RECOVERY_FINALIZE_WINS_TWO_SESSION_PASS', flush=True)
    # Recovery wins on an expired reservation; queued old finalize fails closed.
    sql('select recovery_test.seed(22);')
    with ThreadPoolExecutor(2) as pool:
        first = pool.submit(sql, "begin; set application_name='recover_first'; select recovery_test.recover(22); select pg_sleep(1); commit;")
        for _ in range(200):
            if sql("select count(*) from pg_stat_activity a join pg_locks l on l.pid=a.pid where a.application_name='recover_first' and l.locktype='advisory' and l.granted;") != '0':
                break
            time.sleep(.01)
        else:
            raise AssertionError('recovery did not acquire lock')
        second = pool.submit(sql, 'select recovery_test.try_finalize(22);')
        first.result()
        assert 'REJECTED' in second.result()
    assert sql("select count(*) from public.script_audios where script_id=recovery_test.sid(22)") == '0'
    print('RECOVERY_WINS_FINALIZE_TWO_SESSION_PASS', flush=True)
finally:
    subprocess.run(['docker', 'rm', '-f', '-v', NAME], check=True, capture_output=True)
    print('RECOVERY_ISOLATED_CONTAINER_REMOVED', flush=True)
