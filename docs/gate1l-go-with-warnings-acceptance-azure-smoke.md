# Gate1l GO WITH WARNINGS Acceptance / Azure Live Smoke

Gate1l turns the Web beta `GO WITH WARNINGS` decision into an auditable release-candidate decision packet.

This document does not deploy, does not change production env, does not run Azure live smoke on behalf of a human tester, and does not run destructive account deletion.

## Current Decision

Current Web beta decision: `GO WITH WARNINGS`.

Reason:

- Final Human Check `BLOCKED` items are currently resolved.
- Azure Speech resource / region / pricing tier / Keys and Endpoint page / Metrics or Usage or Quotas-like page are confirmed without raw values.
- Remaining `WARN` items have explicit release-owner acceptance for small-cohort Web beta.
- Deploy / rollback / post-deploy smoke owners are recorded as app owner.
- Azure pronunciation live smoke is PASS from a human browser check.

Store submission remains blocked until account/data deletion completion is proven with a future disposable live proof.

## Remaining WARN Items

| WARN item | Current status | Required acceptance |
| --- | --- | --- |
| OpenAI dedicated project | Default project remains in use. | Accepted by release owner for small-cohort Web beta; dedicated project remains a later improvement. |
| OpenAI hard cap | Budget/alert visibility exists, but app-side stop is app-side limits plus kill switch operation. | Accepted by release owner for small-cohort Web beta. |
| ElevenLabs explicit alert | Usage/billing visibility exists, but explicit alert/notification setting is not confirmed. | Accepted by release owner with manual monitoring, app-side limits, cache reuse, and kill switch operation for small-cohort Web beta. |
| Legal/support draft clarity | Required information exists, but beta draft copy and formal legal review are not final. | Accepted by release owner for small-cohort Web beta only. |
| Post-confirmation Azure live smoke | Human browser smoke passed after the confirmed/upgraded Azure setup. | `PASS`. |

## GO WITH WARNINGS Acceptance Record

Fill this in Gate1i before deploy. Do not record raw ids, keys, endpoints, billing amounts, audio ids, take ids, signed URLs, transcripts, or raw provider responses.

| Field | Value |
| --- | --- |
| Release owner | `app owner` |
| Acceptance decision | `GO WITH WARNINGS` |
| Accepted WARN items | OpenAI Default project; OpenAI app-side limits plus kill switch hard stop; ElevenLabs manual monitoring / app-side limits / cache reuse / kill switch; legal/support Web beta draft clarity. |
| Acceptance reason | Small-cohort Web beta can proceed with app-owner monitoring, app-side limits, emergency kill switches, and Store-only account deletion blockers kept separate. |
| Mitigation owner | `app owner` |
| Next review date | before broader public launch / Store submission |
| Azure smoke handling | `fresh smoke PASS` |
| Legal/support handling | `beta draft accepted for small-cohort Web beta; clarity and formal review remain WARN before broader release` |
| Account deletion handling | `request-based + manual cleanup accepted for Web beta; disposable live proof remains Store-submission blocker` |
| Redaction check | `PASS` |

## Owner Record

Fill this in Gate1i before deploy.

| Role | Required before deploy | Value |
| --- | --- | --- |
| Release owner | yes | `app owner` |
| Deployer | yes | `app owner` |
| Rollback owner | yes | `app owner` |
| Incident owner | yes | `app owner` |
| Post-deploy smoke owner | yes | `app owner` |
| Provider monitoring owner | yes | `app owner` |
| Support / deletion owner | yes | `app owner` |

## Post-Confirmation Azure Pronunciation Live Smoke

Purpose: confirm the upgraded/visible Azure Speech setup still works through the Native Minute practice loop.

Do not paste raw audio, transcripts, keys, endpoints, resource ids, subscription ids, billing amounts, audio ids, take ids, signed URLs, or raw provider responses into docs.

### Setup

1. Use a production-like env with:
   - `TRANSCRIPTION_PROVIDER=openai`
   - `PRONUNCIATION_PROVIDER=azure`
   - `VOICE_PROVIDER=elevenlabs`
2. Run `npm run pronunciation:preflight`.
3. Start the app in the same env.
4. Use a disposable or approved beta test account.
5. Choose an existing safe practice script from `/scripts`.

### Smoke Steps

1. Open `/scripts/[id]/record`.
2. Record 30-60 seconds of clear English using browser microphone, or upload a non-sensitive wav / PCM file.
3. Submit evaluation.
4. Confirm `/scripts/[id]/review/[takeId]` loads.
5. Confirm the review shows:
   - non-empty transcript,
   - overall score,
   - pronunciation/fluency/rhythm-style score summary,
   - weak words or a safe empty-state,
   - short coaching summary.
6. Open `/progress`.
7. Confirm latest result appears.
8. Confirm no raw provider details, keys, endpoints, signed URLs, raw storage paths, raw audio, or raw transcript content are copied into proof docs.

### Result Criteria

| Result | Criteria |
| --- | --- |
| `PASS` | Preflight passes, evaluate completes, review/progress reflect the take, and no raw values are recorded. |
| `WARN` | Browser recording normalization fails but wav / PCM upload succeeds, or earlier Azure live smoke is accepted without a fresh post-confirmation run. |
| `BLOCKED` | Azure env/resource appears unavailable, quota/entitlement blocks evaluation, or the flow cannot reach review. |
| `FAIL` | Raw secret/provider data is exposed, cross-user data is visible, partial failed review/progress is persisted, or user-facing recovery is unsafe. |

## Gate1i Transfer

After Gate1l:

1. Copy the acceptance decision into Gate1i `GO WITH WARNINGS Acceptance Record`.
2. Copy owner names/roles into Gate1i release/deploy/rollback/smoke owner fields.
3. Copy Azure live smoke result into Gate1i Gate Proof Status or Remaining WARN items.
4. Keep Store submission account deletion proof as `BLOCKED for Store submission`.
5. Do not convert Web beta drafts into formal legal approval.

## Status

Gate1l records human acceptance and human Azure live smoke proof. No deploy was performed. No Azure live smoke was executed by Codex. No destructive account deletion was executed.
