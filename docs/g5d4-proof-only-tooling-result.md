# G5D-4 proof-only tooling final authority closeout result

Recorded: 2026-09-04

Mode: `G5D4_FIXTURE_AND_HUMAN_GATE_PROOF_ONLY_TOOLING_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH`

Result: `G5D4_FIXTURE_AND_HUMAN_GATE_PROOF_ONLY_TOOLING_CLOSED_COMMITTED_PASS`

Initial accepted review: `G5D4_FIXTURE_AND_HUMAN_GATE_PROOF_ONLY_TOOLING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW = NOT PASS`, focused `P0/P1/P2/UNKNOWN=0/1/0/0`.

Accepted final review authority: `G5D4_HUMAN_AUTHORIZATION_TEST_PROVENANCE_LIVE_LAUNCH_ISOLATION_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW = PASS`, focused `P0/P1/P2/UNKNOWN=0/0/0/0`.

The initial Human authorization provenance P1 was exact: the live confirmation helper accepted synthetic TTY streams and the live wrapper accepted injected collector capability/evidence, so a self-test confirmation was not structurally distinguished from Human live authorization. The minimum correction closed only that provenance/public-surface path, and the focused independent re-review passed with no new P0, P1, or UNKNOWN.

This result remains proof-only tooling and fake-only validation. It does not create a fixture, request or create Human authorization, connect to Canonical Staging/Production/Provider/Storage/Auth, begin G5D-4, enable the destructive guard, or execute the canonical account-deletion operator.

## Correction files

- `scripts/g5d4-proof-contract.mjs`
- `scripts/g5d4-proof-private-state.mjs`
- `scripts/g5d4-read-only-evidence-collector.mjs`
- `scripts/g5d4-authorized-step-wrapper.mjs`
- `scripts/g5d4-proof-tooling-self-test.mjs`
- `docs/g5d4-proof-only-tooling-result.md`
- `docs/current-state.md`

The prior proof-only tooling WIP is retained. Product source, fixture helper, evidence template, package surface, migration, schema, and generated types were not changed by this correction.

## Corrected fixture authority

- User A prep-stop observed rows: `17`.
- User A after Provider/Storage target sealing: `22`.
- User A D/A/R: `15 / 1 / 6`; `22 = 15 + 1 + 6`.
- User B control observed rows: `16`; account deletion request count `0`.
- User A and B each require exactly one active `voice_cloning` consent and one active `pronunciation_processing` consent.
- The obsolete `16 / 21 / 14 / 1 / 6` authority is rejected.
- The exact writer-intent set is `voice_create`, `script_audio_create`, `voice_sample_upload`, `voice_consent_upload`, and `recording_upload`.
- A/B recording fixtures may be verified only through the normal consent-gated Web or Mobile recording contract. The fixture helper cannot invoke the recording Storage service directly.

## Implemented proof-only boundaries

### Contract and safe evidence

`scripts/g5d4-proof-contract.mjs` defines strict Zod schemas for the private manifest, corrected A/B fixtures, exact 18-table categories, micro-steps, aliases, collector output, authorization, proof binding, and wrapper result. Unknown fields fail. Manifest, collector, authorization, and proof-binding contracts are now v2 and require one exact coherent provenance profile:

- live: `g5d4_live / human_tty_live_v1 / live_read_only_v1`
- self-test: `g5d4_self_test / self_test_v1 / self_test_v1`

Mixed, missing, and unknown profiles fail schema validation. Reviewer output is constructed through an allowlist schema, scanned against exact private sentinels, and then checked for prohibited keys and value shapes. Reviewer output has no free-form note/error field.

### Private state and aliases

`scripts/g5d4-proof-private-state.mjs` creates only OS-temp run directories. It requires directory mode `0700`, file mode `0600`, direct temp containment, non-symlink `lstat`/`realpath` identity, exclusive `O_NOFOLLOW` file creation where available, link-based atomic no-overwrite publication, directory `fsync`, and verified cleanup absence. Repo paths and `supabase/.temp/` are refused.

Manifest generations are append-only and digest-chained; no generation may follow a sealed generation. `runPurpose`, `confirmationProvenance`, and `collectorProvenance` are present from generation 1 and become part of the sealed manifest MAC. A copied/renamed self-test directory remains self-test by sealed content, not by its directory name. The alias key is a run-local 32-byte CSPRNG value. HMAC-SHA256 is domain-separated by role and purpose. Aliases have the exact `g5d4_v1` plus 64-lowercase-hex shape, and a collision registry rejects inconsistent reuse. The key is never included in reviewer output.

Credential-shaped fields and values are rejected from the manifest. API keys, JWTs, cookies, DB passwords, Magic Link tokens, and provider credentials are not fixture authority fields.

### Read-only collector and B fingerprint

`scripts/g5d4-read-only-evidence-collector.mjs` restricts dependency-injected read interfaces to `g5d4_self_test`. Those interfaces remain DB `select`; Storage `read/list/info/download`; Auth `get`; Provider `get`; project/migration inspection; and local git inspection. Extra method groups or mutation methods are rejected. They can emit only `self_test_v1` collector provenance.

The live wrapper calls `createLiveReadOnlyCollector()` internally and accepts no caller collector/evidence DTO. A safe real live adapter factory is not yet constructible in this proof-only WIP, so the factory is deliberately unarmed and fails before any network call. Therefore the live path has spawn count `0` in this correction. This is preferred to granting live authority to an injected fake collector.

The collector contract continues to validate the corrected A prep/sealed contract, B control contract, two processing consents, five writer intents, Provider/Auth identity and presence, four exact Storage bucket objects, request conflict/state, durable target state, migrations `0001`–`0027` with pending `0`, commit, tracked-clean state, and Canonical Staging identity. Run/confirmation/collector provenance are bound into the collector semantic digest and B-refresh digest.

The B fingerprint uses stable DB row identity/ownership/timestamps/status/relations; Provider identity/presence/deletion state; Storage bucket kind, HMAC key, presence, size, content HMAC, content type, version, and stable metadata; and Auth presence, identity binding, normalized-contact HMAC, provider, confirmation, and deletion state. Request IDs, rate-limit/read telemetry, transport headers, signed URLs, and transport envelopes are excluded. A domain-separated HMAC over canonical ordered component digests produces the root.

### Authorization and consume-once

The strict `g5d4.authorization.v2` state machine still has only `issued -> confirmed -> consumed`. It additionally binds exact run purpose, confirmation provenance, and collector provenance to the run, micro-step, fixture alias, target alias/digest/count, commit, project ref, collector digest, timestamps, record digest, and local integrity MAC. It has no retry, wildcard, target-expansion, or next-step permission.

The live confirmation API has exactly `(runDirectory, issuedPath)`. It rejects extra arguments and has no `input`, `output`, `fakeConfirm`, `skipHuman`, `force`, `autoConfirm`, argv, or environment confirmation path. It requires a sealed `g5d4_live` manifest, matching live-issued authorization, `process.stdin.isTTY === true`, `process.stdout.isTTY === true`, and the fixed phrase read directly from `process.stdin`. Its timestamp is created internally.

Synthetic confirmation is implemented only inside the self-test file, never calls the live helper, and can publish only the self-test provenance profile. Confirmation leaves binding fields immutable. The local integrity HMAC is explicitly an integrity control, not a Human signature or a new OS-account attacker attestation system.

Consumption verifies the confirmed record and current bindings, exclusively publishes the consumed generation before child launch, `fsync`s the directory, and rereads/verifies its digest. Concurrent processes have one winner; `EEXIST` losers stop. Spawn failure does not restore authorization. Any retry requires a new authorization.

No real Human-confirmed record was created. The self-test created fake records only in a temporary directory that it removed.

### Wrapper and proof binding

`scripts/g5d4-authorized-step-wrapper.mjs` has no registered live package command. Direct accidental invocation returns exit code `2`, `not_started`, and child spawn count `0`.

The live export accepts only `{ runDirectory, confirmedAuthorizationPath, microStep }` through a strict schema. Caller-supplied collector objects/evidence, child launchers, input/output streams, timestamps, and fake/test capabilities are unknown fields and fail before spawn. Live dependencies are selected internally. The explicitly named self-test-only export requires both the self-test OS-temp prefix and sealed self-test provenance; it cannot accept a live run.

Before a future child launch, the wrapper requires the exact live provenance profile on the sealed manifest, fresh internally owned collector, confirmed authorization, B refresh, proof binding, and internal child, plus correct private permissions, exact project/ref and commit, tracked-clean git evidence, exact/pending-zero migrations, parent production/destructive guards off, corrected A/B bindings, exact micro-step and target, current B fingerprint, and unconsumed authorization. Missing any prerequisite leaves child spawn count `0`.

After atomic consume, the wrapper writes and rereads a private `0600` proof artifact binding authorization/collector/manifest digests, B fingerprint, run/micro-step, commit/ref, fixture/target aliases, and target digest/count. A private FD capsule carries the request authority to the child; it is absent from OS argv. The future child environment alone receives the destructive guard. Launch is `shell=false`, retry `0`, chaining `0`, and one child maximum.

Stdout/stderr are captured only in private `0600` files. Strict safe parsing maps exit `0` success and exit `2` valid progress separately. Reviewer output never copies child diagnostics. The wrapper refreshes B, compares the stable fingerprint, verifies the parent guard remains off, and always returns a mandatory stop.

The self-test path used only the fixed fake-only child launcher. The live entry remained unarmed with spawn `0`; the canonical child was not launched.

### Fixture preparation and evidence template

`scripts/g5d4-fixture-prepare.mjs` contains ordered Human-action checkpoint verification only: A/B Magic Link login, both processing consents, sample/consent material, normal Web/Mobile recording, Provider awareness, A deletion request/confirmation, prep-stop, target sealing, and Human Gate readiness. It creates no account/request/object/provider resource, performs no browser/session automation, and never authorizes execution.

`docs/g5d4-proof-evidence-template.md` contains only reviewer-safe aliases, digests, counts, fixed statuses, guard transitions, D/A/R, B equality, Completion/replay, and verdict placeholders.

## Fake-only self-test

`npm run g5d4:proof-tooling:self-test`: `PASS 61/61`.

The required 40-case matrix passed, including permissions, symlink/path escape, no-overwrite, alias determinism/domain separation/collision, raw absence, wrong step/fixture/target/ref/commit, stale collector, unconfirmed/consumed authorization, concurrent one-winner consume, spawn-failure permanence, retry `0`, exactly one stub child, `shell=false`, corrected/obsolete fixture contracts, consent/table/writer mismatch, stable/protected/excluded B fingerprint behavior, guard/Production/migration rejection, layered redaction, exit-code-2 progress, cleanup, tampered MAC, alias/B/target substitution, consumed rollback, and raw child output isolation.

Additional cases passed for protected identity/presence/content mutations, unexpected saved-model/best rows, normal consent-gated recording-only preparation, manifest chaining/sealing, poisoned network/mutation access, direct wrapper fail-closed behavior, unexpected pre-Gate durable targets, all mandatory provenance-isolation negatives, and final temp cleanup.

The new negative matrix proves spawn `0` for self-test authorization/collector through the live wrapper, renamed/copied self-test state, provenance MAC tampering, synthetic TTY injection, live manifest plus self-test record, mixed collector provenance, fake collector/launcher injection, missing/unknown provenance, caller-supplied stale evidence, unsealed live manifest, and the unarmed live collector factory. The fake-only path still proves consume-once, exactly one child, spawn-failure consumption, retry `0`, chaining `0`, and `shell=false`.

The concurrency case used eight real Node child processes against one fake confirmed record: winner `1`, `EEXIST` losers `7`.

## Existing regressions and validation

- `npm run check:workspace`: PASS.
- `npm run g5d4:proof-tooling:self-test`: PASS, `61/61`.
- `npm run account-deletion:operator:self-test`: PASS.
- `npm run account-deletion:operator:provider-self-test`: PASS.
- `npm run account-deletion:operator:storage-self-test`: PASS.
- `npm run account-deletion:operator:database-self-test`: PASS.
- `npm run account-deletion:operator:auth-self-test`: PASS.
- `npm run account-deletion:operator:completion-self-test`: PASS.
- focused ESLint over all six new scripts: PASS.
- `npm run lint`: PASS, zero warnings/errors.
- `npm run build`: PASS.
- `npm run typecheck`: PASS after build.
- `git diff --check`: PASS.

No migration/isolated-DB proof was needed because this unit changes no database/schema/type source.

## Exact hard-zero result

- Product service/repository/runner/entry/API/UI/README diff: `0`.
- Migration `0028` or any migration/schema/generated-type diff: `0`.
- Canonical Staging access/mutation: `0/0`.
- Production access/mutation: `0/0`.
- Real ElevenLabs call: `0`.
- Real Storage read/mutation: `0/0`.
- Real Auth call: `0`.
- Account/fixture/deletion-request creation: `0/0/0`.
- Human authorization request/creation: `0/0`.
- Parent/process destructive guard enable: `0`.
- Canonical account deletion/operator execution: `0/0`.
- Auth P2 cleanup: `0`.
- `supabase/.temp/` operation: `0`.
- Before this final authority closeout, commit/push: `0/0`.

## Findings and authority state

- Initial Human authorization provenance finding P0/P1/P2/UNKNOWN: `0/1/0/0`; the P1 is closed by the minimum correction.
- Accepted focused independent re-review: `PASS`.
- Focused post-correction P0/P1/P2/UNKNOWN: `0/0/0/0`.
- Program P0/P1/P2/UNKNOWN: `0/0/1/0`.
- Known P2 `auth_terminal_authority_missing`: unchanged, nonblocking deferred cleanup.
- Provider: `CLOSED`.
- Storage: `CLOSED`.
- Database: `CLOSED`.
- Auth: `CLOSED`.
- Completion: `CLOSED`.
- Five-stage connected non-live proof: `CLOSED_COMMITTED_PASS` authority retained.
- G5D-4: `NOT AUTHORIZED / NOT STARTED`.
- G5D-2: `OPEN`.
- Gate 5: `OPEN`.
- Live collector: intentionally unarmed and fail-closed with child spawn `0`.
- Real Canonical Staging/provider/storage/Auth/destructive proof: `NOT PERFORMED`.
- Proof-only tooling closeout authority: `G5D4_FIXTURE_AND_HUMAN_GATE_PROOF_ONLY_TOOLING_CLOSED_COMMITTED_PASS`.

Exact next one action:

`G5D4_DISPOSABLE_STAGING_FIXTURE_PREPARATION`
