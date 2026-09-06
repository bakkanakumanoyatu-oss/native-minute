# G5D-4 proof-only tooling result

## Human recording checkpoint acceptance P1 correction — 2026-09-06

Mode: `G5D4_RECORDING_ORIGIN_HUMAN_CHECKPOINT_ACCEPTANCE_BINDING_P1_MINIMUM_CORRECTION`.

Result: `G5D4_RECORDING_ORIGIN_HUMAN_CHECKPOINT_ACCEPTANCE_BINDING_P1_CORRECTED_PENDING_FOCUSED_RE_REVIEW`.

Accepted independent finding: `G5D4_RECORDING_ORIGIN_HUMAN_CHECKPOINT_NOT_BOUND_TO_FIXTURE_ACCEPTANCE`. The prior preparation-state booleans did not constrain recording binding or complete/seal: thirteen machine bindings could reach sealed with zero Human recording checkpoints. This section supersedes the prior implementation assessment and next action below. **P1 remains OPEN until independent focused re-review**; this correction is not independent acceptance.

`HD-G5D4-RECORDING-ORIGIN-EVIDENCE-V1` remains unchanged: each recording needs Human confirmation of the canonical consent-gated Web action just performed **AND** immediate machine reconciliation. Historical persisted route-origin machine proof remains **NOT REQUIRED**. The checkpoint is procedural confirmation, not product consent, destructive authorization, a Human cryptographic signature or server route attestation. Direct `uploadOwnedRecording`/Storage/admin recording fixture paths remain prohibited.

Preflight: Developer cwd/git root, `codex/g3-mobile-main-loop`, HEAD/upstream `3ebfbe8a33bd484a1e4b15bf83b640a2ddb42e8e`, ahead/behind `0/0`; exact existing five proof scripts plus two docs WIP; allowed untracked `supabase/.temp/` untouched. Workspace and diff checks PASS. This correction changes exactly four proof files (`g5d4-proof-contract.mjs`, `g5d4-proof-private-state.mjs`, `g5d4-fixture-prepare.mjs`, `g5d4-proof-tooling-self-test.mjs`) and these two docs. Prior collector/adapters WIP is preserved without additional edits; total WIP is six proof scripts plus two docs.

- **Exact binding:** private manifest v4 / verification v2 carries the minimum nested `g5d4.web-recording-checkpoint.v1` record. It binds purpose `fixture_web_recording_success`, flow `web`, run ID/purpose, A/B role, safe recording alias, target/owner/script digests, the exact pre-bind generation/digest, machine-verification MAC, `confirmedAt` and checkpoint provenance/MAC. The script digest comes from the validated machine observation. The existing alias key and domain-separated HMACs protect these records; there is no new key hierarchy or product DB row.
- **Human interaction:** for A, then B: Human performs Web recording → helper immediately verifies the exact candidate with the live reader → tooling displays safe run/role/recording/script identifiers → Human types `I CONFIRM THIS EXACT RECORDING IS THE CANONICAL WEB ACTION I JUST PERFORMED` → helper binds the separate machine and Human capabilities together. The private reader requires actual process stdin/stdout TTY and OS `isatty(0/1)`. No caller input stream, boolean, phrase argument, environment/argv confirmation, force/skip/auto-confirm route or destructive authorization record is accepted.
- **Freshness:** confirmation must follow reconciliation within five minutes, with the exact same preparing manifest generation/digest and still-unbound recording slot before and after Human input and at binding. This bounded window implements the immediate-reconciliation procedure; it is not a claim about historical route timing. Expired or advanced state requires fresh reconciliation and a new explicit confirmation. Completion/seal validate the original bound state; elapsed time after valid binding does not silently invalidate later fixture generations.
- **Acceptance and immutability:** machine-only receipt rejects; Human-only/foreign/copied/mismatched checkpoint rejects. Module-private immutable snapshots and separate opaque Human capabilities bind to the same exact machine receipt. The combined verification and checkpoint are appended atomically with the recording authority. Capability reuse, A↔B, recording/run/script substitution and replacement across manifest generations fail closed. Earlier generation bytes remain immutable.
- **Complete/seal:** every recording's checkpoint is verified during chain reread and complete/seal authority validation. Full completion still requires the exact A/B bucket universe and all thirteen verified bindings. Missing/mismatched A or B checkpoint rejects; seal cannot infer confirmation from `fixture_complete` or preparation booleans.
- **Provenance:** live procedural checkpoints use `human_web_recording_tty_live_v1`; the separate self-test factory can issue only `self_test_v1` inside a self-test run. Self-test handles/metadata cannot enter live acceptance. Offline positive live-branch tests replace only terminal input/machine reads in isolated source copies; they are synthetic branch tests, not real Human confirmations or live fixture PASS. The production module has no such test switch.

Validation: complete fake-only suite **251/251 PASS**; new Human-checkpoint focused regressions **48/48 PASS**; existing verified-binding **62/62**, immutable-snapshot **20/20**, Human-Decision/live-reader **38/38**, incremental manifests, structural complete/seal, target/generation freshness, raw live bind rejection, caller injection isolation, read-only capability/environment/Production/ref/migration fail-close and concurrent consume-once remain PASS. The focused checkpoint, bypass, verified-binding and snapshot suites are separately runnable with `--recording-checkpoint-only`, `--recording-bypass-only`, `--verified-binding-only`, `--immutable-snapshot-only`.

Key closure reproduction: legacy source-copy population produced **Human checkpoint calls `0`, machine bindings `13`**. Unmodified acceptance returned **fixture_complete=`REJECT`, seal=`REJECT`**. A legacy `fixture_complete` generation also failed the real seal reader. A/B matching machine+Human inputs complete and seal in isolated tests; missing checkpoint, wrong recording/role/owner/script/run, reused/copied/synthetic capability, failed reconciliation, tampered metadata/MAC, stale generation and expired observations reject. No real Human recording checkpoint was executed.

`npm run check:workspace`, `npm run lint`, initial `npm run typecheck`, `npm run build` (57/57 static pages), post-build `npm run typecheck`, and `git diff --check`: **PASS**. Self-tests/lint/typecheck/build ran under OS network deny with telemetry disabled; real network **0**. Private synthetic run directories were cleaned. E2E, devices, real TTY confirmation and live fixture execution were not run in this proof-only correction.

Product Web/Mobile/API/UI/Storage service, collector/adapters, account-deletion operator/destructive wrapper, schema/migrations/generated DB types, README and environment files: no correction edits. Fixture counts remain A `17 → 22`, D/A/R `15/1/6`, B `16`, two consents (`voice_cloning`, `pronunciation_processing`) and exact five writer kinds. Real fixture/User A/B creation, recording upload, Provider action, Storage mutation, deletion request, destructive Human authorization/guard/execution, Production access, migration apply and `supabase/.temp/` operations: **all 0**. Commit/push/staging: **0/0/0**.

Focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program `0/1/1/0`. Known Auth P2 `auth_terminal_authority_missing` is unchanged, nonblocking and deferred. Human prerequisites=`SATISFIED`; destructive Human authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5=`OPEN`.

Exact `NEXT_ONE_ACTION`: `G5D4_RECORDING_ORIGIN_HUMAN_CHECKPOINT_ACCEPTANCE_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`.

## Human Decision rebase and live read-only collector — 2026-09-06

Mode: `G5D4_RECORDING_ORIGIN_HUMAN_DECISION_REBASE_AND_LIVE_READ_ONLY_COLLECTOR_MINIMUM_ARMING`.

Result: `G5D4_RECORDING_ORIGIN_HUMAN_DECISION_REBASED_AND_LIVE_COLLECTOR_ARMED_PENDING_FOCUSED_REVIEW`. This supersedes the historical recording-origin machine-evidence requirement and next actions in the two STOP sections below. Those sections and the pre-existing documentation WIP are retained as history. The closed incremental-manifest / verified-binding / immutable-snapshot authority is not reopened.

### Accepted Human Decision

`HD-G5D4-RECORDING-ORIGIN-EVIDENCE-V1` is the G5D4 proof-acceptance authority. For each future disposable practice recording, the Human must execute the canonical consent-gated **Web** recording flow, observe its success, and immediately perform read-only reconciliation of the current required pronunciation consent, exact completed recording writer intent, owner, script and Storage object/locator. The controlled Human action is procedure authority; collector results are current persisted-state authority. Historical persisted Web-route origin reconstruction/attestation is **NOT REQUIRED**. Neither current consent nor a completed writer is described as evidence of historical route execution.

Direct fixture use of `uploadOwnedRecording`, direct Storage upload and admin recording insertion remain prohibited. The preparation checkpoint requires `consent_gated_web`, observed Human Web success, immediate read-only reconciliation and no direct bypass. Those observations neither manufacture server evidence nor grant destructive authority. Product Web/Mobile consent checks, routes, Storage service, schema, writer-intent schema and migrations are unchanged. This Decision is **not destructive Human authorization**. No Human recording checkpoint was executed or marked satisfied in this unit; all new checkpoint examples are synthetic tests.

### Implementation and capability boundary

- Preflight: Developer cwd/git root; branch `codex/g3-mobile-main-loop`; HEAD/upstream `3ebfbe8a33bd484a1e4b15bf83b640a2ddb42e8e`; ahead/behind `0/0`. Only the two expected documentation files were tracked WIP. Workspace and diff checks PASS; existing WIP preserved. Allowed untracked `supabase/.temp/` was not directly read, changed, deleted or staged.
- Changed scope is exactly seven files: the existing collector, private-state verifier, fixture helper and self-test; one narrow `scripts/g5d4-live-read-only-adapters.mjs` transport/projection module; this result and `docs/current-state.md`. The extra module lets the two existing factories share module-owned read adapters without exposing a generic client or creating a provenance framework.
- Both live factories are wired. `createLiveReadOnlyCollector()` retains `collectReadiness({ phase, collectedAt })` / `collectBControl({ collectedAt })`; complete and sealed-manifest requirements still apply at the relevant collection phase. Caller adapters/unknown option overrides are rejected. Self-test entry points remain restricted to self-test provenance. The private verifier now validates typed `recordingState` relationships instead of demanding `recordingContract` / `directStorageBypassUsed` as machine-derived history. The Human procedure keeps those separate requirements.
- Before target reads: exact configured Staging URL, non-Production process/config guards, destructive guard false, live project id/name/region/healthy status, remote exact `0001–0027` and the local migration universe/pending `0`. Mismatches fail closed. Collector environment/migration/git checks complete before fixture reads begin; normal manifest commit/clean-worktree checks remain. There is no force/override or `supabase/.temp/` dependency.
- DB: only fixed, owner-scoped SELECT projections for the exact 18 tables/categories, processing consents, five completed writer kinds, quota state, request/conflict state, durable Provider/Storage targets and their relations. Exact recording owner/script/current canonical pronunciation consent/completed writer/Storage locator and duplicate/orphan/malformed-state checks remain. Sealed durable target identities are reconciled, not accepted from counts alone. SQL is private to the module and UUID inputs are validated; no arbitrary query/RPC API exists.
- The existing service-role SELECT revocation on `voice_asset_write_intents` is unchanged. DB and Storage metadata reads use Supabase's dedicated [read-only query endpoint](https://supabase.com/docs/reference/api/v1-read-only-query), as `supabase_read_only_user`, rather than the unrestricted CLI SQL endpoint or a mutation RPC. Live smoke confirms that role's required writer SELECT permission. No ACL/schema/role change was needed.
- Auth: exact-user GET only, checking identity, email-provider binding, confirmation and unavailable/deleted state. Storage: owner-prefix/DB relations and exact metadata/presence/list reads across the four required private buckets; content download/digest is used only for the existing B fingerprint. A reconciliation does not download audio. Provider: exact ElevenLabs [voice GET](https://elevenlabs.io/docs/api-reference/voices/get) only, with matching cloned-resource identity and required metadata; no list/reuse of B7 or an existing real voice.
- Capability audit: exposed DB `select`; Auth `get`; Storage `read/list/info/download`; Provider `get`; environment and git inspection. Facades are frozen. No SDK/admin client, mutation method, generic RPC or unrestricted SQL endpoint is passed through the collector. The only POST transport target is the fixed read-only SQL endpoint; all other reachable HTTP operations are GET. Provider creation/edit/delete/TTS and Storage upload/remove/move/copy/upsert are absent.
- Credentials follow `.env.local` plus process environment and the installed Supabase CLI default-profile keychain/fallback conventions. `SUPABASE_ACCESS_TOKEN` is optional when that existing profile is available. Missing configuration is reported by variable/config name. Keys/tokens are captured in memory only, never put in argv, logs, manifests or documents. No configuration file was changed.

### Validation and bounded live smoke

Final offline suite: **203/203 PASS**, including existing verified binding **62/62**, immutable snapshot **20/20**, incremental manifests and concurrent consume-once; new Human-Decision/live-reader regressions **38/38**. Tests cover absent/stale/withdrawn consent, owner/script/writer/Storage mismatch, duplicate/malformed state, missing Human checkpoint, direct bypass/Mobile-procedure rejection, live fake-adapter injection, Production/ref/project/region/migration rejection before target reads, read-only capability shape, zero baseline, exact table counts, durable-target substitution, and projection compatibility with canonical DB types. Isolated source-copy reader tests remain synthetic and cannot supply live public capabilities. Private synthetic test directories were cleaned.

`npm run check:workspace`, `npm run lint`, `npm run build` (57/57 static pages), post-build `npm run typecheck`, and `git diff --check`: **PASS**. Final source tests/lint/build/typecheck ran under OS network deny with telemetry disabled. E2E/device/product-flow execution and positive real fixture tests were not run; product behavior did not change.

The initial bounded smoke and two diagnostic repeats stopped at the empty DB projection with HTTP 400: this implementation had incorrectly selected `voice_deletion_operations.anonymized_user_ref`, which does not exist. The projection was corrected without a product/schema change; a canonical-DB-type projection regression was added; all checks above were rerun before the successful smoke. Diagnostic observation forwarded real requests/responses unchanged and emitted only operation/status/schema-column classification, never raw response bodies or fixture evidence.

Final uninstrumented `createLiveReadOnlyAdapters().smoke()` returned **`BOUNDED_STAGING_READ_ONLY_SMOKE_PASS`**:

- Exact `native-minute-staging` / `ztlliqishddrrvqqrrlu` / `ap-northeast-1` / `ACTIVE_HEALTHY`; Production and destructive guards false.
- Remote migrations `0001–0027` exact, local/remote pending `0`.
- Dedicated read-only role and writer-intent SELECT permission PASS; exact 18-table and Storage metadata projections compile and return empty results using literal `WHERE false`, with no fixture-row access.
- Auth settings GET PASS; Storage bucket-list GET confirms `recordings`, `script-audios`, `voice-samples`, `voice-consents` are private. No real-user presence/details or object-content claim is made from these harmless operations.
- Provider factory/configuration ready; **`PROVIDER_LIVE_READINESS_DEFERRED_UNTIL_FIXTURE_EXISTS`**. Real Provider target GET is `0`.

No fixture exists. A/B fixture PASS is **not claimed**, and no live verification receipt/manifest/Human authorization was issued. Existing fixture authority stays A prep-stop `17`, future pre-DB `22`, D/A/R `15/1/6`, B `16`, two processing consents and exact five writer kinds; obsolete `16/21/14/1/6` remains rejected.

Product Web/Mobile routes/services, account-deletion operator/wrapper, migrations/schema/generated DB types, README and environment-file diffs: `0`. Real fixture/account/voice/object/recording/request creation, Provider creation/delete/TTS, Storage mutation/upload, destructive authorization/guard enable, DB/Auth deletion, Completion, Production access/mutation, migration apply and `supabase/.temp/` operations: **all `0`**. External application activity was limited to the bounded Staging read-only smoke/diagnostics above.

Focused implementation assessment `P0/P1/P2/UNKNOWN=0/0/0/0`, **pending independent focused review**, not independent approval. Program remains `0/0/1/0`; known `auth_terminal_authority_missing` P2 is unchanged, nonblocking and deferred. Human prerequisites=`SATISFIED`; destructive Human authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5=`OPEN`. Commit/push=`0/0`; nothing staged.

Exact `NEXT_ONE_ACTION`: `G5D4_RECORDING_ORIGIN_HUMAN_DECISION_AND_LIVE_COLLECTOR_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW`.

## Recording-origin creation-time evidence feasibility — STOP, 2026-09-06

Mode: `G5D4_RECORDING_ORIGIN_PROOF_ONLY_EVIDENCE_MINIMUM_IMPLEMENTATION`.

Accepted authority: `PROOF_ONLY_CREATION_TIME_EVIDENCE_SUFFICIENT`, selecting Web-only `canonical_web` for future G5D4 recording preparation. This establishes what evidence would be sufficient; it does not establish an existing capture mechanism. Durable recording/Storage/writer-intent state alone still cannot prove route origin.

Result: `STOP / PROOF_ONLY_CREATION_TIME_CAPTURE_NOT_IMPLEMENTABLE_WITHOUT_PRODUCT_CHANGE`. **One blocker:** the current canonical Web server execution has no proof-owned creation-time handoff; connecting that execution to private origin issuance requires changing the product route execution boundary, outside this unit. User feasibility/STOP conditions apply before source edits. No origin module, artifact, synthetic-only substitute, caller attestation API or partial integration was implemented.

Preflight: Developer cwd/git root, branch `codex/g3-mobile-main-loop`, HEAD/upstream `3ebfbe8a33bd484a1e4b15bf83b640a2ddb42e8e`, ahead/behind `0/0`, workspace and diff checks PASS. Existing tracked WIP was exactly this result and `docs/current-state.md`, both from the preceding collector STOP; it is preserved below. No source WIP. Only allowed untracked `supabase/.temp/`; no direct read, change, removal or staging of that directory.

Source-backed feasibility evidence:

- `app/api/uploads/recording/route.ts:17`: Next request-owned Supabase client → authenticated user → awaited current `pronunciation_processing` consent check → cost guard → File/schema validation → `uploadOwnedRecording()` → `jsonOk(uploaded, { status: 201 })`. No proof callback, execution capability, run/role/generation context or success event is exposed. Product behavior is unchanged.
- `services/consent/consent.service.ts:213`: the consent assertion returns an active current-contract row or throws. The Web route awaits but does not retain the returned row. The supported claim is that the success path performed its required current consent check before upload; no exact historical consent-row UUID is claimed, and a later consent read cannot establish that historical execution.
- `services/storage/recording-storage.service.ts:216`: Web supplies no `recordingId`, so the service generates the exact owner/script/object key, reserves a `recording_upload` intent, checks Storage upload error, awaits finalization and returns only audio path/key, duration and content type. The reservation and finalization result remain inside the service. `services/voice/voice-asset-write-intent.repository.ts:122` validates exact intent ID/completed status/bucket/key; migration `0023` additionally checks owner/lease/locator. These checks establish persistence relationships, not Web origin. Direct lower-level invocation can create equivalent durable state; it remains forbidden for fixtures and was not executed.
- `lib/supabase/route.ts:8` depends on Next's request-scoped cookies. An isolated proof-script import/call is not a hook into the Human's existing Web request. Connecting a wrapper or loader to the actual Next handler would require new server execution wiring; replacing its request context/dependencies with simulation would only establish self-test provenance. Existing middleware supplies no post-route capture, and `lib/performance/timing.ts` emits labels/durations from `finally`, without exact authority or even success-only semantics. No such runtime patch, alternative recording server, response interception or test backdoor was introduced.
- `scripts/g5d4-proof-private-state.mjs:455` keeps the live reader unarmed; its verifier owns read results, capability creation and immutable snapshots. `scripts/g5d4-fixture-prepare.mjs:119` forwards only expected binding inputs. Neither is invoked by the Web route. Signing a supplied Response/201 body/`web=true` marker or later persisted-state projection would protect that assertion's integrity without proving its origin. Existing run-key, private permissions, generation freshness, consume-once and live/self-test separation remain unchanged.

Issuance, exact recording/owner/script/run/role/generation binding, event-window capture, creation-time writer/Storage reconciliation and origin replay/substitution tests: **NOT IMPLEMENTED / NOT RUN** after feasibility STOP. The requested 18 new origin cases are not represented as passing by existing synthetic reader tests. No origin evidence is issued. Fixture-helper integration is unchanged; no direct-upload bypass or weaker verified binding was added. Future collector acceptance still requires persisted state plus trusted private creation-time Web evidence before deriving `canonical_web` and no direct bypass. Both live factories remain `UNARMED`; arming and independent origin implementation review are premature.

Validation of the unchanged code baseline: full `npm run g5d4:proof-tooling:self-test` **165/165 PASS**, including verified binding **62/62**, immutable snapshot **20/20**, incremental manifest and concurrent consume-once. A `17 → 22`, D/A/R `15/1/6`, B `16`, two processing consents, five writer kinds, obsolete-contract rejection, fixture bypass prohibition and live/self-test regressions PASS within that suite; focused suites were not redundantly rerun separately. `npm run check:workspace`, `npm run lint`, `npm run build` (57/57 static pages), post-build `npm run typecheck` and `git diff --check`: PASS. Execution checks ran with OS network deny and telemetry disabled; synthetic private-temp cleanup PASS. Final git state retains the expected HEAD/upstream and `0/0`, only the two documentation modifications and allowed untracked directory, with nothing staged. New origin tests, live route proof, product bridge suites, E2E and device checks were not run after feasibility STOP.

This unit changes only these two documentation files. Product Web/Mobile routes/services, proof tooling/receipt/manifest/helper/collector implementation, account-deletion operator/wrapper, environment configuration, README, migrations/schema/generated DB types: unchanged. Real network, Canonical Staging fixture/recording/Auth/request creation, ElevenLabs/Storage operations, Production access, migration apply, destructive authorization/guard enable/account deletion execution and commit/push: all `0`. No raw authority or credentials are added to documentation.

No new product consent defect or security finding was identified. Accepted focused `P0/P1/P2/UNKNOWN=0/0/0/0` and program `0/0/1/0` remain inherited authority, not a new capture implementation PASS; known Auth P2 remains deferred. Proof readiness remains blocked. Human prerequisites=`SATISFIED`; destructive Human authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; G5D-2/Gate 5=`OPEN`. Any future implementation still requires independent focused review.

Exact `NEXT_ONE_ACTION`: `G5D4_RECORDING_ORIGIN_SERVER_OWNED_CAPTURE_BOUNDARY_SCOPE_RECONCILIATION` — resolve the minimum permitted server-side connection to the canonical Web success execution before implementation can resume; no product change or live action is authorized by this result.

## Live read-only collector arming — STOP, 2026-09-06

Mode: `G5D4_LIVE_READ_ONLY_COLLECTOR_MINIMUM_ARMING`.

Result: `STOP / RECORDING_ORIGIN_AUTHORITY_MISSING`. Both live factories remain `UNARMED`; no armed or independent-review-ready status is claimed. This is a concrete new arming blocker, not a reopening or reversal of the accepted immutable-snapshot correction below.

Preflight matched Developer cwd/git root, branch `codex/g3-mobile-main-loop`, HEAD/upstream `3ebfbe8a33bd484a1e4b15bf83b640a2ddb42e8e`, ahead/behind `0/0`, tracked clean, and only allowed untracked `supabase/.temp/`. Workspace and initial diff checks passed. The temp directory was not manually read, changed, removed or staged.

Live CLI project-list evidence matched exactly one Canonical Staging project: `native-minute-staging`, ref `ztlliqishddrrvqqrrlu`, region `ap-northeast-1`, status `ACTIVE_HEALTHY`. Other project data and raw CLI output were suppressed. Local configuration resolved to the exact Canonical Staging URL; only presence was inspected for `SUPABASE_SERVICE_ROLE_KEY` and `ELEVENLABS_API_KEY`. No credential value was emitted, put in argv, or persisted. Migration authority remains the accepted `0001–0027 exact / pending 0`; remote migration history was **not reread** in this stopped unit. No live environment/migration/git gate was implemented.

### Exact blocker and source evidence

- `scripts/g5d4-proof-private-state.mjs`, `inspectFixtureBinding()` requires `readStorageBinding()` to return `recordingContract=consent_gated_web|consent_gated_mobile` and `directStorageBypassUsed=false`. `verifyLiveFixtureAuthority()` accepts no caller observation/reader override; `bindVerifiedFixturePreparationAuthority()` only forwards the binding. The separate Human checkpoint observations do not supply this reader authority.
- `app/api/uploads/recording/route.ts` and `lib/mobile/recordings-route.ts` check pronunciation-processing consent before calling `uploadOwnedRecording()`. This establishes normal route behavior, but not the history of an arbitrary persisted object.
- `services/storage/recording-storage.service.ts`, `uploadOwnedRecording()` persists a `recording_upload` reservation, object and completed intent without a route-origin or route-consent attestation. Its direct invocation is explicitly a forbidden G5D4 fixture path in `scripts/g5d4-fixture-prepare.mjs`, yet yields the same kinds of persisted evidence as the normal route.
- The writer-intent table in migration `0019` and its recording reservation/finalization definitions in migration `0023` retain owner/script/bucket/object/status/time fields. The recording reservation checks ownership, locator shape and deletion/writer fences; finalization checks the exact reservation/lease/locator and marks it completed. Neither records Web/Mobile route origin or the route's pronunciation-consent check. No later migration through `0027` adds that provenance.

Therefore DB relations, current consent, completed intent and Storage presence/content cannot by themselves distinguish an allowed route-created recording from the expressly forbidden direct-service path. Assigning the required values from those reads would attest an unobserved fact. This is a source-backed inference; no bypass was executed against any live or local database. A current consent row also does not prove the route consent check occurred when the object was created.

User STOP conditions 12/24 apply: making the full existing verified-binding contract usable would require a trusted evidence source beyond the identified persisted reads, or changes to product persistence/the accepted evidence contract. No such change, caller assertion, hardcoded success, new receipt design, or partial arming was introduced. Determining the minimum acceptable evidence authority is the next bounded reconciliation; no solution is preauthorized by this document.

### Reader/validation boundary

- Existing collector interfaces remain DB `select`, Auth `get`, Storage `read/list/info/download`, Provider `get`, environment inspection and git inspection. A/B `17 -> 22`, D/A/R `15/1/6`, B `16`, 18 tables, two processing consents, five writer kinds and all four buckets are unchanged.
- DB/Auth/Storage live adapters were not constructed or smoked. No target-data reads, DB RPCs or mutations were used to investigate the blocker. The service-role SELECT revocation on `voice_asset_write_intents` in `0019` also means a simple service-role PostgREST projection must not be assumed sufficient; an alternative read transport was not implemented or validated after STOP.
- Existing ElevenLabs `reconcileVoiceAbsence()` provides an exact-resource GET/presence operation, but its full collector snapshot mapping and narrow facade were not implemented or validated. Provider credential presence is not live readiness. No Provider request or existing voice reuse occurred. `PROVIDER_LIVE_READINESS_DEFERRED_UNTIL_FIXTURE_EXISTS`; this does not claim that an armed factory exists.
- Existing self-test/live provenance, immutable snapshots, receipt freshness, incremental manifests, fixture completion/seal, authorization and wrapper code are unchanged. No live mutation capability was added; the existing live paths still fail closed.
- Existing full fake-only self-test: **165/165 PASS**, including verified-binding **62/62**, immutable-snapshot **20/20** and concurrent consume-once. It ran under OS network deny with telemetry disabled. These are regression results for the unchanged unarmed implementation, not live-reader acceptance tests. No new focused live-reader suite was added because implementation stopped.
- `npm run lint`, `npm run typecheck`, `npm run build`: PASS under OS network deny with telemetry disabled; build completed all 57 static pages. Workspace and `git diff --check`: PASS. These checks validate the unchanged runtime baseline and the documentation-only diff. Bounded live DB/Auth/Storage smoke was not reached because arming stopped before implementation. The effective local destructive guard was checked disabled; no production guard or live collector gate was constructed.

Changed files: this result and `docs/current-state.md` only. Product API/UI/service/provider implementation, account-deletion operator/wrapper, migration/schema/generated types, configuration and README changes: `0`. Production data-plane access, live DB/Auth/Storage/Provider target access, fixture/user/voice/object/script/recording/request creation, destructive guard enable, Human destructive authorization, Provider/Storage/Auth DELETE, DB mutation/finalizer, Completion and account-deletion execution: all `0`. Commit/push: `0/0`.

Accepted security finding authority remains focused `P0/P1/P2/UNKNOWN=0/0/0/0`, program `0/0/1/0`; known `auth_terminal_authority_missing` P2 is unchanged and deferred. These inherited counts are not a fresh armed-collector PASS. Arming readiness is separately `BLOCKED` by the confirmed evidence-source gap above; no new exploitable vulnerability is asserted while live readers remain unarmed.

Human prerequisites: `SATISFIED`. Destructive Human authorization: `NOT GRANTED`. G5D4: `NOT AUTHORIZED / NOT STARTED`. G5D-2/Gate 5: `OPEN`.

Exact `NEXT_ONE_ACTION`: `G5D4_RECORDING_ORIGIN_EVIDENCE_AUTHORITY_READ_ONLY_RECONCILIATION` — identify an existing trusted, exact-object source for the required recording-origin evidence, or report the minimum out-of-scope change needed, preserving the closed receipt/provenance contracts. Do not create fixtures or start destructive proof. The success-path independent collector review remains premature.

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
