# G5C-B2b Durable Provider Transition Runner

Status: `CLOSED_COMMITTED_PASS`

`0016_g5c_b2b_provider_voice_transitions.sql` was applied through the normal linked CLI path to canonical Staging `native-minute-staging` (`ztlliqishddrrvqqrrlu`). Remote migration history is exactly `0001`–`0016` applied.

- Actual PostgreSQL proof passed for the four migration-defined RPCs: fixed signatures, `SECURITY DEFINER`, service-role-only execute, and direct durable-table mutation denial.
- A synthetic, disposable Staging-only fixture exercised the real server-only repository and runner. Fixture setup was limited to the new fixture's approved precondition; every B2b transition used the focused RPCs. Cleanup removed all synthetic fixture identities and cascade rows; existing user data was not read or changed.
- Durable state proof passed: DELETE intent and monotonic `destructive_started_at`; `provider_rejected` remains `delete_requested/rejected/pending` without immediate manual status; next invocation is exactly one fake GET; verified absence reaches `verified_absent`; GET present and `ownerSignal=false` reach `manual_required`; transient GET retries remain GET-first with budget `5`; nonretryable GET becomes manual without automatic DELETE retry.
- Actual lease and CAS proof passed for valid owner acceptance, wrong/expired/mismatched context rejection, stale counter rejection, and delayed prior-lease result rejection. Durable DELETE-intent, rejected-DELETE, and unrecorded-GET restart cases all resumed GET-first.
- Stage boundary passed: verified provider targets did not trigger Storage cleanup, consent withdrawal, binding cleanup, or final operation completion.

Provider adapter responses were fake only. Live ElevenLabs DELETE/GET calls: `0`. Provider voice IDs, raw user identifiers, emails, secrets, Storage paths, and raw provider payloads were neither used in the proof record nor retained in this result.

P0=`0`; P1=`0`; focused repository re-audit P2=`1` retained. G5C-B3 is the next Gate but was not started.
