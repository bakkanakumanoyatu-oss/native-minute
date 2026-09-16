# Gate 5 Retention, Provider Governance, and Public Copy Human Decision V2

Recorded: 2026-09-02

Decision ID: `HDC_GATE5_RETENTION_PROVIDER_GOVERNANCE_AND_PUBLIC_COPY_V2`

Status: `APPROVED_BY_HUMAN`

This document is the canonical repository record of the Gate 5 Human Decision. It fixes internal retention targets, provider governance, deletion promises, operator roles, and release-candidate public-copy boundaries. It is not final legal text, publication approval, implementation authority, destructive execution authority, or a claim that pending runtime controls already exist.

The corresponding Privacy Policy, Account Deletion, and Support release candidate is [Gate 5 public copy release candidate V2](./gate5-public-copy-release-candidate-v2.md). That copy remains `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET` until every listed publication prerequisite passes.

## Gate 5 final Human approval and formal closeout — 2026-09-16

Decision: `HUMAN_DECISION_GATE5_FINAL_APPROVAL`; status: `APPROVED_BY_HUMAN`. Authority is the Human's explicit approval in this conversation of the Final Human/Legal Approval Packet A–J and permission to proceed to Gate 5 formal closeout. This records final **Human approval**, not an independently established legal-review sign-off or approval of Production publication text.

Approval-packet base: `codex/g3-mobile-main-loop`, HEAD/upstream `43d373a069cc7e93f836723b74c8c31f7051498c`, ahead/behind `0/0`, tracked clean, no staged changes or unknown WIP. `TECHNICAL_BLOCKERS_FOR_R4=0` uses the accepted closeouts; no R1/R2/R3/G5D4 re-audit or new runtime proof is performed.

### Approved scope

1. App-owned voice samples / consent recordings use first durable Provider registration success + 24 hours as the internal cleanup target, not an unconditional deletion guarantee or public SLA. The existing shared-source eligibility contract below remains unchanged.
2. Practice recordings / learning history, personalized reference audio, Quota / operational metadata / deletion audit and operational logs follow the already-approved retention/deletion authority. No new retention period is added.
3. Account deletion follows Provider → Storage → Database → Auth → Completion; unknown is never completion. Valid legal-hold and other lawful exceptions remain. Immediate or complete physical backup erasure is not guaranteed.
4. Consent withdrawal, Voice Data deletion and Account deletion remain distinct, with existing Provider-specific contracts unchanged.
5. Limited legal hold retains its persisted scopes, authority and release/resume contract. It authorizes neither indefinite retention nor false preservation claims for unavailable resources.
6. Routine expiry purge rechecks expiry, terminal state, linkage and hold. Expiry, anonymization, inaccessibility and physical purge remain distinct.
7. `legacy_hold_linkage_unresolved` remains fail-closed: neither purged, resolved nor approved for indefinite retention. Existing separately reviewed/authorized operator reconciliation requirements remain.
8. Third-party disclosures must match the established Provider roles and actual processing. Production contracts, settings, regions and publication conditions remain for subsequent release readiness.
9. `auth_terminal_authority_missing` remains the known nonblocking deferred Program P2. This approval is not a release-wide GO.
10. Before publication, replace the over-restrictive Account deletion statement that only minimal support information remains with the approved wording below.

### Approved public-copy correction — pending implementation before publication

Location: [`app/support/account-deletion/page.tsx`](../app/support/account-deletion/page.tsx), the statement ending `サポート対応に必要な最小情報だけです。` The Human approved this replacement meaning:

> 削除完了後も、匿名化した利用量情報、限定的な削除証跡、セキュリティログ、バックアップが、該当する保持期間または有効なlegal holdの間、一時的に残る場合があります。すべてのバックアップからの即時消去は約束しません。

The application copy is unchanged in this docs-only closeout; correction remains a pre-publication item. The release candidate remains `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET` under the existing publication prerequisites.

### Formal closeout and remaining boundaries

- R1=`FINAL CLOSED / PRODUCTION_LIKE_RUNTIME_PROOF_PASS`; [accepted Staging evidence](gate5-r1-staging-natural-due-evidence.json) and [runtime closeout](g5d-2d-current-schema-delete-anonymize-retain-cascade-matrix-authority.md#r1-staging-natural-due-runtime-closeout--2026-09-16) are unchanged.
- R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; G5D4=`LIVE DELETION PROOF CLOSED`. Existing matrix, hold/purge controls and live-deletion evidence remain accepted without reopening technical work.
- R4=`HUMAN_APPROVED`; **Gate5=`CLOSED`**, on explicit Human authority. Earlier Gate5/R4 statuses and next actions below are historical.
- This does **not** approve App Store publication, Production migration/destructive operations, final Production Provider configuration, or final App Privacy / Data Safety answers; it does not establish Production log/backup lifecycle verification or B1D2B / release-readiness completion. Existing final legal/publication review prerequisites remain separate.
- Docs-only recording: source/migrations/tests/public UI unchanged; no live access, Provider/Storage/Auth operation, deployment or publication. Protected `.env.local.save` / `supabase/.temp/` remain unread, unhashed and unchanged. Stage/commit/push=`0/0/0` for this recording.
- Handoff is to existing release readiness with the public-copy correction and publication prerequisites still pending. This closeout does not start another Gate or grant new execution authority.

## Decision summary

### 1. Voice samples and consent recordings

- After provider registration processing completes and Native Minute no longer needs the source material, voice samples and consent recordings must be deleted promptly.
- The internal cleanup target is within 24 hours.
- The 24-hour target must not become a public guarantee until enforcement, retry, failure handling, and physical cleanup have runtime proof for the production configuration.
- Consent withdrawal stops future processing that depends on that consent. Voice Data deletion and Account deletion remain separate user actions with separate scopes.

#### R1 shared-source cleanup eligibility decision — 2026-09-15

Decision ID: `HDC_GATE5_R1_SHARED_SOURCE_CLEANUP_ELIGIBILITY_V1`; status: `APPROVED_BY_HUMAN`. This clarification controls R1 shared-source eligibility; the exact future implementation authority is in the [R1 matrix contract](g5d-2d-current-schema-delete-anonymize-retain-cascade-matrix-authority.md#r1-shared-source-cleanup-authority--2026-09-15).

1. For each app-owned source material reused by multiple Provider registrations, fix the cleanup anchor at its **first durable Provider registration success**. Later registration successes never extend or restart it.
2. Cleanup due is that anchor + **24 elapsed hours**, an internal target, not a public SLA or absolute deletion guarantee.
3. A registration / retry already started and nonterminal when due arrives may block cleanup to avoid breaking active use. This includes registrations started concurrently **before the first durable success**. Blocking does not start another retention period; after safe terminality, a separate routine cleanup invocation may collect the already-due source.
4. New registration is prohibited once due arrives, even if cleanup has not run. It is also prohibited after cleanup authority acquisition or cleanup start. Future possible reuse alone never justifies retention.
5. Retry means continuation of the **same previously started registration attempt / operation**, started before cleanup authority acquisition; a newly created registration cannot be relabeled retry to evade cleanup.
6. After cleanup starts, registration requiring source audio needs a **fresh upload with a new source identity**. After cleanup succeeds, a leftover source path / locator never authorizes reuse: consult canonical cleanup state and fail closed.
7. App-owned source audio cleanup is separate from retention of required consent/audit evidence. This decision does not change consent records, versions, timestamps or purpose evidence; Provider-side voice retention/deletion or consent authority; practice-recording or Account-deletion retention; legal-hold scope; or R2/R3 authority.

Authority resolution only: R1=`OPEN / AUTHORITY_RESOLVED / NOT_IMPLEMENTED`. No migration, product source/types/tests/operator changes, DELETE, Staging/Production access, or external Provider operation is authorized by this documentation task. Next: `GATE5_R1_REGISTERED_SOURCE_MATERIAL_ROUTINE_CLEANUP_FOCUSED_IMPLEMENTATION_V2`.

Implementation update (2026-09-15): R1=`CODE CLOSED`; authoritative verdict `GATE5_R1_REGISTERED_SOURCE_MATERIAL_ROUTINE_CLEANUP_INDEPENDENT_REREVIEW_PASS`, R1-P1-01 independent rereview PASS / CLOSED, focused `P0/P1/P2/UNKNOWN=0/0/0/0`. See [R1 code closeout](g5d-2d-current-schema-delete-anonymize-retain-cascade-matrix-authority.md#r1-independent-rereview-code-closeout--2026-09-15). Production-like runtime proof=`PENDING`; this is not R1 FINAL CLOSED. 0030 is a repository migration, unapplied to Staging/Production. R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`; known Auth P2 remains nonblocking deferred. No Human Decision, public-copy or retention-policy change. Next: R1 Production-like runtime proof under existing authority and minimum scope; define execution after the commit/push response, without starting it in this unit.

Runtime update (2026-09-16; supersedes the historical status above): **R1=`FINAL CLOSED / PRODUCTION_LIKE_RUNTIME_PROOF_PASS`**. The fixed two naturally due Staging test sources passed exact-target cleanup, physical absence, evidence preservation, reuse refusal and idempotency. Unrelated DELETE / Provider DELETE / Production operations=0. Staging ledger 0001–0030 confirmed; no Production change. [Runtime closeout](g5d-2d-current-schema-delete-anonymize-retain-cascade-matrix-authority.md#r1-staging-natural-due-runtime-closeout--2026-09-16). R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`READY_FOR_FINAL_HUMAN_LEGAL_APPROVAL`; Gate5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`. Human Decision and public-copy publication boundaries remain unchanged. NEXT_ONE_ACTION: `GATE5_R4_FINAL_HUMAN_LEGAL_APPROVAL`.

### 2. Learning data

Practice recordings, takes, transcripts, pronunciation results, weak words, coaching feedback, latest/best selections, saved progress, and related learning history are retained while needed to provide the service. They remain until the user deletes the relevant data or completes Account deletion, subject to a valid legal hold.

Voice-only deletion does not imply deletion of the account or learning history.

### 3. Operational retention targets

The following are internal targets:

| Data class | Internal target | Public-copy boundary |
| --- | --- | --- |
| Quota and safe-usage metadata | 90 days | Do not promise a physical purge deadline until enforcement and purge evidence pass. |
| Operational logs | 30 days | Do not promise a physical purge deadline until the production logging inventory and lifecycle controls pass. |
| Scrubbed deletion audit | 90 days after completion | Do not promise a physical purge deadline until expiry and physical purge are both proven. |

Expiry, logical inaccessibility, anonymization, and physical purge are distinct states and must not be represented as equivalent without evidence.

### 4. Legal hold

- A legal hold is limited to legitimate legal, security, fraud-prevention, dispute, or rights-preservation needs.
- Data covered by a valid hold may be retained only for the necessary period.
- After the hold ends, the affected data must return to the applicable deletion or anonymization process.
- Indefinite retention is not authorized.

#### R3 implementation — 2026-09-15

Status: `CODE CLOSED` (independent rereview PASS; Voice-only P1 closed below). The additional Human Decision permits **only hold-field updates on completed requests**. Completion immutability remains the default. Migration [0028](../supabase/migrations/0028_gate5_limited_legal_hold.sql) leaves 0027 unchanged; all first-Completion checks and the 2160-hour expiry anchor remain unchanged.

- Exact completed UPDATE allowlist: `legal_hold_active`, `legal_hold_scope`, `legal_hold_set_at`, `legal_hold_set_authority_ref`, `legal_hold_released_at`, `legal_hold_release_authority_ref`. NEW/OLD JSONB minus exactly these six columns must match, and a hold column must change. This protects all other current/future columns. `set_updated_at_account_deletion_requests` runs later by trigger-name order, so caller-authored `updated_at` is **not** allowlisted.
- Scope is a sorted, unique array of the following existing resource categories; no case notes, legal reason taxonomy, email, raw UUID or secrets are stored in hold metadata. A completed request accepts only `['retained_audit']`, preserving the remaining request and account Provider/Storage target audit rows. It never restores product data, external objects or owner linkage.

| Scope | Account deletion stages blocked |
| --- | --- |
| `retained_audit` | No pre-completion stage; deletion of the held parent/retained account target rows is blocked |
| `provider` | Provider; Database/ Auth/Completion that would discard required evidence |
| `storage` | Storage; Database/Auth/Completion that would discard required evidence |
| `database` | Database/Auth/Completion |
| `owner_linkage` | Auth/Completion; preserves the request/Auth owner link |

Manual service-authorized control only (no new user API/UI):

- `apply_account_deletion_legal_hold(p_deletion_request_id, p_scope, p_authority_ref, p_expected_set_authority_ref DEFAULT NULL)` returns `applied`, `already_applied`, or `already_released`. Exact UUID lookup locks the persisted row. Use a fresh opaque `lh_` + 32 lowercase random hex reference for an authorized hold; on reapply after release, supply the previous set reference as CAS. Conflicting active scope/reference or stale previous reference rejects. A retry of a released apply does not reactivate it.
- `release_account_deletion_legal_hold(p_deletion_request_id, p_expected_set_authority_ref, p_authority_ref)` returns `released` or `already_released`. It requires the exact set reference and an opaque release authority reference. Stale release cannot clear a newer hold. Identical retries do not change timestamps. Only the current/latest hold cycle is stored; this is not a case-management history system.
- Both RPCs are `SECURITY DEFINER`, owned by `postgres` with a fixed search path, and executable only by `service_role`. Direct hold-column UPDATE is not granted; INSERT cannot manufacture a hold. Case-specific Human/legal authorization remains required operationally; a syntactically valid reference alone is not a legal decision.
- Apply fails closed if the requested resource is already scrubbed, externally dispatched, or owned by an outstanding relevant runner lease (even expired). An active separate voice-deletion operation rejects resource-preservation claims. Non-audit scopes require an active owned request and keep its unique active-request fence; cancel/expire cannot bypass preservation. Owner-linkage scope rejects missing owner or an already-authorized Auth DELETE.
- Provider/Storage lease CAS, Auth DELETE-generation CAS and the atomic Database finalizer enforce the persisted predicate. Apply and dispatch serialize on the existing request row; the Database finalizer keeps its original user-lock/row-lock order and all D/A/R logic. Application resolvers/runners and the dry-run planner re-read hold authority and fail closed when absent/malformed. Release leaves durable stages, generations, failures and counters untouched; the next separately authorized invocation selects the first incomplete canonical stage. Terminal requests stay terminal.
- Future R2 contract: `expires_at <= now() AND NOT legal_hold_active`. Active holds exclude expired rows. Release never rewrites `completed_at`/`expires_at`, purges, executes a stage, sends a notification or chains work. Expired released rows merely become eligible for a future R2 routine.

Initial implementation validation (before independent review found the Voice-only P1): workspace, diff whitespace, lint, typecheck, build and post-build typecheck PASS; 32 new focused Vitest cases plus 111 existing relevant cases PASS; five existing canonical operator fake suites PASS. Network-disabled disposable PostgreSQL applied the full `0001–0028` chain; existing Completion runtime tests and [focused hold tests](../scripts/gate5-legal-hold-isolated-test.sql) PASS (65 non-hold columns, completed apply/release invariance, ACL, scope guards, Auth linkage, expiry predicate, User B isolation and concurrent apply/lease serialization). The SQL tests reuse the existing Completion harness. No new proof framework or live destructive proof was added.

Runtime/schema boundary: repository change and isolated schema verification only. Migration 0028 is **not applied to Canonical Staging or Production**. R1=`OPEN`, R2=`OPEN`, R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate 5=`OPEN`, G5D4=`LIVE DELETION PROOF CLOSED`. The independent review subsequently found exactly one P1: Voice-only bypass of Provider preservation. See the focused remediation below. Known Auth P2 `auth_terminal_authority_missing` remains nonblocking deferred.

#### R3 Voice-only P1 remediation (2026-09-15)

Status: `GATE5_LIMITED_LEGAL_HOLD_CONTROL_INDEPENDENT_REREVIEW_PASS`; R3 technical/code control=`CODE CLOSED`.

- Root cause: Voice-only `begin_provider_voice_delete_attempt` could grant DELETE authority after a successful Account provider hold. The canonical Account guard did not cover this separate destructive entry point.
- 0028 now replaces that Voice-only RPC, preserving its original lease, stage, ownership, CAS, retry-budget and delete-once transitions. It locks all requests with the exact persisted operation owner (`user_id`), in request-ID order, **before** operation/target locks, then evaluates existing `account_deletion_legal_hold_blocks(request, 'provider')`. Locking only currently held rows would miss concurrent apply. Apply/release already lock that request; neither control RPC changed.
- Existing Account Provider snapshot authority enumerates all remaining ElevenLabs voices owned by the request user, including before target seal. Thus `provider` preserves that owner's remaining Provider assets, not just materialized target rows. Voice-only still validates operation + target + owner + sealed Provider locator. No global hold or new identity/scope semantics. `retained_audit`, `owner_linkage`, `storage` and `database` alone do not block this Provider boundary; completed owner-null audit requests do not join.
- A held attempt raises SQLSTATE `23514` / `legal_hold_active` **before any mutation**. No target counter, destructive marker or DELETE authority advances. Repository mapping and runner return `blocked / legal_hold_active`, without marking `manual_required`, success or retry. The existing operation lease is only coordination; it cannot authorize Provider DELETE and is released in `finally`.
- Apply still rejects an already active Voice-only operation with `legal_hold_scope_unavailable`, both before seal and after progression (B/C). It never claims that a previously authorized operation is preserved. Apply-first blocks begin even after later creation/seal; begin-first serializes apply, which rejects. Release changes no operation/target state, counters or retry scheduling; a later separate invocation may continue the same valid operation.
- [Isolated regression](../scripts/gate5-legal-hold-voice-only-isolated-test.sql): the sealed Account target matches Voice-only owner, internal voice and Provider locator. The original RPC, temporarily restored in a rolled-back transaction, reproduces active hold + counter **1**. The corrected RPC rejects repeated attempts with counter **0** and unchanged operation/target state. Covers B/C safe apply rejection, release/resume and stale CAS, same-owner audit-only hold, unrelated owner, completed owner-null audit, owner-linkage, unsealed Account snapshot, and both concurrent transaction orders with observed barriers.
- Validation: workspace / whitespace / lint / typecheck / build / post-build typecheck PASS. Focused R3, Voice-only Provider/operation and Account Provider/Storage/Auth/Completion: **168/168**; repository and Account DB contracts: **40/40**. Includes six new runner cases exercising production RPC-error mapping and asserting blocked external dispatch **0**. Five canonical operator fake suites plus operator core PASS. Fresh network-disabled disposable PostgreSQL applied **0001-0028**, preserved historical Completion data, and passed existing Completion, R3 hold and new Voice-only P1 SQL suites. The pre-existing 0028 R3 implementation is byte-unchanged; only the guarded Voice-only RPC and explicit ACL are appended.

0028 remains a repository migration after commit and is unapplied to Staging/Production. R3 code close does not mean Staging migration apply or Production enablement; no remote access or deployment was performed. Real external Provider DELETE=**0**. No Storage/Database/Auth/Completion/planner, R1/R2/R4, UI, scheduler or G5D4 proof-tooling behavior changes. Full browser E2E not run (outside this task).

Independent rereview PASS: focused `P0/P1/P2/UNKNOWN=0/0/0/0`; program `0/0/1/0` (`auth_terminal_authority_missing`: known nonblocking deferred Program P2). R3=`CODE CLOSED`, R1/R2=`OPEN`, R4=`WAITING_ON_TECHNICAL_CONTROLS`, Gate 5=`OPEN`, G5D4=`LIVE DELETION PROOF CLOSED`. After commit/push, next technical control: existing R2 hold-aware routine purge, using the future R2 contract above; R1/R2 inventory is not restarted.

### 5. Public deletion promise

The public promise is bounded as follows:

- Delete or anonymize user data from active systems according to the Account deletion scope.
- Delete deletable user-specific provider assets.
- Never report an unknown or unresolved provider, Storage, database, or Auth result as completed.
- Limited records may temporarily remain in backups, security logs, or scrubbed operational evidence until the applicable retention cycle completes.
- Do not promise immediate erasure from every backup or every technical copy.

### 6. Provider governance

#### ElevenLabs

- Enable the applicable model-improvement opt-out before Production use.
- Delete the user-specific cloned voice during Voice-only deletion and Account deletion.
- Do not describe voice cloning samples as having a guaranteed zero-retention-mode complete deletion unless the actual plan, configuration, provider contract, and runtime evidence support that statement.
- Preserve the strict automatic GET absence contract: following the 2026-09-13 Human Decision, accept only HTTP **400 or 404** with exact `detail.type=not_found` AND `detail.code=voice_not_found` for the exact requested voice. This replaces the previous 404-only rule in the shared Account/Voice-only product adapter and Provider proof classifier; all other failures stay fail-closed. DELETE semantics and retry boundaries are unchanged. Historical UNKNOWN evidence is not retroactively promoted; fresh canonical verification needs separate execution authority. Implementation/review status is recorded in `g5d4-proof-only-tooling-result.md`.
- The G5C-B7 Human Option D is historical, target-specific evidence and must not be generalized.

#### OpenAI

- The current authority covers the existing transcription endpoint and currently enabled app features.
- Native Minute must not explicitly opt user data into model-improvement data sharing.
- Under the current endpoint and contract, Account deletion does not add a separate OpenAI-side asset deletion stage.
- Re-review the data path and deletion obligations if the endpoint, retention terms, data controls, or stored-asset behavior changes.

#### Microsoft Azure Speech

- The current authority assumes real-time Pronunciation Assessment.
- Do not enable unnecessary logging, batch persistence, custom model training, or custom training-data storage.
- Under the current configuration, Account deletion does not add a separate Azure-side asset deletion stage.
- Re-review the data path if the mode, region, logging, storage, training, or contract changes.

#### Supabase

- Account deletion must delete or anonymize user data in active Auth, database, and Storage systems according to the verified schema matrix.
- Production region, plan, backup retention, and point-in-time recovery settings remain a Gate 9 decision.
- Deleted user data must not be restored into or reused by ordinary product functionality from backups.

### 7. Account deletion service targets

- The primary initiation path is in-app Settings → Account Deletion. A support email is not required to start.
- When manual handling is required, the internal and release-candidate public target is to begin handling within three business days.
- The completion target is ordinarily within 30 days.
- These are service targets, not unconditional legal guarantees. A justified legal hold, security investigation, unresolved external dependency, identity/safety issue, or other lawful exception may require additional time.

### 8. Operator governance

- Human: destructive approver and release owner.
- Codex execution: operator acting only within explicit authority.
- Fresh independent review: reviewer.
- The operator must not self-authorize live destructive execution.
- An ordinary runner must not automatically clear `manual_required`.
- G5D-4 requires a separate Human authorization for its exact sealed disposable scope.

### 9. Reviewer-safe evidence

Permitted evidence fields include opaque anonymized request references and safe status, reason, count, timestamp, attempt, and verification summaries.

Evidence must not contain email addresses, raw user IDs, provider IDs, Storage locators, object keys, signed URLs, secrets, tokens, cookies, raw provider responses, or source audio.

### 10. G5D-4 live proof boundary

- Use a new disposable Staging account distinct from G5C-B7.
- Require a new exact Human authorization.
- Prove the ordered path: Provider → Storage → DB/anonymization → Auth → completion verification.
- Require cross-user mutation count `0` and reviewer-safe evidence.
- Do not reuse the G5C-B7 authorization or Option D.

### 11. App Privacy and data inventory

Apple App Privacy, Google Play Data Safety, and public disclosures must cover actual Native Minute processing and actual third-party processing by Supabase, ElevenLabs, OpenAI, and Microsoft Azure Speech. Before release, declarations must be reconciled against the Production network/data inventory rather than inferred from repository intent alone.

## Repository status accepted with this decision

- G5D-2A: `CLOSED_COMMITTED_PASS`.
- G5D-2 overall: `OPEN`.
- Migration `0022`: repository committed and isolated PostgreSQL proof `PASS`; canonical Staging apply not yet done.
- G5D-4 and G5D-5: pending.
- Public copy: `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET`.

## Publication prerequisites

Publication requires all of the following:

- G5D-5 / Gate 5 formal close.
- Production provider and configuration review.
- Current-schema delete/anonymize/retain/cascade validation.
- G5D-4 live proof with cross-user mutation `0` and reviewer-safe evidence.
- App Privacy and Data Safety review against the Production inventory.
- Final Human approval.
- Final legal review.

## Non-authorizations

This decision does not authorize source or UI changes, publication, a new migration, migration `0022` Staging apply, deploy, provider calls, destructive-guard enablement, G5D-2B implementation, Storage/DB/Auth wiring, Gate 6 work, or modification of `supabase/.temp/`.
