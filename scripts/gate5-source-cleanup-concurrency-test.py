"""Imported by the network-none disposable runner; real overlapping DB sessions."""
import subprocess
import time


def run_concurrency(name, sql):
    argv = ['docker', 'exec', '-i', name, 'psql', '-X', '-At', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']

    def query(statement):
        r = subprocess.run(argv, input=statement, capture_output=True, text=True, timeout=20)
        if r.returncode:
            raise RuntimeError(r.stderr[-2500:])
        return r.stdout.strip()

    def overlap(first, second, second_error=None):
        label = 'r1_concurrency_barrier'
        process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        process.stdin.write(f"begin; set application_name='{label}'; {first}; select pg_sleep(0.8); commit;\n")
        process.stdin.close()
        # Observe the post-mutation barrier, not a guessed sleep at the caller.
        for _ in range(100):
            if query(f"select count(*) from pg_stat_activity where application_name='{label}' and wait_event='PgSleep'") == '1':
                break
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read())
            time.sleep(.02)
        else:
            process.kill()
            raise RuntimeError('barrier not observed')
        r = subprocess.run(argv, input=second, capture_output=True, text=True, timeout=20)
        process.wait(timeout=20)
        err = process.stderr.read()
        assert process.returncode == 0, err
        process.stdout.close()
        process.stderr.close()
        if second_error:
            assert r.returncode != 0 and second_error in r.stderr, r.stderr
        else:
            assert r.returncode == 0, r.stderr
        return r.stdout.strip()

    query('select r1_test.seed(n) from generate_series(30,36) n; select r1_test.seed(37,false); select r1_test.seed(38,false);')
    reserve = lambda n: f'select r1_test.reserve({n})'
    claim = lambda n: f"select public.claim_voice_source_cleanup(s,t)->>'reason' from r1_test.fixture where n={n}"
    age = lambda n, age: f"select r1_test.age_source(s,interval '{age}') from r1_test.fixture where n={n}"
    final = lambda n, op='f.op': f"select v.id from r1_test.fixture f cross join lateral public.finalize_voice_create_write_intent({op},f.u,f.t,f.c,'parallel-fixture','Parallel','storage://voice-samples/'||f.u||'/'||f.c||'/sample.wav') v where n={n}"

    # Admission owns owner lock before due. Claim skips contention; next invocation
    # sees the committed nonterminal use even though due crossed during the first TX.
    query(age(30,'23 hours'))
    result = overlap(reserve(30)+'; '+age(30,'25 hours'), claim(30))
    assert result == 'claim_conflict', result
    assert query(claim(30)) == 'in_flight_use'

    query(age(31,'25 hours'))
    overlap(claim(31), reserve(31), 'source_reupload_required')
    # New reservation begins waiting before due, but admission samples DB time
    # AFTER acquiring owner/source locks. Transaction-start now() would fail here.
    query(age(32,'23 hours 59 minutes 59 seconds'))
    overlap("select public.r1_lock_owner(u) from r1_test.fixture where n=32; " + age(32,'23 hours 59 minutes 59.8 seconds'), reserve(32), 'source_reupload_required')

    query(age(33,'25 hours'))
    assert overlap(claim(33), claim(33)) == 'claim_conflict'
    assert query(claim(33)) == 'claim_conflict'

    # Same durable operation with two finalizer responses, one anchor.
    query('select public.begin_voice_source_registration(op,u,t) from r1_test.fixture where n=37')
    overlap(final(37), final(37))
    query("select r1_test.assert((select count(distinct first_registered_at)=1 and count(*)=2 from public.voice_asset_write_intents s join r1_test.fixture f on s.id in (f.s,f.r) where n=37),'parallel response first anchor')")

    # Production keeps the pre-existing single-unresolved-owner index. To exercise
    # the explicitly required pre-first-success parallel-use defensive invariant,
    # inject a synthetic historical pair ONLY in this disposable DB, then restore
    # the identical index as soon as the first becomes terminal.
    query("""
    drop index public.voice_asset_write_intents_user_unresolved_unique_idx;
    insert into public.voice_asset_write_intents(user_id,kind,status,lease_token,lease_expires_at,registration_consent_id,registration_provider)
      select u,'voice_create','reserved',t,clock_timestamp()+interval '900 seconds',c,'mock' from r1_test.fixture where n=38;
    insert into public.voice_source_uses(source_upload_intent_id,registration_intent_id,user_id,requires_audio)
      select uses.source_upload_intent_id,i.id,i.user_id,uses.requires_audio
      from r1_test.fixture f join public.voice_asset_write_intents i on i.user_id=f.u and i.kind='voice_create' and i.id<>f.op
      join public.voice_source_uses uses on uses.registration_intent_id=f.op where n=38;
    insert into r1_test.pending select 38,i.id from r1_test.fixture f join public.voice_asset_write_intents i
      on i.user_id=f.u and i.kind='voice_create' and i.id<>f.op where n=38;
    select public.begin_voice_source_registration(i.id,f.u,f.t) from r1_test.fixture f join public.voice_asset_write_intents i
      on i.user_id=f.u and i.kind='voice_create' where n=38;
    """)
    second_final = final(38, '(select op from r1_test.pending where n=38)')
    overlap(final(38), second_final)
    query("""create unique index voice_asset_write_intents_user_unresolved_unique_idx
      on public.voice_asset_write_intents(user_id) where status in ('reserved','manual_required');
      select r1_test.assert((select count(distinct first_registered_at)=1 and count(*)=2 from public.voice_asset_write_intents s join r1_test.fixture f on s.id in (f.s,f.r) where n=38),'two parallel first successes one anchor');""")

    # Defensive pre-first-success parallel use must still block after the first
    # commits. This synthetic pair is impossible to admit through the product RPC.
    query("""
    select r1_test.seed(40,false);
    drop index public.voice_asset_write_intents_user_unresolved_unique_idx;
    insert into public.voice_asset_write_intents(user_id,kind,status,lease_token,lease_expires_at,registration_consent_id,registration_provider)
      select u,'voice_create','reserved',t,clock_timestamp()+interval '900 seconds',c,'mock' from r1_test.fixture where n=40;
    insert into r1_test.pending select 40,i.id from r1_test.fixture f join public.voice_asset_write_intents i
      on i.user_id=f.u and i.kind='voice_create' and i.id<>f.op where n=40;
    insert into public.voice_source_uses select u.source_upload_intent_id,p.op,u.user_id,u.requires_audio
      from r1_test.fixture f join r1_test.pending p using(n) join public.voice_source_uses u on u.registration_intent_id=f.op where n=40;
    select public.begin_voice_source_registration(i.id,f.u,f.t) from r1_test.fixture f join public.voice_asset_write_intents i
      on i.user_id=f.u and i.kind='voice_create' where n=40;
    """)
    query(final(40))
    query("""create unique index voice_asset_write_intents_user_unresolved_unique_idx
      on public.voice_asset_write_intents(user_id) where status in ('reserved','manual_required');""")
    query(age(40,'25 hours'))
    assert query(claim(40)) == 'in_flight_use'
    query(final(40, '(select op from r1_test.pending where n=40)'))
    assert query(claim(40)) == 'claimed'

    # Hold and claim serialize on the very same persisted Account request row.
    query("""insert into r1_test.requests(n) values(34),(35);
      insert into public.account_deletion_requests(id,user_id,status,confirmed_at)
      select r.id,f.u,'confirmed',clock_timestamp() from r1_test.requests r join r1_test.fixture f using(n) where n in (34,35);""")
    query(age(34,'25 hours')+'; '+age(35,'25 hours'))
    hold = lambda n: f"select public.apply_account_deletion_legal_hold(id,array['storage'],'lh_'||repeat('a',32)) from r1_test.requests where n={n}"
    assert overlap(hold(34), claim(34)) == 'claim_conflict'
    assert query(claim(34)) == 'legal_hold'
    overlap(claim(35), hold(35), 'source_cleanup_in_progress')

    # New callers cannot be labeled concurrent retries: actual simultaneous
    # admissions preserve the original singleton restriction.
    overlap(reserve(36), reserve(36), 'voice_asset_writer_in_progress')
    # Consent read-failure completion vs cleanup, in both transaction orders.
    # The same owner/source locks serialize authority; cancelled attempts cannot
    # replay dispatch, cancel a newer registration, or overwrite a cleanup claim.
    query("select r1_test.seed(n) from generate_series(50,54) n;")
    for n in range(50,55):
        query(f"""insert into r1_test.pending
          select {n},(public.reserve_voice_source_registration(u,'voice_consent_create',t,gen_random_uuid(),
            'mock',null,'storage://voice-consents/'||u||'/consent.wav')).id from r1_test.fixture where n={n};
          select public.begin_voice_source_registration(p.op,f.u,f.t) from r1_test.pending p join r1_test.fixture f using(n) where n={n};
          select r1_test.age_source(r,interval '25 hours') from r1_test.fixture where n={n};""")
    read_end = lambda n, ok='false': f"select public.finish_voice_consent_source_read(p.op,f.u,f.t,{ok}) from r1_test.pending p join r1_test.fixture f using(n) where n={n}"
    consent_claim = lambda n: f"select public.claim_voice_source_cleanup(r,t)->>'reason' from r1_test.fixture where n={n}"
    clocks = query("select jsonb_agg(jsonb_build_array(i.id,i.first_registered_at,i.first_registration_intent_id,i.cleanup_due_at) order by i.id) from public.voice_asset_write_intents i join r1_test.fixture f on f.r=i.id where n between 50 and 54")
    assert overlap(read_end(50), consent_claim(50)) == 'claim_conflict'
    assert query(consent_claim(50)) == 'claimed'
    assert query(read_end(50)) == 'f'
    assert query(read_end(50,'true')) == 'f'
    assert query(consent_claim(51)) == 'in_flight_use'
    assert overlap(consent_claim(51), read_end(51)) == 't'
    assert query(consent_claim(51)) == 'claimed'
    # Dispatch wins => failure cannot overwrite. Failure wins => dispatch denied.
    assert overlap(read_end(52,'true'),read_end(52)) == 'f'
    assert query(consent_claim(52)) == 'in_flight_use'
    assert overlap(read_end(53),read_end(53,'true')) == 'f'
    assert query(consent_claim(53)) == 'claimed'
    # An old completion token cannot touch the new operation admitted before due.
    query(read_end(54))
    query("select r1_test.age_source(r,interval '23 hours') from r1_test.fixture where n=54")
    query("select public.reserve_voice_source_registration(u,'voice_consent_create',gen_random_uuid(),gen_random_uuid(),'mock',null,'storage://voice-consents/'||u||'/consent.wav') from r1_test.fixture where n=54")
    assert query(read_end(54)) == 'f'
    assert query("select count(*) from public.voice_asset_write_intents i join r1_test.fixture f on i.user_id=f.u where n=54 and i.status='reserved'") == '1'
    # Compare unaffected clocks for both authority race orders (50-53).
    assert query("select jsonb_agg(jsonb_build_array(i.id,i.first_registered_at,i.first_registration_intent_id,i.cleanup_due_at) order by i.id) from public.voice_asset_write_intents i join r1_test.fixture f on f.r=i.id where n between 50 and 53") == query(f"select jsonb_agg(x order by x->>0) from jsonb_array_elements('{clocks}') x where x->>0<>(select r::text from r1_test.fixture where n=54)")
    print('R1_CONSENT_READ_FAILURE_CLEANUP_DISPATCH_BOTH_RACE_ORDERS_PASS', flush=True)

    print('R1_REAL_DB_CONCURRENCY_ADMISSION_DUE_CLAIM_FIRST_SUCCESS_HOLD_PASS', flush=True)
