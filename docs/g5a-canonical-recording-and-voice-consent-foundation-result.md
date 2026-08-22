# G5A Canonical Recording and Voice Consent Foundation

Status: `STAGING_APPLICATION_PROVEN_PENDING_FINAL_CLOSEOUT`

Scope: G5A consent foundation P1 remediation plus the Staging-only `0013` database and application proof. Gate 5 as a whole is not closed, and this work does not start Gate 5B.

Consent copy status: `PRODUCT CONSENT COPY / HUMAN-APPROVED INTERIM`. Final legal approval for the Privacy Policy and Terms remains outside G5A.

## Decision

`voice_consents` is a provider-workflow history table and does not safely contain the versioned product contract required for G5A. It is preserved without any fabricated backfill. A narrow additive `processing_consents` table is the canonical record for exactly two contracts:

- `pronunciation_processing`
- `voice_cloning`

Rows retain the consent type, consent version, purpose identifier/version, provider set, data categories, status, accepted timestamp, and withdrawal timestamp. The database trigger constrains new rows to the current server contract and makes records append-only except for withdrawal. Legacy rows are intentionally `LEGACY_RECONSENT_REQUIRED` for new voice creation; existing persisted default voices and Listen remain usable.

## Current v1 contracts

| Consent type | Purpose | Providers | Data categories |
| --- | --- | --- | --- |
| `pronunciation_processing` | English recording transcription, pronunciation assessment, and Japanese feedback generation | OpenAI, Azure | `recorded_audio`, `transcript`, `pronunciation_result` |
| `voice_cloning` | Create a personal model voice from the user's own sample | ElevenLabs | `voice_sample`, `consent_recording`, `cloned_voice`, `reference_audio` |

Both current versions are `2026-08-22.v1`. An accepted row from another version is not current and requires re-consent.

## Server enforcement

- Web and Mobile recording upload are refused before Storage upload without current pronunciation consent.
- `createReviewArtifacts` rechecks pronunciation consent before creating the OpenAI transcription or Azure evaluator, covering Web and Mobile evaluation paths.
- New voice creation rechecks current voice-cloning consent before resolving samples or calling the voice provider.
- Withdrawal stops future uploads and processing, but does not delete existing takes, reviews, transcripts, progress, voices, or reference audio.

## UX and API boundaries

- Record screens on Web and Mobile show an affirmative, provider-named consent gate before recording controls. Decline returns safely to Listen/scripts.
- Voice Setup on Web and Mobile identifies ElevenLabs at the point of action.
- Web Settings has a minimal pronunciation-consent withdrawal action. Re-consent happens at Record; final Mobile Settings navigation remains out of scope for G5B.
- Web and Mobile consent APIs return only safe status values. They do not return provider credentials, provider IDs, private storage paths, or raw provider responses.

## Migration and types

- Added `0013_g5a_canonical_processing_consents.sql`.
- Added `processing_consents` Database types.
- No existing rows, columns, buckets, provider resources, or account-deletion state were removed or rewritten.

## P1 remediation history

The final read-only audit found two P1 findings in the original repository-only `0013` definition. That audit result remains part of the record; it is not overwritten by this remediation.

- The prior owner-scoped `FOR ALL` policy also permitted authenticated owners to physically delete their canonical consent history.
- The prior defaults and service writes allowed client-supplied audit timestamps to become canonical values.

At remediation time, `0013` had not been applied to an external Supabase environment, so the correction safely changed the pending migration rather than adding a follow-up migration. That historical state is superseded by the Staging-only proof below; Production was not changed.

The corrected migration now:

- grants authenticated owners separate `SELECT`, `INSERT`, and `UPDATE` policies scoped to `auth.uid() = user_id`, with no `DELETE` or broad `FOR ALL` policy;
- makes the consent trigger author `accepted_at`, `created_at`, and `updated_at` on insert, regardless of an insert payload;
- permits only the active-to-withdrawn transition, authoring `withdrawn_at` and `updated_at` in the database while keeping acceptance and creation timestamps immutable;
- keeps a withdrawn row immutable, so an authenticated client cannot restore or erase its history; and
- stops the application consent service from sending acceptance or withdrawal timestamps at all.

The current data model already represents withdrawal followed by re-consent as a new accepted row. No history redesign or event-sourcing work was required.

## Targeted proof

`apps/mobile/tests/processing-consent-route.test.ts` proves:

- current pronunciation consent permits upload;
- missing consent prevents Storage upload and evaluation-service/provider work;
- old version is not current;
- User A consent does not satisfy User B;
- accept and withdrawal use a safe status-only response;
- current voice-cloning consent permits creation; legacy/withdrawn state blocks upload and voice creation;
- consent response payloads contain no provider or Storage identifiers.

The existing Mobile main-loop route tests continue to cover owned recording, evaluation persistence, review, progress, and fresh-user voice setup.

`apps/mobile/tests/processing-consent-migration-contract.test.ts` directly inspects the migration's RLS policies and trigger contract: owner isolation, no authenticated `DELETE`, no broad `FOR ALL` policy, DB-authored acceptance/withdrawal timestamps, immutable canonical fields, and the fixed current contracts. The repository has no local Postgres/Supabase runtime or existing DB-test harness, so this remains focused repository-level coverage rather than a replacement for the external proof below.

## Staging database and application proof

On 2026-08-22 JST, the clean source `b04288dbe3aa4d32b1b616ebb2021de18862ba7d` was used for a Staging-only proof. The normal Supabase CLI migration history showed `0001` through `0012` matched and `0013` as the only pending migration; one ordinary `db push` applied `0013`. No SQL Editor, reset, migration repair, Production project, or provider operation was used.

- Staging catalog verification passed: `processing_consents` has the expected columns, RLS is enabled, the three owner `SELECT` / `INSERT` / `UPDATE` policies exist, no `DELETE` or `FOR ALL` policy exists, `validate_processing_consent` is attached, its function exists, and both expected indexes exist.
- Disposable authenticated Staging fixtures proved DB-authored insert/withdrawal timestamps despite spoof attempts, owner DELETE denial, User A/B read and mutation isolation, withdrawal immutability, retained history, and re-consent as a new current row. The same accept/withdraw/current semantics passed for `voice_cloning`. Fixture consent history was retained; no service-role cleanup was performed.
- The earlier fixed Staging BFF generation exposed `/api/mobile/scripts` but not the G5A consent routes. The clean local HEAD above was directly deployed only to the existing `native-minute-staging` Vercel project, and its fixed Staging alias resolved to the Ready artifact. The artifact route manifest contains the Mobile and Web consent routes plus Mobile evaluation. Vercel deployment metadata did not expose a Git revision, so source provenance is the clean, exact local HEAD at direct deploy time rather than a claimed remote metadata SHA.
- No-credential route probes reached JSON auth boundaries. A fresh disposable fixture then proved Mobile pronunciation missing -> accept -> withdraw -> re-consent, with missing/withdrawn evaluation stopped before provider work and accepted state advancing past the consent gate to safe recording validation. Its canonical contract and DB-authored timestamps matched. Existing fixture takes were retained across withdrawal.
- Mobile `voice_cloning` missing -> accept -> withdraw -> re-consent/current lookup passed without a clone request. Authenticated Web pronunciation status, withdrawal, and re-consent read and changed the same canonical history as Mobile. Consent response payloads contained only safe status data. OpenAI, Azure, and ElevenLabs calls were all zero for this proof.

## Validation

Passed on 2026-08-22:

- `npm run check:workspace`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run mobile:test` — 26 files / 261 tests
- `npm run mobile:lint`
- `npm run mobile:typecheck`
- `npm run check:mobile-release:self-test`
- `git diff --check`

External Staging proof additionally passed the normal migration history/dry-run/apply sequence, read-only catalog verification, authenticated DB smoke, fixed-alias route manifest check, and authenticated Mobile/Web application smoke. Source was not changed in those executions.

## G5A audit status after Staging application proof

- P0: 0
- P1: 0
- P2: 2
  - the Web `/api/create-voice` response still includes unnecessary internal voice-row information such as `provider_voice_id` and `sample_audio_path`;
  - the repository migration-contract test does not itself assert trigger attachment, although the actual Staging catalog proof did.

## Deliberately not implemented

- Account, voice, Storage, provider, DB, or Auth deletion.
- Voice asset cleanup or ElevenLabs delete.
- Retention/purge jobs.
- Final legal copy or Store privacy submissions.
- Mobile Settings navigation.

## Remaining human-required / unknown

- Final legal approval remains required for the interim product consent copy, Privacy Policy, and Terms.
- No provider retention assertion is made here.
- Production migration/apply has not occurred and remains out of scope.
- A final closeout review remains required; Gate 5 and Gate 5B do not advance automatically.
