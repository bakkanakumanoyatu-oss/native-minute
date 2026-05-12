# RR-3n Fake-Only Proof Log Generation / Final Operator Rehearsal

RR-3n adds a fake-only rehearsal path for future disposable-account destructive proof.

This document and the rehearsal script do **not** authorize destructive cleanup. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` for RR-3n checks. Do not call ElevenLabs delete, Supabase Storage delete, DB cleanup/anonymize, or Supabase Auth deletion.

## Scope

RR-3n covers:

- fake-only proof log generation,
- final operator rehearsal for provider -> Storage -> DB -> Auth -> completion,
- safe proof output fields that can be copied into the RR-3f proof template,
- self-test coverage for raw-data-free output,
- documentation of the difference between fake rehearsal and real disposable proof.

RR-3n does not cover:

- real destructive deletion,
- destructive guard enablement,
- real cleanup service connection,
- disposable account deletion,
- public UI/API,
- admin UI,
- DB schema / migration changes,
- RLS policy changes.

## Script

RR-3n adds:

```bash
npm run account-deletion:operator:rehearsal
npm run account-deletion:operator:rehearsal:self-test
```

The rehearsal command emits safe JSON by default:

```bash
npm run account-deletion:operator:rehearsal -- \
  --format json \
  --operator-marker operator \
  --reviewer-marker reviewer \
  --approver-marker approver \
  --env-label local \
  --proof-template rr-3f
```

Markdown output is also available:

```bash
npm run account-deletion:operator:rehearsal -- --format markdown
```

Markers are recorded only as `provided_not_echoed` or `not_provided`. The runner never echoes operator names, emails, environment ids, proof paths, request refs, user ids, or provider/storage/auth identifiers.

## Fake-Only Proof Log Fields

Allowed output:

- `checkedAt`,
- `mode=fake_only`,
- `overallDecision`,
- `safeReasonCode`,
- operator / reviewer / approver / environment / proof-template marker status,
- `proofMarker`,
- stage order,
- stage decision,
- stage status,
- safe counts,
- safe reason code,
- next action,
- safety booleans showing real cleanup was not called.

Forbidden output:

- raw user id,
- email,
- deletion request id,
- raw request ref,
- provider voice id,
- storage path,
- object key,
- signed URL,
- DB row id,
- transcript,
- script body,
- token,
- service-role key,
- raw provider response,
- billing/account/project/resource ids.

## Rehearsal Stage Sequence

The rehearsal bundles the full fake sequence for operator practice:

1. Provider cleanup.
2. Storage cleanup.
3. DB cleanup / anonymize.
4. Supabase Auth deletion.
5. Completion tracking.

This bundled sequence is fake-only. Real destructive execution remains one stage per invocation with proof review between stages.

## Guard Behavior

The rehearsal returns `BLOCKED` if `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` is present. This prevents accidentally treating a destructive environment as a safe rehearsal environment.

The rehearsal does not import or call RR-3b / RR-3c / RR-3d / RR-3e actual cleanup services.

## Fake-Only vs Real Destructive Proof

| Area | Fake-only rehearsal | Future real disposable proof |
| --- | --- | --- |
| Account target | None | Disposable account only |
| Request lookup | None | Server-side resolver / safe markers |
| Stage execution | Fake bundled sequence | One stage per invocation |
| Destructive guard | Must be off | Must be explicitly enabled |
| Provider/Storage/DB/Auth cleanup | Not called | Called one stage at a time after approval |
| Proof value | Operator rehearsal / template dry run | Store-readiness proof |
| Raw data | Never recorded | Never recorded |

Fake-only `PASS` means the operator rehearsal output is safe to copy into a practice proof. It does not mean the product is ready for destructive proof or Store submission.

## Self-Test Coverage

`npm run account-deletion:operator:rehearsal:self-test` verifies:

- fake-only proof log returns `PASS` when the destructive guard is disabled,
- provider -> Storage -> DB -> Auth -> completion stage order is present,
- real execution policy remains one stage per invocation,
- operator / reviewer / approver / environment / proof markers are not echoed,
- JSON and markdown output are raw-data-free,
- rehearsal returns `BLOCKED` if the destructive guard is enabled,
- unknown arguments are blocked,
- no provider / Storage / DB / Auth cleanup service is called.

## RR-3n Status

RR-3n is fake-only rehearsal implementation.

No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup service was connected or executed. No disposable account was deleted.

## RR-3o Follow-Up

RR-3o assembles a fake-only sample proof package from this rehearsal shape:

- `docs/rr-3o-sample-disposable-proof-package.md` maps rehearsal fields to the RR-3f proof template.
- `npm run account-deletion:proof-package:self-test` verifies the sample package is fake-only and contains no raw-looking identifiers or secrets.
- The sample package is rehearsal evidence only and must not be treated as a real disposable-account destructive proof.
