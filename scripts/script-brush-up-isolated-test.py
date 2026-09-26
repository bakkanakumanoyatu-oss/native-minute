#!/usr/bin/env python3
"""Run 0037 brush-up RPC proof in disposable, network-isolated PostgreSQL 17."""
import ast
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAME = "nm-brush-up-" + uuid.uuid4().hex[:10]
source = ast.parse((ROOT / "scripts/script-revision-isolated-test.py").read_text())
BOOTSTRAP = next(ast.literal_eval(node.value) for node in source.body
                 if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "BOOTSTRAP" for t in node.targets))

def sql(statement):
    result = subprocess.run(
        ["docker", "exec", "-i", NAME, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr[-8000:] + "\n" + result.stdout[-2000:])
    return result.stdout

try:
    subprocess.run(["docker", "run", "-d", "--name", NAME, "--network", "none", "--pull=never",
                    "-e", "POSTGRES_PASSWORD=postgres", "postgres:17-alpine"], check=True, capture_output=True)
    for _ in range(100):
        if subprocess.run(["docker", "exec", NAME, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], capture_output=True).returncode == 0:
            break
        time.sleep(.1)
    state = json.loads(subprocess.check_output(["docker", "inspect", NAME]))[0]
    assert state["HostConfig"]["NetworkMode"] == "none" and not state["HostConfig"]["PortBindings"]
    sql(BOOTSTRAP)
    for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        sql(migration.read_text())
    output = sql((ROOT / "scripts/script-brush-up-isolated-test.sql").read_text())
    assert "BRUSH_UP_RPC_ELIGIBILITY_STATE_CLEANUP_PASS" in output, output[-4000:]
    print("BRUSH_UP_RPC_ELIGIBILITY_STATE_CLEANUP_PASS", flush=True)
    helper_source = (ROOT / "scripts/g5d-2j-isolated-postgres-runtime-proof.sql").read_text()
    helpers = helper_source[helper_source.index("create or replace function pg_temp.create_provider_terminal_request"):
                            helper_source.index("-- Clean migration history")]
    user_id = "81000000-0000-4000-8000-000000000001"
    request_id = "85000000-0000-4000-8000-000000000001"
    result = sql(helpers + f"select pg_temp.create_ready_request('{user_id}','{request_id}'); "
                 f"select db_observed_row_count,db_deleted_row_count,db_anonymized_row_count,db_retained_row_count "
                 f"from public.finalize_account_deletion_database_stage('{request_id}','{user_id}','script-brush-up.account-db.v4');")
    observed, deleted, anonymized, retained = map(int, result.strip().splitlines()[-1].split("|"))
    assert observed == deleted + anonymized + retained and deleted >= 2, result[-2000:]
    assert sql(f"select count(*) from public.script_brush_up_candidates where user_id='{user_id}';").strip() == "0"
    assert sql(f"select count(*) from public.script_brush_up_consents where user_id='{user_id}';").strip() == "0"
    print("BRUSH_UP_ACCOUNT_DELETION_V4_ROWS_PASS", flush=True)
finally:
    subprocess.run(["docker", "rm", "-f", "-v", NAME], capture_output=True)
    print("LOCAL_CONTAINER_REMOVED", flush=True)
