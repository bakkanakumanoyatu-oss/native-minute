# G5D-4 proof-only tooling result

## Provider/seal server-only runtime condition — 2026-09-13

MODE: `G5D4_PROVIDER_SEAL_SERVER_ONLY_RUNTIME_CONDITION_PROOF_ONLY_MINIMUM_CORRECTION`.

Result candidate: `G5D4_PROVIDER_SEAL_SERVER_ONLY_RUNTIME_CONDITION_CORRECTED_PENDING_FOCUSED_RE_REVIEW`. **Accepted CASE 1: proof launcher runtime-condition gap; the new focused P1 remains OPEN until independent review.** Preflight: Developer cwd/git root, branch `codex/g3-mobile-main-loop`, HEAD/local upstream `d0bc2e6756fc33fe9a879ce3d41acbae933fa170`, ahead/behind `0/0`, clean tracked/staged tree, workspace/diff check PASS. Allowed `.env.local.save` and `supabase/.temp/` were not read, hashed, changed or staged.

Accepted prior evidence: FD transport passed and the proof operator entry was reached, but importing the Provider bridge failed in `providers/voice-deletion/elevenlabs.ts:1` at `server-only/index.js`, before the canonical runner. Authorization was consumed and is NOT REUSABLE; seal/delete/target counts were 0 and A/B unchanged. These are historical facts, not fresh live observations in this unit. The FD correction is CLOSED / COMMITTED / PASS; the older section below records its implementation-time status.

Installed `server-only@0.0.1` selects throwing `index.js` by default and empty `empty.js` for `react-server`. The existing canonical operator npm command already sets this condition. Neither old tsx CLI nor direct Node supplied it automatically: the FD correction exposed the missing condition rather than removing it. The Provider handles the API key and deletion requests, so its marker remains correct and unchanged.

**Runtime diff: one child argv flag only**, `process.execPath --conditions=react-server --import tsx ...`. Wrapper path/cwd, FD 3, `O_RDONLY | O_NOFOLLOW`, capsule/HMAC, child-only guard, consume-before-dispatch, shell=false, retry=0 and chaining=0 are unchanged. Authorization contents are not placed in argv/env/stdin. Product/Provider/canonical operator/Storage/Database/Auth/Completion/schema/migrations/generated types are unchanged.

The existing FD self-test now checks actual launcher arguments and adds three cases: conditioned Provider + bridge import under OS network denial, the same marker failure with that condition removed, and write-only FD refusal. The real-entry negative test locates its wrapper argument by value after the added flag. No generic runtime framework or live injection seam was added; existing suite integration is reused.

On installed **Node v25.8.1 / tsx 4.23.13**, focused **21/21 PASS** (18 existing + 3 new). The conditioned child imports the actual TypeScript Provider/bridge modules without constructing adapters or executing a runner; `server-only` resolves to `empty.js` with `react-server` observed in the resolver conditions. A disposable typed fixture also imports. Dummy FD 3 device/inode/payload hash match the parent and writes reject with `EBADF`; cwd is the Developer root. Credentials and real guards are stripped before OS spawn. Validation-source guards exist only in an isolated VM with synthetic self-test authority and stop before live git/env/operator entry. No test result claims a guarded live execution.

OS network denial applies to all validation commands and both import-test children. A loopback connection probe is denied with `EPERM`; imports make zero fetch calls. All required negative categories PASS: condition absent, absent/wrong/closed/write-only FD, malformed capsule, binding/MAC substitution, consume-once/reuse, argv/env/stdin injection, self-test-to-live refusal and consumption retained after actual spawn failure. Existing proof tooling **305/305 PASS**, standalone invocation/Auth/B-control **158/158 PASS**, integrated Node test portion **179/179 PASS**.

Workspace/lint/initial typecheck/build (**57/57** static pages)/post-build typecheck/final diff review: **PASS**. Next telemetry is disabled. E2E/device/live readiness/independent review are not run. Ship-check review confirms no new environment variables, schema/migrations, DB types or user-facing flow changes; README setup remains applicable.

Real Human authorization/consume/guard enable/live operator/canonical runner/Provider target/seal/delete/Storage/DB/Auth/Completion mutation/Production access/migration apply/stage/commit/push are all **0**. Only disposable synthetic self-test state is created/consumed and cleaned up; no old private evidence is modified. Focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program `0/1/1/0`, known deferred Auth P2 unchanged. Destructive authorization=`NOT GRANTED`, G5D4=`INCOMPLETE_STOP`, Gate 5=`OPEN`.

Exact `NEXT_ONE_ACTION`: `G5D4_PROVIDER_SEAL_SERVER_ONLY_RUNTIME_CONDITION_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`. No fresh authorization or seal retry is requested or performed.

## Provider/seal authorization FD transport — 2026-09-13

MODE: `G5D4_PROVIDER_SEAL_AUTHORIZATION_CHILD_PROCESS_FD_TRANSPORT_PROOF_ONLY_MINIMUM_CORRECTION`.

Result candidate: `G5D4_PROVIDER_SEAL_AUTHORIZATION_CHILD_PROCESS_FD_TRANSPORT_CORRECTED_PENDING_FOCUSED_RE_REVIEW`. **Accepted CASE 2: proof-tooling transport bug; focused P1 remains OPEN until independent review.** Preflight: Developer cwd/git root, branch `codex/g3-mobile-main-loop`, HEAD/local upstream `5fbfcb06eddf3bd2252e6d6d79b79525d6f7604d`, ahead/behind `0/0`, workspace PASS, no fetch. Existing untracked `.env.local.save` and `supabase/.temp/` are untouched.

The prior Provider/seal attempt failed at child `readFileSync(3, "utf8")` with `read / ENXIO` before canonical operator entry. The accepted reconciliation establishes that repo, parent/child cwd and private paths were correct; early cleanup was not the cause. Authorization was already consumed and remains permanently non-reusable. Prior operator/seal RPC/Provider delete/target counts were 0, A voice present and B unchanged. These are saved historical evidence, not a new live observation.

The runtime diff changes only `launchCanonicalOperatorChild`: `tsx CLI -> internal Node respawn` becomes `process.execPath --import tsx -> wrapper` in the final Node process. The CLI respawn dropped FD 3; direct Node preserves `stdio[3]`. Absolute wrapper path, Developer cwd, `O_RDONLY | O_NOFOLLOW`, private capsule/HMAC contract, FD lifetime, child-only guard, shell=false, retry=0 and chaining=0 remain unchanged. Authorization content/private paths are not added to argv, env, stdin or public output. Ordering remains `consume -> capsule publish/open -> spawn -> child read -> operator`; neither spawn nor transport failure rolls consumption back.

New `scripts/g5d4-fd-transport-self-test.mjs` is included in the existing proof-suite command. On installed **Node v25.8.1 / tsx 4.23.13**, real OS spawn preserves the dummy private file as FD 3, reads/parses it, verifies its synthetic bindings, reports the Developer cwd and imports a disposable typed `.ts` module. The installed CLI's source-isolated respawn still loses the same payload's FD and reproduces **ENXIO**; the corrected launcher reads it successfully.

Test boundary: the current launcher body uses real spawn/open/close with a test entry; its real guard flags are removed before OS spawn. The child runs the actual read/parse and pre-operator validation source in an isolated VM with a synthetic process object and self-test provenance. It stops before git/env loading, child-start publication or operator import. The unmodified real wrapper entry is separately spawned with guards OFF and rejects. This is transport and isolated authorization regression evidence, **not a guarded live operator execution**. No live injection seam or generic transport framework was added.

Focused **18/18 PASS** covers valid/absent/wrong/closed FD, malformed capsule, separately re-signed binding substitution, bad capsule MAC, re-signed authorization binding substitution, unsafe file permissions, symlink refusal, consumed/reused authorization, argv/env/stdin injection, self-test-to-live refusal, real-entry guard refusal, current-core consume-before-actual-spawn-failure and permanent retry rejection, and old/new spawn comparison. Existing proof suite **305/305** and invocation/Auth/B-control **158/158 PASS**; combined Node test-runner portion **176/176 PASS**. An initial test-only failure came from omitting `TMPDIR` in the sanitized child environment; retaining the parent's nonsecret temp root restored existing containment checks without changing production validation.

All tests run under OS network denial. Workspace/lint/initial typecheck/build (**57/57** static pages)/post-build typecheck/final `git diff --check`: **PASS**. Next telemetry is disabled. E2E/device/live readiness/independent review are not run in this unit.

Product/canonical operator/Provider adapter/seal/delete/Storage/Database/Auth/Completion/schema/migrations/generated types are unchanged. Old failed-launch private evidence is read-only; no old authorization is reused. Real authorization/guard/operator/Provider target/seal/delete/live access or mutation/User A/B change/Production access/migration apply/stage/commit/push are all **0**. Only disposable synthetic self-test state is created/consumed and cleaned up.

Focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program `0/1/1/0` with the known deferred Auth P2 unchanged. Human prerequisites=`SATISFIED` (retained authority), previous authorization=`CONSUMED / NOT REUSABLE`, destructive authorization=`NOT GRANTED`, G5D4=`INCOMPLETE_STOP`, Gate 5=`OPEN`.

Exact `NEXT_ONE_ACTION`: `G5D4_PROVIDER_SEAL_AUTHORIZATION_CHILD_PROCESS_FD_TRANSPORT_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`. No fresh authorization or seal retry is requested or performed here.

## Recording checkpoint identity / freshness separation B — 2026-09-12

MODE: `G5D4_RECORDING_CHECKPOINT_IDENTITY_FRESHNESS_SEPARATION_B_MINIMUM_CORRECTION_V1`.

Result candidate: `G5D4_RECORDING_CHECKPOINT_IDENTITY_FRESHNESS_SEPARATION_B_CORRECTED_PENDING_FOCUSED_RE_REVIEW`. **Accepted CASE 2: proof-only sequencing overconstraint.** Current checkpoint owner binding must not require a second zero baseline after normal product fixture creation. This is not a product Auth/recording/deletion defect. Self-verification does not independently close the P1.

Preflight: Developer cwd/git root; branch `codex/g3-mobile-main-loop`; HEAD/local upstream `5909987f378397dbc7903436afd6ed3a68e8ddd1`, ahead/behind `0/0`, no fetch, initially clean tracked tree. Existing untracked `.env.local.save` and `supabase/.temp/` were not opened, changed or staged. No old private run/key/baseline/checkpoint was opened or modified. The prior Auth optional-ban correction is part of this base; its accepted semantics are reused unchanged.

**Current B facts are supplied Human authority, not newly collected live evidence:** historical fresh baseline PASS (role B, Canonical Staging, profile 1, other target tables/Storage/Provider voice 0, capture before fixture creation, valid HMAC, 0600 file / 0700 directory). Current exact Auth identity, consent-gated voice/script/reference audio/Web recording/evaluation/Review and machine reconciliation PASS; Take 1, weak_words 4, coach feedback 1. Real Human recording checkpoint remains **NOT ISSUED** and real fixture recording acceptance **NOT COMPLETED**.

- **Fresh-fixture authority:** existing `verifyLiveFixtureAuthority` identity verification and `bindVerifiedLiveFixtureAuthority` retain `fresh_zero_baseline`. Their current Auth/profile/exact 17-table-zero/empty Storage path is unchanged. A current nonzero B still rejects. No saved baseline JSON import, historical freshness promotion, or proof migration is added.
- **Current checkpoint identity:** new `verifyLiveCurrentRecordingIdentity` issues an opaque, module-owned immutable `current_recording_identity_v1` capability from the existing Canonical Staging/migration gate and exact confirmed Auth GET. It reuses the accepted strict HTTP 200 and optional `banned_until` projection. Active ban, absent/unknown, malformed/unconfirmed/mismatched or ambiguous Auth rejects. No fixture-table/Storage/Provider zero-baseline read occurs. Scope is current owner/role/run identity only; it attests neither historical freshness, product consent, recording origin nor destructive authorization.
- **Binding/separation:** `bindVerifiedLiveRecordingCheckpointIdentity` binds that capability to the existing preparing manifest identity slot, recording its distinct state in the HMAC verification. Fresh and current identity binders reject each other's capabilities. Exact role/user/run-directory/generation/digest and live/self-test provenance remain checked. Caller booleans, copied/re-signed JSON, saved baseline JSON and extra evidence/reader arguments cannot mint or bind authority. A consumed capability cannot bind again. A current-only owner can bind only a recording, not Provider/other Storage/request authority; it cannot satisfy fresh-login preparation, fixture completion, seal or historical-manifest authorization. Schema and chain rereads enforce the distinction as well as the public binders.
- **B resume path after review:** use a preparing checkpoint run with B's identity slot unbound; call `bindCurrentRecordingCheckpointIdentity(runDirectory, {kind: "identity", fixtureRole: "fixture_b", userId})`, then the existing `bindVerifiedFixturePreparationAuthority` for B's exact `recordings` target. That helper performs current machine consent/owner/script/completed-writer/Storage reconciliation, actual TTY Human confirmation and recording acceptance. These are descriptions of the later path, **not live operations performed here**. Historical freshness stays in its existing private evidence; this checkpoint manifest claims no freshness and cannot become a fresh-fixture complete/sealed manifest. No fresh-baseline import or old-run modification is needed for recording acceptance.
- **Human integration and time:** Auth verification time starts before the read. Issuance/bind and pre/post-TTY/final recording bind enforce the existing five-minute checkpoint bound for current identity, independently of machine receipt age. The Human checkpoint still binds exact run/role/recording/owner/script, machine digest and manifest generation, and retains its existing TTY phrase, provenance and consume-once rules. Accepted evidence retains the historical identity-to-machine-to-Human timing relation on chain reread; reading it later does not require the original identity capability to remain current. Self-test current identities and synthetic confirmations remain self-test only.

Offline validation: **54/54 new identity-separation regressions PASS**; historical proof suite now **305/305 PASS** (existing **251/251**, including recording checkpoint **48/48**, verified binding **62/62**, immutable snapshot **20/20**, Human-decision/readers **38/38**). Invocation/Auth/B-control suite **158/158 PASS** (existing **135/135**, including **70** accepted B-control regressions; **23** new current-identity Auth transport cases). All required 14 negative categories are covered: wrong user/role/run/recording/owner/script, self-test-to-live, unknown Auth, stale issuance/bind, consume-once, current-to-fresh misuse, current nonzero fresh refusal, caller booleans/JSON and saved baseline injection. Synthetic nonzero B resumes through exact current identity plus machine reconciliation plus source-isolated TTY confirmation; the separate public self-test path also accepts a synthetic checkpoint with self-test provenance. Tests additionally isolate identity expiry while machine/Human receipts remain fresh, expiry during the prompt, in-flight generation changes, and preservation of historical baseline bytes/modes. Source-isolated receipts cannot enter the actual live module.

Workspace, lint, initial typecheck, build (**57/57** static pages), post-build typecheck and final `git diff --check`: **PASS**. Test/application commands use OS network denial; Next telemetry is disabled for application checks. The initial focused attempt found a test assertion using a nonexistent permissions-result `.pass` field; it was corrected to the actual validated directory-mode result. All final tests pass. No E2E/device tests, separate five-stage bridge rerun, live readiness verification or independent review was run in this correction.

Changed files: `scripts/g5d4-proof-private-state.mjs`, `scripts/g5d4-proof-contract.mjs`, `scripts/g5d4-live-read-only-adapters.mjs`, `scripts/g5d4-fixture-prepare.mjs`, `scripts/g5d4-proof-tooling-self-test.mjs`, `scripts/g5d4-invocation-evidence-self-test.mjs`, this document and `docs/current-state.md`. Product UI/API/Auth service/recording/evaluation/deletion/Provider/Storage/Database code, product schema/migrations/generated types, package scripts and README are unchanged. No new env/setup requirements. B-control material comparison, weak_words 0–4, actual-state rebaseline, Database CASE 1 / canonical CLOSED, present/absent/unknown, destructive authorization binding, consume-once and no retry/chaining are preserved.

Live access, User B changes, re-recording/re-evaluation/new voice/script change, Provider/Storage/DB/Auth mutation, actual TTY Human checkpoint, actual fixture recording acceptance, deletion request, destructive authorization/guard/execution and old private evidence changes are all **0**. Stage/commit/push=`0/0/0`.

Focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program `0/1/1/0`. The sequencing P1 remains **OPEN pending independent focused re-review**; known Auth P2 `auth_terminal_authority_missing` remains unchanged/nonblocking deferred. Human Decision=`ACCEPTED`, Human prerequisites=`SATISFIED`; destructive authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; Gate 5=`OPEN`.

Exact `NEXT_ONE_ACTION`: `G5D4_RECORDING_CHECKPOINT_IDENTITY_FRESHNESS_SEPARATION_B_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`.

## Auth optional `banned_until` semantics — 2026-09-12

MODE: `G5D4_AUTH_BANNED_UNTIL_OPTIONAL_FIELD_SEMANTICS_MINIMUM_CORRECTION_V1`.

Result candidate: `G5D4_AUTH_BANNED_UNTIL_OPTIONAL_FIELD_SEMANTICS_CORRECTED_PENDING_FOCUSED_RE_REVIEW`. Base HEAD/upstream `b0a43f5cbe387841f7abed97b25acd6ca44b2aca` is the accepted, committed evidence rebaseline. Its prior independent PASS and closed material-state omission finding remain historical authority. This correction is not independently closed.

The subsequent User B preparation observed HTTP 200 with exact confirmed Auth identity but no `banned_until` property. The collector's assumption that omission always means unknown stopped preparation. This is a proof-only response-semantics issue, not a product Auth/deletion finding. Accept the supplied Supabase optional/`omitempty` semantics; the installed Auth SDK also declares `banned_until?: string`. No live response was fetched in this correction.

- Only a parsed HTTP **200** Auth user with the existing exact user/identity, single email identity, valid contact and confirmation checks may normalize absent `banned_until` to canonical `bannedUntil: null`. Explicit null is equivalent. A present invalid value, including explicit undefined in synthetic input, still rejects. Existing UTC/offset/fractional timestamp normalization is unchanged.
- Auth non-200 success codes now fail closed as unexpected responses; network/timeout/401/403, malformed JSON/body, mismatched or ambiguous identity remain unknown. Existing strict canonical not-found observation remains absent, which cannot satisfy B's required presence. Provider projection, wrapper, comparator, HMAC and authorization code are unchanged.
- Absent/null-to-ban, ban-to-absent/null and changed timestamps still change canonical evidence/digest and reject before dispatch or during immediate post verification. Absent/null representation changes preserve the digest and approved snapshot; unchanged B plus expected A change still passes.

Offline verification: the expanded invocation suite is **135/135 PASS**, including **70 B-control tests** (22 additions; the obsolete missing-ban rejection is replaced by explicit-undefined rejection). Five omission cases failed before the source fix. Coverage includes optional/null equivalence, actual ban drift, authorization invalidation, malformed/ambiguous responses, unexpected HTTP statuses and prior Provider material-state regressions. All test/application commands run with OS network denial; Next telemetry is disabled for application checks. Workspace, lint, initial typecheck, build (**57/57** static pages), post-build typecheck and final diff check **PASS**. Existing 251-test historical suite, five-stage bridge, E2E and live readiness are not rerun by this correction.

Only `g5d4-live-read-only-adapters.mjs`, its invocation self-test and these two status documents change. Product Auth/API/UI, schema/migrations/types, deletion product code, Provider/Storage/Database product code and canonical operator are unchanged. User B's existing voice is retained; script/recording preparation remains paused. Live access/mutation, actual authorization/guard/deletion, old private run changes, stage/commit/push are **0**. Human prerequisites=`SATISFIED`; destructive authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; Gate 5=`OPEN`. Known Auth P2 `auth_terminal_authority_missing` remains nonblocking deferred.

Exact `NEXT_ONE_ACTION`: `G5D4_AUTH_BANNED_UNTIL_OPTIONAL_FIELD_SEMANTICS_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`.

## B-control observability P1 minimum correction — 2026-09-12

MODE: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_B_CONTROL_P1_MINIMUM_CORRECTION`.

Result candidate: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_B_CONTROL_P1_CORRECTED_PENDING_FOCUSED_RE_REVIEW`. The supplied independent review was **NOT PASS**: B Auth `banned_until` and Provider voice name/settings were omitted from the collected state, allowing material drift to produce `PASS / bUnchanged=true / invocationCount=1`. Accept this sole focused P1. There was no finding in product deletion logic. Proof simplification / CASE 1 / Database canonical **CLOSED** remain accepted; no broad reaudit or history rewrite.

Preflight: Developer cwd/git root; branch `codex/g3-mobile-main-loop`; HEAD/local upstream `8814953f1bd8424c4c8600e8b9b627a5416658f3`, ahead/behind `0/0`, no fetch. The pre-existing proof rebaseline source/docs WIP and untracked invocation modules were preserved. `.env.local.save`, `supabase/.temp/` and old private runs were not opened or changed. This correction adds changes only to `scripts/g5d4-live-read-only-adapters.mjs`, `scripts/g5d4-authorized-step-wrapper.mjs`, `scripts/g5d4-invocation-evidence-self-test.mjs`, this document and `docs/current-state.md`.

- **Auth B projection:** retain exact user/existence, contact, email identity/provider and confirmation; add `bannedUntil` from explicit `banned_until` null or timestamp. Timestamp normalization uses UTC and canonical fractional seconds, preserving submillisecond precision; equivalent offsets/trailing zeroes compare equally. No current-time boolean replaces the actual ban deadline. Missing, invalid or timezone-less status is `unknown`, never assumed unbanned.
- **Provider B projection:** retain exact voice/existence, cloned category and creation identity; add exact `name` and the five speech settings already identified by the local Provider contract: `stability`, `similarity_boost`, `style`, `speed`, `use_speaker_boost`. Validate numeric/boolean shapes, strip unrelated keys and use the existing recursive canonical JSON comparison. Null/missing/partial settings or malformed name are `unknown`; no default settings are invented. The existing unavailable/verification-required rejection remains. No new endpoint or product adapter is introduced.
- **Private evidence / safe digest:** only these selected material fields enter the private snapshot. The existing canonical HMAC digest and safe alias/count summary bind them without exposing contact, voice name, settings or raw responses. No blind hash of Auth/Provider responses. Sign-in/update/request/pagination/workspace metadata is excluded. A's existing projection and DB/Storage comparisons are preserved.
- **B aggregate:** existing full `after.b` versus `snapshot.actual.b` comparison still covers DB, Storage, Auth and Provider. Material drift or unknown stops proof acceptance. Wrapper rejection now explicitly returns `bUnchanged=false` (unchanged was not established; this does not claim every rejected run observed a change). Only successful reconciliation returns true. Expected A deletion with unchanged B still passes B control and stops after one invocation.
- **Authorization:** fresh B drift after fake authorization is rejected before dispatch (`invocationCount=0`); changing either material projection changes the snapshot HMAC. Live/self-test isolation, consume-once, exact source/environment/migrations, bounded invocation, immediate verification and no retry/chaining semantics are unchanged. No real Human authorization was generated.

Offline verification: **48/48 new B-control regressions PASS**, plus existing **251/251** and prior invocation **65/65** (combined invocation **113/113**). New cases exercise the real source-isolated transport projection through private snapshots and the wrapper: all three ban transitions, submillisecond change, name and every selected setting, same-state/offset/key-order equivalence, irrelevant metadata exclusion, snapshot digest and pre-dispatch rejection, safe summary redaction, and network/permission/malformed/ambiguous/unknown rejection. Existing 65 retain Production/ref/migration fail-close, self-test/live separation, consume-once, actual-row and five-stage evidence coverage. Unchanged Provider, Storage, Database, Auth and Completion canonical bridge behavioral suites **PASS**. All tests and application checks use OS network denial; Next telemetry is disabled. `npm run check:workspace`, `npm run lint`, initial `npm run typecheck`, `npm run build` (**57/57** static pages), post-build `npm run typecheck` and `git diff --check`: **PASS**.

No product UI/API/Auth service/Provider adapter/deletion service/repository/canonical operator/Database RPC/schema/migration/generated type/Storage product code/deletion semantics/package/README change. Live collector/SQL/Provider/Storage/Auth execution and live readiness verification were **not run**; missing material fields intentionally block future collection. E2E/device tests and independent re-review were not run. Staging mutation, User A changes, User B creation, Provider/Storage/DB/Auth mutation, deletion request/target creation, destructive authorization/guard enable/execution, Production access, migration apply, old private run changes and network mutation are all **0**. Stage/commit/push=`0/0/0`.

P1 remains **OPEN pending independent focused re-review**. Focused `P0/P1/P2/UNKNOWN=0/1/0/0`; program `0/1/1/0`, with known Auth P2 `auth_terminal_authority_missing` unchanged. Accepted Human prerequisites/Decision remain satisfied; destructive authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; Gate 5=`OPEN`.

Exact `NEXT_ONE_ACTION`: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_B_CONTROL_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW`.

## Actual-state invocation evidence rebaseline — implementation candidate, 2026-09-12

MODE: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_PROOF_ONLY_MINIMUM_IMPLEMENTATION`.

Result: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_PROOF_ONLY_CORRECTED_PENDING_INDEPENDENT_FOCUSED_REVIEW`. Self-verification is not closeout or destructive authorization.

**Authority reconciliation:** accept the supplied read-only reconciliation `CASE 1 — NO PRODUCT GAP`. The earlier assertion that the Database RPC must receive the pre-snapshot exact row set/digest was an overconstraint and is withdrawn. The previous STOP actually happened and remains documented below; it is not a current product blocker. Database canonical stays **CLOSED**. Its transaction owns current inventory under the existing request/user/inventory-version contract. Proof snapshots bind Human authorization and evidence; they are not RPC deletion target lists.

### Preflight and exact scope

Developer root, branch `codex/g3-mobile-main-loop`, HEAD/local upstream `8814953f1bd8424c4c8600e8b9b627a5416658f3`, ahead/behind `0/0`; no fetch. The two existing docs WIP were preserved. `.env.local.save` and `supabase/.temp/` were not read, changed, deleted or staged. No old private run/generation/key/checkpoint was opened or migrated. Current A facts (including four weak words and the observed 19 product rows) are Human-supplied authority from the request, not new live observations in this unit. B remains uncreated.

Changed proof source: existing `g5d4-read-only-evidence-collector.mjs`, `g5d4-live-read-only-adapters.mjs`, `g5d4-proof-private-state.mjs`, `g5d4-authorized-step-wrapper.mjs`, `g5d4-proof-tooling-self-test.mjs`; new `g5d4-invocation-evidence.mjs`, `g5d4-invocation-operator.mjs`, `g5d4-invocation-evidence-self-test.mjs`. Documentation changes are this file and `docs/current-state.md`. New modules separate actual-state checks, bounded canonical invocation guards, and fake regression fixtures. No product/service/repository/operator-entry/provider implementation, schema, migration, generated type, UI/API, package script or README changes.

### Current proof-only path

- `createInvocationPrivateRun(context)` creates a new 0700 OS-temp context/key, independent of historical manifests. Raw A/B, Provider/Storage locators and an already-existing exact request/ref remain private. It does not create accounts, fixtures or deletion requests. No old manifest completeness, seal or commit equality is consulted.
- `collectLiveInvocationSnapshot(runDirectory, spec)` uses only module-owned read-only transports. It inspects exact Canonical Staging, remote/local `0001–0027`, pending zero, guards, source commit and clean source before target reads; rechecks the inspection after collection. Caller transport/time/source/provenance injection is not accepted. Untracked source also prevents clean-source authority; the two known non-source untracked locations remain allowed.
- Snapshot v1 contains context, exact request, stage/action/target/maxCalls, actual A/B DB row sets and relations, Storage metadata/identity, Provider and Auth state, environment/migration/git inspection, timestamp and HMAC digest. It is privately published without overwrite. The safe summary contains only aliases, counts, stage/action, timestamp, commit and digest. Empty successful DB row sets are known empty evidence; failed queries are unknown, never invented zero rows.
- Each owned Take has an exact weak-word row set with 0–4 members. Duplicate IDs, wrong owner, wrong Take/script/voice/consent/request relations and substitution fail closed. Per-resource product relations, active canonical processing consents and the five completed writer kinds remain checked. No total-row acceptance equation or A/B weak-word equality/minimum is used. Old A17/B16/A22/D15/A1/R6 tests and helpers remain historical; the live launcher rejects old manifest capsules/inputs.
- Provider/Auth only accept their strict canonical not-found response as `absent`; generic 404, permission/network failure and malformed success are `unknown`. Storage absence requires a successful bounded exact-owner inventory. Present/absent expectations follow persisted stage/target state as A is deleted. B keeps its intact product/Provider/four Storage/Auth control state. Unknown at any required boundary stops acceptance.
- `confirmLiveInvocationFromTty(runDirectory, snapshotPath)` reads the exact snapshot and a real controlling `/dev/tty`; displays its safe authority and requires the exact digest-bearing authorization phrase. No caller streams/phrase or self-test authority can satisfy live confirmation. **This function was not invoked in this unit.** Authorization binds A/B, request, target, stage, action, maxCalls, source commit and snapshot digest. Snapshot/context/MAC and freshness are checked again. Snapshot-specific authorization issuance/consumption, confirmed authorization consumption, child-start and operator-start are exclusive publications; consumed authorization cannot run twice.
- `runG5d4AuthorizedStep({runDirectory, snapshotPath, confirmedAuthorizationPath})` re-reads current A/B state and rejects pre-dispatch drift against the approved snapshot. It dispatches exactly one canonical stage through the existing runner and public bridge/repository/adapter factories. Proof-only guards constrain actual repository actions and exact external target, and do not implement a second product deletion engine. Source/project checks are repeated in the child. Parent guard stays off; only the authorized child has the guard. No retry or next-stage chaining exists.
- `maxCalls=1` means **one canonical invocation**. Provider/Storage action is explicitly `seal`, `delete`, `verify`, `finalize` or `replay`, with at most one target DELETE/verification per invocation. Storage seal keeps its existing two inventory reads and zero external writes. `auth_step` preserves the existing bounded same-stage protocol (at most two GETs, one DELETE, persisted intent/verification/finalization); it cannot run Completion. Database and Completion keep at most one respective RPC. Every invocation ends at mandatory STOP, including a verified PASS.

### Immediate post evidence

The wrapper performs immediate read-only A/B reconciliation after every attempted child launch, including exceptions, lost response and rejected output, before interpreting success. It saves private post evidence with snapshot binding and HMAC digest, captures child output privately, and emits only the safe verdict/digests. Unknown/loss/mismatch results require read-only reconciliation and STOP; there is no automatic retry.

Provider/Storage compare the approved exact voice/object absence with the returned action and persisted target state. Verification and finalization remain separate invocations. Nonapproved targets/resources and A's unaffected DB/Auth/external state must stay unchanged; terminal resource universes must be absent. Auth uses exact A GET absence plus the persisted terminal timestamp and canonical scrubbed owner/target/result shape, rather than expecting the scrubbed target ID to remain in the row. Completion checks the same completed request and all four prior terminal stages; replay preserves completion time.

Database PRE fixes exact request/user, inventory version, prior terminal stages and actual row identities. EXECUTE forwards only the existing `deletionRequestId`, `userId`, `inventoryVersion` contract; **no expectedRows/digest is added to `finalize_account_deletion_database_stage`, repository or migration 0025**. POST fetches every pre-evidence ID independently (LEFT JOIN for child identity visibility), verifies DELETE/ANONYMIZE/RETAIN, retained/anonymized identity and relation, scrubbed fields and retention classifications, persisted terminal/timestamp and returned variable D/A/R, plus current-owner search and unexpected residuals. Owner-query zero alone cannot pass. A concurrent inventory difference is detected as evidence mismatch/STOP; this tooling does not claim an atomic pre-snapshot freeze inside the canonical RPC.

B's exact DB projection (including a private full-row change fingerprint), Provider, Storage identity/version/metadata, and Auth binding are compared pre/post. A change or unknown B state rejects the invocation proof. B is never a destructive target.

### Verification and limits

Offline validation uses OS network denial and disabled Next telemetry. Existing proof regressions **251/251 PASS** and the new invocation suite **65/65 PASS** cover the requested 30 regression categories: weak-word 0/1/4 and over-range/identity/owner/Take failures; exact presence/unknown semantics; all authorization substitutions and consume-once; live/self-test separation; Provider/Storage post absence; variable Database D/A/R and identity/scrub/residual failures; Auth exact absence; Completion terminal/replay; B unchanged/changed; project/migrations/source fail-close; historical evidence isolation. The existing `npm run g5d4:proof-tooling:self-test` now runs both suites. Source-isolated transport tests exercise strict Provider/Auth absence and error mappings and check every new projected column against canonical DB types; they are not a live SQL compilation or live fixture PASS.

Directly affected unchanged Provider, Storage, Database, Auth and Completion canonical bridge behavioral suites **PASS**. They ran via `node --import tsx --conditions react-server` under network denial, avoiding the tsx CLI's local IPC requirement. `npm run check:workspace`, `npm run lint`, initial `npm run typecheck`, `npm run build` (57/57 static pages), post-build typecheck and `git diff --check`: **PASS**. The first historical-suite attempt failed because its data-URL source isolation did not resolve the new pure evidence import; the test harness import was corrected and the full historical suite passed. No product workaround was made.

No live collector/SQL/Provider/Storage/Auth execution, real TTY authorization, E2E/device run or independent review occurred. Future live source must be reviewed and committed before clean-source snapshot collection; no commit is made by this unit. Existing historical recording checkpoints are preserved; this new path does not recreate recordings or attest historical route origin.

Focused self-assessment `P0/P1/P2/UNKNOWN=0/1/0/0`: correction finding **OPEN pending independent focused review**, not a newly asserted Database product gap or independent acceptance. Program tracking remains `0/1/1/0`; known Auth P2 `auth_terminal_authority_missing` is unchanged and deferred. Human rebaseline Decision=`ACCEPTED`; destructive authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; Gate 5=`OPEN`. Staging/Provider/Storage/DB/Auth mutation, Production access, fixture/account/request/target creation, guard enable, old-private-run changes, migration apply, commit/push/staging are all **0**.

Exact `NEXT_ONE_ACTION`: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW`.

## Historical live deletion minimum evidence rebaseline — withdrawn scope STOP, 2026-09-12

Mode: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_REBASELINE_IMPLEMENTATION_V1`.

**Historical assessment, superseded by CASE 1 above; its inferred product/RPC-change requirement is withdrawn.** Result at that time: `STOP / G5D4_INVOCATION_SNAPSHOT_DATABASE_EXECUTION_BOUNDARY_MISSING`. **Not implemented; not the corrected/pending-independent-review success candidate.** This section records the new Human Decision and supersedes the historical fixed-fixture release requirements below, without rewriting historical tests or evidence.

Accepted Human Decision: release evidence must bind exact A/B, actual current resource/table row sets, request/target/stage/action/max calls, fresh invocation snapshot, separate explicit Human destructive authorization, bounded execution, immediate verification and unchanged B. `weak_words` is 0–4 per Take, but the exact observed identities/owner/Take relations must be fixed, not just the range or total. A17/B16, A22, D15/A1/R6, matching A/B weak-word counts, B weak words >=1, old manifest complete/sealed, old/new commit equality and old-run migration are no longer acceptance requirements. **Their enforcement in existing tooling remains unchanged because implementation stopped; that tooling is not ready for the new live acceptance contract.** No authority-migration framework is proposed.

Current live facts are **Human-supplied, not re-read in this unit**: A has the reported 19 product rows, including four weak words and five completed writer intents; four Storage classes, Auth identity and cloned Provider voice exist; deletion request and durable targets are absent. Nineteen is an observation, not an acceptance total. B is not started. A must not be recreated. Old private generations 1–7, key, checkpoints and historical evidence were not opened, modified, removed or migrated.

Preflight: Developer cwd/git root; branch `codex/g3-mobile-main-loop`; HEAD `8814953f1bd8424c4c8600e8b9b627a5416658f3`, local upstream ahead/behind `0/0` (no fetch). Tracked worktree initially clean. Existing untracked `.env.local.save` and `supabase/.temp/` preserved without content access or edits. Only this document and `docs/current-state.md` change.

### Concrete execution-boundary blocker

Requirement 3 says row addition/removal/replacement/ownership or Take-relation drift while using the invocation snapshot must STOP; regressions 6/7 require changes after the snapshot to reject. This assessment interprets that as preventing dispatch against a changed row set, not merely detecting drift after irreversible execution.

- `services/account-deletion/account-deletion-database-finalizer.repository.ts:57` exposes only request, user and inventory-version authority. At line 169 it forwards exactly those three values to `finalize_account_deletion_database_stage`; no expected row identities or digest reach the transaction.
- `supabase/migrations/0025_g5d_2j_atomic_db_finalizer.sql:456` defines that three-argument RPC. It takes the user advisory lock and request row lock inside the RPC (lines 511–517), then computes its current inventory (line 855) and deletes Takes and Scripts by owner (lines 932/935), cascading to weak words and related rows. Its internal counts and drift checks protect its own transaction inventory; they do not compare with a prior Human-approved private snapshot.
- Existing writer fences are real and must be preserved. However, the weak-word trigger at lines 283–287 covers INSERT and UPDATE OF take_id, not DELETE. Therefore it does not provide complete row-set immutability from an external read-only snapshot through RPC entry. A row removal committed after the last proof SELECT but before RPC inventory is not rejected as a mismatch with the approved snapshot. This is a source-supported ordering scenario, **not a live SQL race reproduction**.
- A proof-only repository decorator can re-read immediately before forwarding, but the independent SELECT/RPC interval still exists. The collector's read-only SQL transport cannot carry a held transaction through Human approval and the canonical RPC. Immediate post-verification is necessary but cannot undo an already-dispatched deletion or prove that dispatch was rejected on drift.

An offline probe of the **unchanged real repository with a fake RPC client** additionally supplied synthetic `expectedRows` and `expectedRowSetDigest`. The dispatched arguments still numbered three, neither new field was forwarded, and a valid synthetic `succeeded` response was accepted. Fake RPC calls `1`, real RPC/network/mutation `0`. This proves the interface limitation only, not a product exploit or new live authority.

Minimum unresolved scope: a trusted comparison of the approved exact Database row set with the execution inventory at the canonical atomic finalizer boundary, before DELETE/ANONYMIZE, or an existing provable mechanism that makes that entire row set immutable across the interval. The current interface supplies neither. Extending the repository/RPC contract and transaction checks would touch explicitly prohibited product repository/migration/types (and possibly operator input plumbing). **No such changes were made.** The user's section 10 STOP rule, rather than a skill permission rule, is the reason for stopping. Merely relaxing fixed counts or shipping a disconnected snapshot helper would not satisfy this requirement.

Remaining implementation is unclaimed: stage-specific present/absent/unknown (network/permission errors must remain unknown→STOP); integrity-protected invocation snapshots and source binding; exact Human snapshot/target/stage/action/max-call binding; mandatory immediate A verification including retained/anonymized rows fetched by pre-snapshot identity; B DB/Provider/Storage/Auth pre/post control. Existing consume-once, live/self-test separation, parent/child destructive guards, bounded canonical invocations and no automatic retry/chaining remain untouched. Seal/execute/verify/finalize must keep separate Human stops where applicable.

Validation: `npm run check:workspace`, existing `npm run g5d4:proof-tooling:self-test` **251/251**, unchanged Database canonical bridge behavioral self-test, the narrow fake-RPC interface probe, `npm run lint`, initial `npm run typecheck`, `npm run build` (**57/57** static pages), and `git diff --check` **PASS**. Tests/lint/typecheck/build ran with OS network denial and Next telemetry disabled. The npm Database test entry initially failed before tests because the `tsx` CLI's local IPC listen was denied (`EPERM`); the same unchanged test file then passed via `node --import tsx --conditions react-server`, preserving network denial. The requested 24 rebaseline regressions are **NOT IMPLEMENTED / NOT RUN**; no E2E, devices, independent review or live SQL race proof was run. Historical fixed-fixture test PASS must not be interpreted as acceptance of the new contract.

Post-build `npm run typecheck` and final `git diff --check`: **PASS**. Final tracked diff is the two documentation files only.

Focused source-assessment `P0/P1/P2/UNKNOWN=0/1/0/0`: execution-boundary finding **OPEN**, pending independent assessment; not an independent review or a program-wide rescore. Known Auth P2 `auth_terminal_authority_missing` remains deferred and unchanged. This finding does not reopen the correctness of the old canonical finalizer under its existing contract.

Human rebaseline Decision=`ACCEPTED`; B control preparation=`NOT STARTED`; destructive authorization=`NOT GRANTED`; G5D4=`NOT AUTHORIZED / NOT STARTED`; Gate 5=`OPEN`. This unit performs no Staging/Production/Provider/Storage/Auth access, live fixture creation/change, authorization creation/request, guard enable, deletion, migration apply or old-private-run operation. Commit/push/staging=`0/0/0`.

Exact `NEXT_ONE_ACTION`: `G5D4_LIVE_DELETION_MINIMUM_EVIDENCE_EXECUTION_BOUNDARY_READ_ONLY_SCOPE_RECONCILIATION`. Resolve the above Database boundary against the requested snapshot semantics and permitted scope. The success-path independent focused review is premature because there is no correction implementation.

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
