# Gate 5 Retention, Provider Governance, and Public Copy Human Decision V2

Recorded: 2026-09-02

Decision ID: `HDC_GATE5_RETENTION_PROVIDER_GOVERNANCE_AND_PUBLIC_COPY_V2`

Status: `APPROVED_BY_HUMAN`

This document is the canonical repository record of the Gate 5 Human Decision. It fixes internal retention targets, provider governance, deletion promises, operator roles, and release-candidate public-copy boundaries. It is not final legal text, publication approval, implementation authority, destructive execution authority, or a claim that pending runtime controls already exist.

The corresponding Privacy Policy, Account Deletion, and Support release candidate is [Gate 5 public copy release candidate V2](./gate5-public-copy-release-candidate-v2.md). That copy remains `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET` until every listed publication prerequisite passes.

## Decision summary

### 1. Voice samples and consent recordings

- After provider registration processing completes and Native Minute no longer needs the source material, voice samples and consent recordings must be deleted promptly.
- The internal cleanup target is within 24 hours.
- The 24-hour target must not become a public guarantee until enforcement, retry, failure handling, and physical cleanup have runtime proof for the production configuration.
- Consent withdrawal stops future processing that depends on that consent. Voice Data deletion and Account deletion remain separate user actions with separate scopes.

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
- Preserve the strict automatic absence contract for deletion verification.
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
