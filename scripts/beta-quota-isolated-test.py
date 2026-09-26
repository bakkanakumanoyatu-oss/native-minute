#!/usr/bin/env python3
"""Run 0036 behavioral proof in disposable, network-isolated PostgreSQL 17."""
import ast
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAME = "nm-beta-quota-" + uuid.uuid4().hex[:10]
source = ast.parse((ROOT / "scripts/script-revision-isolated-test.py").read_text())
BOOTSTRAP = next(ast.literal_eval(node.value) for node in source.body
                 if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "BOOTSTRAP" for t in node.targets))
USER_A = "10000000-0000-4000-8000-0000000000a1"
USER_B = "10000000-0000-4000-8000-0000000000b2"
USER_C = "10000000-0000-4000-8000-0000000000c3"
USER_D = "10000000-0000-4000-8000-0000000000d4"
USER_E = "10000000-0000-4000-8000-0000000000e5"


def sql(statement, allow_failure=False):
    result = subprocess.run(
        ["docker", "exec", "-i", NAME, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, capture_output=True,
    )
    if result.returncode and not allow_failure:
        raise RuntimeError(result.stderr[-6000:])
    return result


def reserve(user, kind, op, user_limit=2, global_limit=10, period="account_lifetime"):
    value = sql(f"set role service_role; select public.reserve_beta_provider_quota('{user}','{kind}','{op}','{period}',{user_limit},{global_limit});").stdout.strip().splitlines()[-1]
    return json.loads(value)


def transition(user, reservation_id, action, allow_failure=False):
    return sql(f"set role service_role; select public.transition_beta_provider_quota('{user}','{reservation_id}','{action}');", allow_failure)


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
    sql("insert into auth.users(id,email) values " + ",".join(
        f"('{user}','{user[-4:]}@example.invalid')" for user in (USER_A, USER_B, USER_C)) + ";")

    a1 = reserve(USER_A, "reference_audio_generation", "a1")
    a2 = reserve(USER_A, "reference_audio_generation", "a2")
    assert a1["result"] == a2["result"] == "reserved"
    assert reserve(USER_A, "reference_audio_generation", "a3")["result"] == "limit_reached"
    assert reserve(USER_A, "reference_audio_generation", "a1")["result"] == "duplicate"
    b1 = reserve(USER_B, "reference_audio_generation", "b1")
    assert b1["result"] == "reserved"
    assert sql("select used_count from public.beta_quota_global_usage where kind='reference_audio_generation' and period_id='account_lifetime';").stdout.strip() == "3"
    transition(USER_A, a2["reservation_id"], "released")
    a2_retry = reserve(USER_A, "reference_audio_generation", "a2")
    assert a2_retry["result"] == "reserved" and a2_retry["reservation_id"] != a2["reservation_id"]
    assert transition(USER_A, a2["reservation_id"], "released").stdout.strip().splitlines()[-1] == "released"
    assert reserve(USER_A, "reference_audio_generation", "a2")["result"] == "duplicate"
    transition(USER_A, a2_retry["reservation_id"], "released")
    assert reserve(USER_A, "reference_audio_generation", "a4")["result"] == "reserved"
    transition(USER_A, a1["reservation_id"], "provider_started")
    transition(USER_A, a1["reservation_id"], "failed_or_unknown")
    assert transition(USER_A, a1["reservation_id"], "released", True).returncode != 0
    transition(USER_B, b1["reservation_id"], "provider_started")
    transition(USER_B, b1["reservation_id"], "consumed")
    assert transition(USER_B, b1["reservation_id"], "released", True).returncode != 0
    assert sql("select used_count from public.beta_quota_global_usage where kind='reference_audio_generation' and period_id='account_lifetime';").stdout.strip() == "3"
    assert reserve(USER_A, "pronunciation_evaluation", "eval-a1", 1, 2)["result"] == "reserved"
    assert reserve(USER_A, "pronunciation_evaluation", "eval-a2", 1, 2)["result"] == "limit_reached"
    assert reserve(USER_B, "pronunciation_evaluation", "eval-b1", 1, 2)["result"] == "reserved"
    assert reserve(USER_C, "pronunciation_evaluation", "eval-c1", 1, 2)["result"] == "limit_reached"
    print("PER_USER_GLOBAL_IDEMPOTENCY_RELEASE_SUCCESS_UNKNOWN_KIND_OWNER_PASS", flush=True)

    assert sql("select public.beta_quota_period_id('calendar_month_utc','2026-09-30 23:59:59+00');").stdout.strip() == "calendar_month_utc:2026-09"
    assert sql("select public.beta_quota_period_id('calendar_month_utc','2026-10-01 00:00:00+00');").stdout.strip() == "calendar_month_utc:2026-10"
    assert sql("select public.beta_quota_period_id('account_lifetime','2030-01-01+00');").stdout.strip() == "account_lifetime"
    old = reserve(USER_C, "reference_audio_generation", "old-period", 2, 10, "calendar_month_utc")
    sql(f"begin; insert into public.beta_quota_global_usage(kind,period_id,used_count) values "
        f"('reference_audio_generation','calendar_month_utc:2025-01',1); "
        f"update public.beta_quota_global_usage set used_count=used_count-1 where kind='reference_audio_generation' and period_id='{old['period_id']}'; "
        f"update public.beta_quota_reservations set period_id='calendar_month_utc:2025-01' where id='{old['reservation_id']}'; commit;")
    assert reserve(USER_C, "reference_audio_generation", "old-period", 2, 10, "calendar_month_utc")["result"] == "duplicate"
    lifetime = reserve(USER_C, "reference_audio_generation", "lifetime-only", 1, 10, "account_lifetime")
    assert lifetime["result"] == "reserved"
    assert reserve(USER_C, "reference_audio_generation", "lifetime-full", 1, 10, "account_lifetime")["result"] == "limit_reached"
    assert reserve(USER_C, "reference_audio_generation", "separate-month-bucket", 1, 10, "calendar_month_utc")["result"] == "reserved"
    print("UTC_MONTH_LIFETIME_CROSS_PERIOD_RETRY_PASS", flush=True)

    assert sql("select has_function_privilege('authenticated','public.reserve_beta_provider_quota(uuid,text,text,text,integer,integer)','execute');").stdout.strip() == "f"
    assert sql("select has_function_privilege('authenticated','public.begin_voice_registration_with_beta_quota(uuid,uuid,uuid,uuid)','execute');").stdout.strip() == "f"
    assert sql("select has_table_privilege('authenticated','public.beta_quota_reservations','insert');").stdout.strip() == "f"
    assert sql("select has_table_privilege('service_role','public.beta_quota_reservations','insert');").stdout.strip() == "f"
    assert sql("select has_table_privilege('service_role','public.beta_quota_global_usage','update');").stdout.strip() == "f"
    assert sql(f"set role authenticated; select public.reserve_beta_provider_quota('{USER_A}','voice_creation','forged','account_lifetime',999,999);", True).returncode != 0
    assert sql("select to_regclass('public.quota_events') is not null;").stdout.strip() == "t"
    print("AUTHENTICATED_DIRECT_BYPASS_DENIED_AUDIT_TABLE_COMPATIBLE_PASS", flush=True)

    stale = reserve(USER_C, "voice_creation", "stale-before-provider", 20, 5)
    sql(f"update public.beta_quota_reservations set reserved_expires_at=clock_timestamp()-interval '1 second' where id='{stale['reservation_id']}';")
    assert transition(USER_C, stale["reservation_id"], "provider_started", True).returncode != 0
    recovered = reserve(USER_C, "voice_creation", "after-stale", 20, 5)
    assert recovered["result"] == "reserved"
    assert sql(f"select status from public.beta_quota_reservations where id='{stale['reservation_id']}';").stdout.strip() == "released"
    assert reserve(USER_C, "voice_creation", "stale-before-provider", 20, 5)["result"] == "reserved"
    transition(USER_C, recovered["reservation_id"], "released")
    replacement = reserve(USER_C, "voice_creation", "stale-before-provider", 20, 5)
    assert replacement["result"] == "duplicate"
    # Keep the race's five slots free.
    active_id = sql("select id from public.beta_quota_reservations where kind='voice_creation' and operation_id='stale-before-provider' and status='reserved';").stdout.strip()
    transition(USER_C, active_id, "released")
    stale_same_id = reserve(USER_C, "voice_creation", "same-id-stale", 20, 5)
    sql(f"update public.beta_quota_reservations set reserved_expires_at=clock_timestamp()-interval '1 second' where id='{stale_same_id['reservation_id']}';")
    retried_same_id = reserve(USER_C, "voice_creation", "same-id-stale", 20, 5)
    assert retried_same_id["result"] == "reserved" and retried_same_id["reservation_id"] != stale_same_id["reservation_id"]
    transition(USER_C, retried_same_id["reservation_id"], "released")
    cross_user_stale = reserve(USER_A, "voice_creation", "cross-user-stale", 20, 1, "calendar_month_utc")
    sql(f"update public.beta_quota_reservations set reserved_expires_at=clock_timestamp()-interval '1 second' where id='{cross_user_stale['reservation_id']}';")
    cross_user_replacement = reserve(USER_B, "voice_creation", "cross-user-replacement", 20, 1, "calendar_month_utc")
    assert cross_user_replacement["result"] == "reserved"
    assert sql(f"select status from public.beta_quota_reservations where id='{cross_user_stale['reservation_id']}';").stdout.strip() == "released"
    transition(USER_B, cross_user_replacement["reservation_id"], "released")
    print("STALE_RESERVED_RECOVERY_AND_RELEASED_ID_RETRY_PASS", flush=True)

    def race(index):
        user = (USER_A, USER_B, USER_C)[index % 3]
        return reserve(user, "voice_creation", "race-" + str(index), 20, 5)["result"]
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(race, range(16)))
    assert results.count("reserved") == 5 and results.count("limit_reached") == 11, results
    assert sql("select used_count from public.beta_quota_global_usage where kind='voice_creation' and period_id='account_lifetime';").stdout.strip() == "5"
    print("CONCURRENT_GLOBAL_LIMIT_16_FOR_5_PASS", flush=True)

    sql(f"insert into auth.users(id,email) values ('{USER_E}','atomic-voice@example.invalid');")
    consent_id = "20000000-0000-4000-8000-0000000000e5"
    lease_token = "30000000-0000-4000-8000-0000000000e5"
    sql(f"insert into public.voice_consents(id,user_id,provider) values ('{consent_id}','{USER_E}','mock');")
    sql(f"insert into public.processing_consents(user_id,consent_type,consent_version,purpose_id,purpose_version,provider_set,data_categories,status) "
        f"values('{USER_E}','voice_cloning','2026-08-22.v1','voice_cloning','v1',array['elevenlabs'],"
        f"array['voice_sample','consent_recording','cloned_voice','reference_audio'],'active');")
    intent_id = sql(f"set role service_role; select id from public.reserve_voice_source_registration('{USER_E}','voice_create','{lease_token}','{consent_id}','mock');").stdout.strip().splitlines()[-1]
    voice_quota = reserve(USER_E, "voice_creation", "voice-atomic", 1, 1, "calendar_month_utc")
    assert sql(f"set role service_role; select public.begin_voice_registration_with_beta_quota('{USER_E}','{voice_quota['reservation_id']}','{intent_id}','{lease_token}');").stdout.strip().splitlines()[-1] == "t"
    assert sql(f"select registration_dispatched_at is not null from public.voice_asset_write_intents where id='{intent_id}';").stdout.strip() == "t"
    assert sql(f"select status from public.beta_quota_reservations where id='{voice_quota['reservation_id']}';").stdout.strip() == "provider_started"
    transition(USER_E, voice_quota["reservation_id"], "consumed")
    print("ATOMIC_VOICE_DISPATCH_AND_QUOTA_START_PASS", flush=True)

    helper_source = (ROOT / "scripts/g5d-2j-isolated-postgres-runtime-proof.sql").read_text()
    helpers = helper_source[helper_source.index("create or replace function pg_temp.create_provider_terminal_request"):
                            helper_source.index("-- Clean migration history")]
    # This proof intentionally exercises an existing v3 request after v4 becomes
    # the default for new requests.
    helpers = helpers.replace(
        "insert into public.account_deletion_requests(id, user_id, status, confirmed_at)\n  values (p_request_id, p_user_id, 'confirmed', transaction_timestamp());",
        "insert into public.account_deletion_requests(id, user_id, status, confirmed_at, db_inventory_version)\n  values (p_request_id, p_user_id, 'confirmed', transaction_timestamp(), 'beta-quota.account-db.v3');"
    )
    request_id = "70000000-0000-4000-8000-0000000000d4"
    sql(f"insert into auth.users(id,email) values ('{USER_D}','quota-delete@example.invalid');")
    deletion_reservation = reserve(USER_D, "reference_audio_generation", "delete-d1")
    transition(USER_D, deletion_reservation["reservation_id"], "provider_started")
    transition(USER_D, deletion_reservation["reservation_id"], "consumed")
    stale_deletion = reserve(USER_D, "reference_audio_generation", "delete-stale")
    assert sql(f"delete from public.profiles where id='{USER_D}';", True).returncode != 0
    sql(f"update public.beta_quota_reservations set reserved_expires_at=clock_timestamp()-interval '1 second' where id='{stale_deletion['reservation_id']}';")
    global_before_delete = sql("select used_count from public.beta_quota_global_usage where kind='reference_audio_generation' and period_id='account_lifetime';").stdout.strip()
    result = sql(helpers + f"select pg_temp.create_ready_request('{USER_D}','{request_id}'); "
                 f"select db_observed_row_count,db_deleted_row_count,db_retained_row_count "
                 f"from public.finalize_account_deletion_database_stage('{request_id}','{USER_D}','beta-quota.account-db.v3');")
    assert "4|3|1" in result.stdout, result.stdout[-1000:]
    assert sql(f"select count(*) from public.beta_quota_reservations where user_id='{USER_D}';").stdout.strip() == "0"
    assert int(sql("select used_count from public.beta_quota_global_usage where kind='reference_audio_generation' and period_id='account_lifetime';").stdout.strip()) == int(global_before_delete) - 1
    replay = sql(f"select already_finalized from public.finalize_account_deletion_database_stage('{request_id}','{USER_D}','beta-quota.account-db.v3');")
    assert replay.stdout.strip() == "t"
    print("ACCOUNT_DELETION_V3_EXACT_LEDGER_INVENTORY_GLOBAL_RETAINED_PASS", flush=True)

    # The global counter is anonymous and survives exact owned-row deletion.
    before = sql("select used_count from public.beta_quota_global_usage where kind='reference_audio_generation' and period_id='account_lifetime';").stdout.strip()
    for reservation_id in sql(f"select id from public.beta_quota_reservations where user_id='{USER_B}' and status='reserved';").stdout.strip().splitlines():
        transition(USER_B, reservation_id, "released")
    sql(f"delete from public.profiles where id='{USER_B}';")
    assert sql(f"select count(*) from public.beta_quota_reservations where user_id='{USER_B}';").stdout.strip() == "0"
    assert sql("select used_count from public.beta_quota_global_usage where kind='reference_audio_generation' and period_id='account_lifetime';").stdout.strip() == before
    print("OWNED_ROWS_CASCADE_GLOBAL_BUDGET_RETAINED_PASS", flush=True)
finally:
    subprocess.run(["docker", "rm", "-f", "-v", NAME], capture_output=True)
    print("LOCAL_CONTAINER_REMOVED", flush=True)
