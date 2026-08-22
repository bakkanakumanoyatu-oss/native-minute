# G5A Canonical Recording and Voice Consent Foundation

Status: `IMPLEMENTED_VALIDATED`

Scope: G5A consent foundation only. Gate 5 as a whole is not closed.

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

The repository has no migration apply or schema-validation command for an external Supabase project. The migration was statically reviewed and the generated Database types are covered by root typecheck; applying it to an external database is intentionally not part of this task.

## G5A candidate issues

- P0: 0
- P1: 0
- P2: 0

## Deliberately not implemented

- Account, voice, Storage, provider, DB, or Auth deletion.
- Voice asset cleanup or ElevenLabs delete.
- Retention/purge jobs.
- Final legal copy or Store privacy submissions.
- Mobile Settings navigation.

## Remaining human-required / unknown

- Final legal approval remains required for the interim product consent copy, Privacy Policy, and Terms.
- No provider retention assertion is made here.
- The migration is repository-ready but has not been applied to an external Supabase project by this task.
