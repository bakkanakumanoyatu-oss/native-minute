# G5D-4 proof-only tooling result

## Final authority closeout — 2026-09-06

Mode: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH`

Result: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_VERIFIED_BINDING_CLOSED_COMMITTED_PASS`

Accepted final independent focused re-review authority: `G5D4_VERIFIED_BINDING_IMMUTABLE_SNAPSHOT_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW = PASS`. This supersedes the pending-review findings and next actions in the historical correction sections below; no new implementation or independent audit is part of this closeout.

- Incremental manifest unsupported P1 (`G5D4_PRIVATE_MANIFEST_INCREMENTAL_BINDING_UNSUPPORTED`) was found, corrected, and is now `CLOSED`.
- Unverified raw bind P1 (`G5D4_INCREMENTAL_PRIVATE_MANIFEST_UNVERIFIED_RAW_BIND_BYPASS`) was found, corrected, and is now `CLOSED`.
- Mutable receipt TOCTOU P1 (`G5D4_VERIFIED_BINDING_MUTABLE_RECEIPT_TOCTOU`) was found, corrected, and is now `CLOSED`; the final independent re-review could not reproduce it and rejected Identity/Provider/Storage/request substitution.

Accepted authority remains `preparing → incremental verified bindings → fixture_complete → sealed`. Live raw binding is structurally unavailable; live binding requires approved verification bound to the exact run/role/kind/target/generation. The returned receipt supplies opaque object identity only; module-private immutable snapshots supply all authoritative verified state, and bind/persistence never reread caller-controlled receipt fields. Stale generations and self-test capabilities in live manifests are rejected; complete/seal revalidate verified immutable binding provenance. Existing Human authorization and wrapper safety remain unchanged.

Preflight matched Developer root, `codex/g3-mobile-main-loop`, HEAD/upstream `bd53c9ff5d16f52ca489199ff44057212f20516d`, ahead/behind `0/0`, exactly the six existing WIP files, and only allowed untracked `supabase/.temp/`. Closeout changes only this result and `docs/current-state.md`; the four script files retain the reviewed implementation. The six-file correction is the atomic commit scope; this document does not preassign its commit SHA.

Closeout validation: `npm run check:workspace`, current `npm run g5d4:proof-tooling:self-test` **`165/165 PASS`** (including verified-binding `62/62`, immutable snapshot `20/20`, and consume-once), and `git diff --check`: PASS. The self-test ran under OS network deny with Next telemetry disabled. Accepted implementation/re-review authority already includes lint, build, post-build typecheck and diff-check PASS; these full checks were not rerun for this docs-only closeout. No new environment variable, migration, generated DB type or README setup change is needed.

Scope audit: product service/API/UI/account-deletion operator semantics/wrapper/migration/schema/generated DB type diffs=`0`; migration `0028`=`0`. Production/Canonical Staging/real ElevenLabs/Storage/Auth access=`0`; real fixture/account/request creation=`0`; real external/destructive proof=`0`; Human destructive authorization request/creation=`0`; destructive guard enable/execution=`0`; `supabase/.temp/` operation=`0`.

Focused `P0/P1/P2/UNKNOWN=0/0/0/0`; program aggregate `0/0/1/0`. Known Auth P2 `auth_terminal_authority_missing` remains unchanged, nonblocking and deferred. Human prerequisites remain `SATISFIED`; destructive Human authorization remains `NOT GRANTED`; G5D4 remains `NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5 remain `OPEN`. Live reader and collector remain intentionally `UNARMED`. This closes only the incremental-manifest / verified-binding correction lane. Its design is finished and is not reopened without a concrete new blocker.

Exact `NEXT_ONE_ACTION`: `G5D4_LIVE_READ_ONLY_COLLECTOR_MINIMUM_ARMING`.

Source basis: `createLiveFixtureVerificationReader()` throws before the live verifier can inspect the identity/zero baseline or issue a binding capability; `bindVerifiedFixturePreparationAuthority()` requires that verifier, and the persisted A-login checkpoint requires the resulting identity binding. `createLiveReadOnlyCollector()` also remains unarmed. Current source therefore does not establish an operational identity/zero-baseline unit before approved module-owned reader/collector wiring. No arming or fixture preparation is performed in this closeout.

## Prior immutable verified snapshot correction (historical, pending-review status superseded)

Mode: `G5D4_VERIFIED_BINDING_IMMUTABLE_INTERNAL_SNAPSHOT_MINIMUM_CORRECTION`

Result: `G5D4_VERIFIED_BINDING_IMMUTABLE_INTERNAL_SNAPSHOT_CORRECTED_PENDING_FOCUSED_RE_REVIEW`

Accepted independent review P1: `G5D4_VERIFIED_BINDING_MUTABLE_RECEIPT_TOCTOU` — mutable verified receipt TOCTOU permits unverified binding. The same receipt identity could return verified A during canonical comparison and caller-re-signed B during reparsing, allowing unverified Identity/Provider/Storage/request authority and subsequent complete/seal. The prior `145/145` passed; the new stateful Identity substitution regression failed against that implementation before this correction. This section supersedes the prior receipt-integrity claim below; **P1 remains open pending independent re-review**.

Preflight matched Developer root, `codex/g3-mobile-main-loop`, HEAD/upstream `bd53c9ff5d16f52ca489199ff44057212f20516d`, ahead/behind `0/0`, the exact existing six-file verified-binding WIP, and only allowed untracked `supabase/.temp/`. Workspace and diff checks passed; no fetch or temp-directory operation occurred.

This unit changes only `scripts/g5d4-proof-private-state.mjs`, `scripts/g5d4-proof-tooling-self-test.mjs`, this result and `docs/current-state.md`. The existing contract/helper WIP is preserved without additional changes; total tracked WIP remains the same six files.

- **Internal authority:** separate module-private live/self-test WeakMaps now map an opaque receipt identity to a full immutable snapshot. It contains canonical run directory, the exact verified binding (including Storage bucket/key or request ID/ref), and validated run ID/purpose/provenance, generation/digest, role/kind, target/owner/relation digests, state/count/time and MAC. Existing schema parsing owns the checked binding/read result; `structuredClone` copies the complete binding and metadata. The snapshot, binding, nested Storage target and flat metadata are frozen. Only the relation digest is retained from nested read observations; no caller object/array/getter/Proxy/Buffer reference is stored.
- **Opaque key and bind:** the returned receipt is a frozen empty null-prototype object. Binding performs only WeakMap identity lookup on it, never canonicalization, parsing or field reads. The unchanged input argument is an exact expected target/kind/role/slot assertion, not persisted authority. All raw values and verification metadata persisted by bind come exclusively from the immutable snapshot. External freezing is supplementary: isolated tests remove only that freeze and still reject substitutions with receipt getter reads `0`.
- **Freshness/isolation:** current run/purpose/HMAC/owner and exact generation/digest checks remain. Successful publication consumes the capability; any intervening generation makes unused snapshots stale. Copied/Proxy-wrapped/cross-module/cross-run receipts fail identity lookup; self-test snapshots cannot enter the live registry. The live constructor stays private, raw population stays self-test-only, and production live reader/collector remain intentionally unarmed. No public reader override or shortcut was added.
- **Complete/seal:** existing verification coverage, HMAC, provenance and generation-chain checks remain. Tests confirm all four substituted raw bindings are refused by completion validation. A full 13-binding fixture subjected to caller-side receipt substitutions completes/seals only with the original verified raw values and matching live-purpose verification metadata. All such positive runs use isolated fake readers, never real fixtures or live-read authority.

Validation: existing `145/145` retained (receipt-mutation expectations updated for opaque keys), new immutable-snapshot focused `20/20`, combined **`165/165 PASS`**. New coverage includes stateful Identity/Provider/Storage/request substitution against both frozen and deliberately mutable test keys, nested read-result arrays/objects, nested Storage getter/Proxy mutation, copied/Proxy-wrapped keys, single-use, stale generation, self-test isolation, exact persisted metadata and full attacked-fixture completion/sealing. Existing verified-binding focused `62/62` also passes separately. The full suite retains the eight-process consume-once race: one winner, seven `EEXIST` refusals; incremental chain/rebind/raw-live-bind/partial complete-seal defenses; A `17 → 22`, D/A/R `15/1/6`, B `16`, two processing consents, five writer intents, obsolete `16/21/14/1/6` rejection and absence of direct `uploadOwnedRecording` bypass.

Workspace check, full self-test, both focused suites, consume-once regression, `npm run lint`, focused ESLint, `npm run build`, post-build `npm run typecheck` and `git diff --check`: PASS. Execution checks ran under OS network deny with Next telemetry disabled. Product bridge suites, E2E expansion and real-device checks were not run because this unit changes proof-only receipt handling. No new environment variable, README setup step, schema or migration is required.

Hard zero: real network; Canonical Staging/Production/Auth/Provider/Storage access; real fixture/account/request creation; Human destructive authorization request/creation; destructive guard enable; account-deletion execution; migration apply; `supabase/.temp/` operation. Wrapper/product/API/UI/adapter/service/operator/migration/schema/generated-type/environment/README changes: `0`. Commit/push: `0/0`.

Human prerequisites remain `SATISFIED`; destructive authorization `NOT GRANTED`; G5D4 `NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5 `OPEN`. Pending independent review: focused `P0/P1/P2/UNKNOWN=0/1/0/0`, program `0/1/1/0`; known `auth_terminal_authority_missing` P2 remains deferred and unchanged. No additional finding was identified by local correction checks; no closeout is claimed.

Exact `NEXT_ONE_ACTION`:

`G5D4_VERIFIED_BINDING_IMMUTABLE_SNAPSHOT_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`

## Prior verified binding correction (historical, mutable receipt boundary superseded)

Mode: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_VERIFIED_BINDING_BOUNDARY_MINIMUM_CORRECTION`

Result: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_VERIFIED_BINDING_BOUNDARY_CORRECTED_PENDING_FOCUSED_RE_REVIEW`

Accepted independent focused re-review finding: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_UNVERIFIED_RAW_BIND_BYPASS` (P1). The prior 83 cases did not reject raw live bindings: both the exported raw bind and caller-supplied helper booleans could populate/complete/seal a live-purpose manifest without an existence check. This correction changes only that boundary; the accepted incremental lifecycle, aliases, target semantics, DAR/consent authority, authorization and wrapper are retained.

Preflight: Developer root, `codex/g3-mobile-main-loop`, HEAD/upstream `bd53c9ff5d16f52ca489199ff44057212f20516d`, ahead/behind `0/0`; exact expected six-file incremental WIP and only allowed untracked `supabase/.temp/`. Workspace/diff checks passed. No temp-directory operation or git fetch was performed.

Changed exactly the same six WIP files: `scripts/g5d4-proof-contract.mjs`, `scripts/g5d4-proof-private-state.mjs`, `scripts/g5d4-fixture-prepare.mjs`, `scripts/g5d4-proof-tooling-self-test.mjs`, this result, and `docs/current-state.md`.

- **Raw-live-bind isolation:** `bindFixtureManifestAuthority()` now requires `g5d4_self_test` before any bind. Its private underlying primitive is not exported. Live callers use `verifyLiveFixtureAuthority()` then `bindVerifiedLiveFixtureAuthority()`. Neither verifier nor helper accepts caller evidence, adapters, provenance overrides or shortcut flags. `createSelfTestFixtureVerification()` can only issue `self_test_v1` capabilities for a self-test run.
- **Receipt creation/integrity:** only the private checked-read path creates a live capability. A module-private WeakMap records the exact object, payload and canonical run directory; copied, fabricated, re-signed, cross-module and altered objects cannot satisfy live bind. Persisted `g5d4.fixture-verification.v1` metadata uses the existing run key with domain-separated HMAC. It binds run ID/purpose, live/self-test provenance, generation/digest, A/B role, kind, exact raw binding digest, owner digest, checked relation digest, state/count and internally recorded verification time. There is no second key hierarchy, generic attestation service or public raw receipt issuer.
- **Target/generation:** receipt generation and digest must equal the latest manifest. Verification also rereads latest generation after the asynchronous read, before issuing a receipt. An intervening bind refuses issuance or makes an existing receipt stale. Successful bind publishes exactly the next generation and consumes the in-process capability. Process restart requires re-verification for an unconsumed capability; persisted metadata is audit evidence, not a portable bind credential.
- **Identity:** the internal reader contract requires exact role/user, present confirmed Auth identity, exactly one matching profile, and the complete 17-table non-profile zero baseline. Missing/nonzero/duplicate baseline coverage, wrong role or target cannot issue a receipt.
- **Provider/Storage/request:** Provider requires exact presence/count and matching owner/resource DB binding. Each Storage object requires exact bucket/key presence/count and matching owner/DB locator; recordings additionally require the consent-gated Web/Mobile contract and no direct bypass. Request requires exact A owner, ID/ref, one confirmed request, zero conflicts, exact B control identity and zero B requests. Failed checks cannot append a generation.
- **Complete/seal defense:** every bound authority must have one valid matching HMAC/provenance record. Chain reads verify coverage, target/owner binding, append-only metadata and exact predecessor generation/digest; completion and sealing recheck all final bindings. Missing metadata, legacy/raw live population and self-test provenance fail closed even after the unsealed outer digest chain is recomputed. No legacy metadata is silently promoted.
- **Fixture helper:** the canonical future sequence remains A baseline → verified A bind → B baseline → verified B bind → verified Provider/Storage objects → verified confirmed request → complete → seal. Human checkpoint observations remain separate; booleans cannot substitute for the binding capability. Existing recording-consent checks and prohibition on direct `uploadOwnedRecording` remain.

**Live readiness limit:** the existing live collector is intentionally unarmed. This correction also leaves the module-owned live fixture reader unarmed: the production verifier fails before any read or receipt issuance. It adds no real Auth/Provider/Storage/DB transport. The positive live-purpose cases run in isolated test module instances that replace only the private reader factory with fixed fake reads; validation, capability creation, binding and chain code run unchanged. A capability from such an instance is rejected by the production bind API. These cases prove the local boundary, not actual fixture existence or readiness for live preparation. Approved module-owned live reader wiring remains a prerequisite for future fixture preparation; no public injection path is provided.

Validation: prior `83/83` plus new verified-binding focused `62/62` = `145/145` PASS, including the eight-process consume-once race (one winner, seven `EEXIST` refusals). Focused negatives cover all five raw live binds, synthetic/cross-run/cross-module receipt rejection, A/B and kind/target substitution, stale and during-read generation changes, receipt/MAC/provenance tampering, legacy completion/seal refusal, malformed Auth/profile/baseline/Provider/Storage/request reads, and verified A/B conflicts. Positive cases cover A/B, both Provider resources, all eight Storage objects, request, complete/seal and self-test population. Preparing/immutability/digest-chain, partial seal/authorization/wrapper, provenance isolation, A `17 → 22`, D/A/R `15/1/6`, B `16`, two processing consents, five writer intents, obsolete `16/21/14/1/6` rejection and consent-gated recording regressions remain PASS.

`npm run check:workspace`, full proof-tooling self-test, focused `--verified-binding-only`, `npm run lint`, focused ESLint, `npm run build`, post-build `npm run typecheck`, and `git diff --check`: PASS. Verification commands used OS network deny and disabled Next telemetry. No product bridge suite or E2E expansion was run because those sources/contracts did not change. Isolated test artifacts, including an intermediate failed module-loader setup artifact, were removed with absence verified.

Hard zero: real network; Canonical Staging/Production access or fixture creation; real Auth/ElevenLabs/Storage reads or writes; request creation; Human destructive authorization request/creation; guard enable; canonical account-deletion execution; migration apply; `supabase/.temp/` operation; wrapper/product/API/UI/adapter/service/operator/migration/schema/generated-type/environment/README changes. Commit/push: `0/0`.

Human prerequisites remain `SATISFIED`; destructive authorization `NOT GRANTED`; G5D4 `NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5 `OPEN`. **P1 remains open pending independent focused re-review; no closeout is claimed.** Focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program `0/1/1/0`, with known `auth_terminal_authority_missing` P2 unchanged and deferred. Local checks found no additional finding; they are not independent review authority.

Exact `NEXT_ONE_ACTION`:

`G5D4_INCREMENTAL_PRIVATE_MANIFEST_VERIFIED_BINDING_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`

## Prior incremental private manifest correction (historical, binding boundary superseded)

Mode: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_MINIMUM_CORRECTION`

Result: `G5D4_INCREMENTAL_PRIVATE_MANIFEST_MINIMUM_CORRECTION_IMPLEMENTED_PENDING_FOCUSED_RE_REVIEW`

Accepted planning authority already specified `created → populated → sealed`: OS-temp run directory → manifest → HMAC key → A baseline/binding → B baseline/binding → verified Provider/Storage resources → actually created/confirmed A request → fixture-complete validation → seal → future Human destructive authorization. This corrects an implementation mismatch, not a new lifecycle authority. Previously `createInitialPrivateManifest()` required the key and all future resources immediately. The accepted authority resolves the previous `UNKNOWN_BLOCKING`; finding `G5D4_PRIVATE_MANIFEST_INCREMENTAL_BINDING_UNSUPPORTED` is a proof-tooling `IMPLEMENTATION_GAP_P1`, not a product P1.

Preflight matched `/Users/karasawatakahiro/Developer/native-minute`, branch `codex/g3-mobile-main-loop`, HEAD/upstream `bd53c9ff5d16f52ca489199ff44057212f20516d`, ahead/behind `0/0`, tracked clean, only allowed untracked `supabase/.temp/`. Workspace and initial diff checks passed; the temp directory was not operated on.

Changed exactly: `scripts/g5d4-proof-contract.mjs`, `scripts/g5d4-proof-private-state.mjs`, `scripts/g5d4-fixture-prepare.mjs`, `scripts/g5d4-proof-tooling-self-test.mjs`, this result and `docs/current-state.md`.

- Private manifest v3 strictly discriminates `preparing → fixture_complete → sealed`. Initial creation accepts only run ID/purpose, creation time and project/ref/region/commit authority. It needs no key or fixture identifier; raw scalar authorities are genuinely null, Storage arrays empty, aliases/targets absent. Full-input creation and unknown fields fail. v2 files are not silently converted into new authority.
- `bindFixtureManifestAuthority()` permits only identity, Provider, one Storage bucket/object, or the indivisible A request ID/ref pair. A/B are independent; each resource requires its bound identity. A/B identity/Provider/object substitution, same-value rebind, replacement and duplicate bucket conflict fail. A/B each retain exactly one object in each of the four required buckets at completion.
- Each successful bind verifies the latest chain and exclusively publishes one new generation. Earlier bytes and bindings, run authority and provenance stay immutable. Aliases and stage digests/counts are derived from bound resources with the existing HMAC domains, never caller-supplied. The Storage target-set waits for A Provider plus all four A objects; the DB D15/A1/R6 target waits for all final raw bindings. Chain reads validate single-binding transitions, deterministic derived authority, lifecycle order and any seal MAC.
- `assertFixtureManifestComplete()` enforces the full former sealed raw/alias/target shape plus exact bucket universe, A/B separation and recomputed alias/digest/count equality. Exact coherent live provenance stays live; self-test provenance stays self-test and cannot be promoted by a transition. `completeFixtureManifest()` persists the validated state; `sealPrivateManifest()` requires that state and revalidates it. Preparing manifests, including fully populated but not completed manifests, cannot seal. Completed/sealed fixture bindings cannot change.
- `bindVerifiedFixturePreparationAuthority()` connects existing Human/read-only observations to local bindings: identity after Magic Link plus zero-baseline verification; Provider/Storage after presence/ownership verification; recording objects only with the canonical consent-gated Web/Mobile observation; request after actual confirmation. With `{ runDirectory }`, existing preparation checkpoints also require persisted bindings, fixture completion at prep-stop, and a sealed manifest at the target-sealed/Human-ready checkpoints. This adds no resource-creation automation or micro-modes. Verification observations remain observations, not live evidence or Human authorization.
- Authorization issuance still requires `loadLatestPrivateManifest(..., { requireSealed: true })`. The canonical collector authority retains its complete contract. Wrapper source is unchanged, and its live path still requires a complete sealed manifest and exact live provenance; live collector remains intentionally unarmed. No preparing state is accepted as destructive authority.

Validation: existing fake-only cases `61/61` plus focused incremental cases `22/22`, combined `83/83` PASS. New cases cover empty creation before key, integrity, A/B baseline/binding, rebind/substitution, partial seal/authorization/live-wrapper refusal, incremental Provider/Storage, unbound/confirmed request, each missing final authority, structural/derived authority, completion/seal, helper checkpoints, sealed immutability and generation/provenance tampering. Existing consume-once race (eight processes: one winner, seven EEXIST), live/self-test isolation, wrapper fail-close, obsolete `16/21/14/1/6` rejection, corrected A `17 → 22`, D/A/R `15/1/6`, B `16`, two processing consents, exact five writer intents and recording-consent protections remain PASS.

`npm run check:workspace`, `npm run lint`, focused ESLint, `npm run build`, post-build `npm run typecheck`, and `git diff --check`: PASS. Build and final checks run under OS network deny with Next telemetry disabled. Product Provider/Storage/Database/Auth/Completion bridge suites were not rerun because none of those sources changed; no E2E expansion or real fixture proof was run.

Hard zero: real network, Canonical Staging/Production access, Auth user/fixture/request creation, ElevenLabs call, Storage operation, destructive Human authorization, destructive guard enable, account-deletion execution, migration apply and `supabase/.temp/` operation. Product service/repository/API/UI, canonical operator/wrapper, migration/schema/generated types, environment and README diffs: `0`. Temporary synthetic test artifacts were removed. Commit/push: `0/0`.

Human prerequisites remain `SATISFIED`; no re-request. Destructive Human authorization: `NOT GRANTED`. G5D4: `NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5: `OPEN`. Implementation correction is complete, but independent focused re-review is still required: **the P1 is not closed**. Pending-review focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program including unchanged nonblocking deferred `auth_terminal_authority_missing`: `0/1/1/0`. No additional finding was identified by this implementation's local checks.

Exact `NEXT_ONE_ACTION`:

`G5D4_INCREMENTAL_PRIVATE_MANIFEST_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`

## Prior committed closeout (historical authority)

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

Prior closeout next action (superseded by the current correction above):

`G5D4_DISPOSABLE_STAGING_FIXTURE_PREPARATION`
