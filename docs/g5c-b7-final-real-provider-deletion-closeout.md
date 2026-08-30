# G5C-B7 Final Real-provider Deletion Closeout

Recorded: 2026-08-30

Status: `CLOSED_COMMITTED_PASS`

Gate: `G5C_B7_DISPOSABLE_LIVE_DESTRUCTIVE_PROOF`

Independent final audit: `G5C_B7_FINAL_INDEPENDENT_CLOSEOUT_AUDIT_PASS`

## Purpose

This document is the final repository authority for the G5C-B7 disposable live destructive proof. It closes the exact sealed fixture after the real ElevenLabs deletion, approved manual provider-absence acceptance, canonical Storage and database cleanup, consent withdrawal, post-delete verification, and finalization all completed. It does not authorize another deletion or begin another Gate.

## Gate A Sealed Universe

Gate A reached `G5C_B7_GATE_A_DISPOSABLE_FIXTURE_READY_AND_SEALED` before destructive authorization. The approved universe was fixed as follows:

| Authority | Sealed value |
| --- | ---: |
| Provider targets | `1` |
| Storage targets | `3` |
| DB cleanup targets | `2` |
| Durable targets total | `6` |
| Current exact `voice_cloning` consent | `1` |
| Saved-model relation | `0` |
| Manual candidate | `0` |
| Cross-user relation | `0` |
| Retained account | `1` |
| Retained script | `1` |
| Target snapshot | `sealed` |
| Consent snapshot | `sealed` |
| Destructive mutation before approval | `0` |

No later step expanded or substituted this sealed target universe.

## Human Gate B Approvals

The destructive sequence was explicitly Human-authorized only after the Gate A entry contract passed for the sealed disposable fixture. When the real provider response did not satisfy the strict automatic absence contract, the subsequent Option D decision separately authorized acceptance of the bounded Human evidence without another provider GET or DELETE. That acceptance is recorded durably as `manual_provider_absence_accepted`.

These approvals applied only to the exact B7 sealed fixture and the approved recovery boundary. They are not reusable authorization for another fixture, operation, provider call, or Gate.

## Actual Provider Behavior and Option D

- One dedicated disposable ElevenLabs voice was created.
- The exact sealed provider target received one real DELETE. The DELETE returned HTTP `200` and succeeded.
- The pre-delete exact voice GET returned HTTP `200`.
- The post-delete exact voice GET returned HTTP `400`, and a later exact voice GET also returned HTTP `400`.
- Both post-delete responses carried the safe semantic tokens `detail.type=not_found` and `detail.code=voice_not_found`.
- The ElevenLabs Dashboard confirmed that the B7 voice was no longer present.

This was a live provider/documentation mismatch: the real provider deletion succeeded and the voice was absent, but the non-`404` response could not satisfy the production adapter's strict automatic absence authority. Option D therefore accepted the combined bounded Human evidence and moved only the sealed provider target to durable `verified_absent` with audit marker `manual_provider_absence_accepted`.

Forward-only migration `0021_g5c_b7_manual_provider_absence_acceptance.sql` supplies that audit/recovery boundary and was applied to canonical Staging only.

### Automatic contract remains unchanged

Automatic provider absence still requires the exact conjunction `HTTP 404 AND detail.type=not_found AND detail.code=voice_not_found`.

G5C-B7 does **not** claim an automatic strict provider-absence PASS. The live mismatch was not used to weaken or broaden automatic production semantics.

## Final Deletion Results

### Provider

- Provider targets: `1/1 verified_absent`.
- Real DELETE attempts: `1`.
- Durable provider verification attempts: `1`.
- Acceptance authority: approved Option D Human evidence.

### Storage

| Sealed target | Durable result | Actual state | Delete attempts | Verification attempts |
| --- | --- | --- | ---: | ---: |
| `SCRIPT_AUDIO_CACHE` | `verified_absent` | absent | `1` | `1` |
| `VOICE_SAMPLE` | `verified_absent` | absent | `1` | `1` |
| `CONSENT_RECORDING` | `verified_absent` | absent | `1` | `1` |

Storage finished `3/3 durable verified_absent` and `3/3 actually absent`. Non-sealed Storage mutation was `0`.

### Database

- Script-audio relation: `1 -> 0`.
- Voice binding: `1 -> 0`.
- Saved-model relation: `0 -> 0`.
- Cleanup used only the canonical atomic database cleanup boundary.

### Consent and retained data

- Active exact `voice_cloning` consent: `0`.
- Withdrawn exact processing-consent history: retained.
- Legacy/historical consent: retained.
- Account: `1` retained.
- Profile: `1` retained.
- Script: `1` retained.
- Learning history and other required retained data: intact.
- Cross-user mutation: `0`.

## Verification, Finalizer, and Scrub

- Post-delete verification: `succeeded`; attempt count `1`.
- Finalizer: executed exactly once in its separate boundary.
- Final operation: `completed / completed`.
- `completed_at`: set.
- Target locators: `6/6 scrubbed`.
- Sensitive snapshot: scrubbed.
- Audit expiry: `completed_at + 90 days`.
- Required audit evidence: retained.

## Execution-authorization Incident

Incident: `EXECUTION_AUTHORIZATION_CONTROL_BREACH`.

During the B7 evidence protocol, Human authorization was limited to one consent-recording verification advance. Refreshing `/settings/voice-data` invoked the existing bounded user-visible batch and issued three additional canonical advances:

1. `storage_cleanup -> database_cleanup`;
2. canonical atomic database cleanup; and
3. `database_cleanup -> post_delete_verification`.

Independent reconciliation proved that all three transitions were canonical, every mutation remained inside the exact sealed B7 universe, Storage and database state were correct, retained data remained intact, and cross-user mutation was `0`. Rollback or recreation was not required.

Final classification: `TEST_PROTOCOL_ONLY_INCIDENT`.

This is a historical closed protocol P1, not an unresolved product-control defect and not data corruption. The product behavior had already been accepted in B5/B6 as GET-first plus at most three one-step POSTs per user-visible batch. The stricter one-advance-at-a-time constraint belonged only to the B7 evidence protocol. UI batching behavior is unchanged by this closeout.

## Findings and Remaining Unknowns

- P0: `0`.
- Unresolved correctness P1: `0`.
- Historical closed protocol P1: `1` (`EXECUTION_AUTHORIZATION_CONTROL_BREACH`, classified `TEST_PROTOCOL_ONLY_INCIDENT`).
- P2: `2`, both non-blocking cleanup-candidate internal surfaces.
- Remaining UNKNOWN: `0`.

Product data/deletion correctness is `PASS`, and B7 closeability is `YES`.

## Internal-surface Disposition

| Surface | Final disposition |
| --- | --- |
| Provider ownership probe | Candidate for later cleanup; retained in this closeout |
| Manual provider recovery diagnostic | Candidate for later cleanup; retained in this closeout |
| Option D acceptance boundary | Must remain for audit/recovery |
| Migration `0021` RPC | Must remain for audit/recovery |

No cleanup or removal of these surfaces was started.

## Exact Final Authority State

- Independent audit: `G5C_B7_FINAL_INDEPENDENT_CLOSEOUT_AUDIT_PASS`.
- B7 closeability: `YES`.
- Product data/deletion correctness: `PASS`.
- Final operation: `completed / completed`.
- G5C-B7 repository status: `CLOSED_COMMITTED_PASS`.
- P0: `0`.
- Unresolved correctness P1: `0`.
- Historical closed protocol P1: `1`.
- P2: `2` non-blocking cleanup-candidate internal surfaces.
- Remaining UNKNOWN: `0`.

Next single action: reconcile Gate 5 overall closeability and identify the next critical-path Gate from the latest Human Decisions and canonical plan. Do not start that Gate as part of this closeout.
