# Gate1k Web Beta Final No-Go Checklist

Gate1k is the final human-check execution packet before deciding whether Native Minute can move to Web beta / small cohort.

This document does not execute the checks. It does not deploy, does not change production environment, does not perform dashboard operations, and does not run destructive account deletion.

Current Web beta decision after the 2026-05-11 Gate1l owner acceptance and Azure live smoke update: `GO WITH WARNINGS`.

Primary blocker status: no Final Human Check `BLOCKED` item is currently recorded for Web beta. Remaining `WARN` items are accepted by the release owner for small-cohort Web beta, deploy / rollback / post-deploy smoke ownership is app owner, and Store-only account deletion blockers remain separate.

## Scope

Gate1k consolidates:

- Human Check Backlog,
- Gate1b Supabase / Storage / RLS / protected replay proof,
- Gate1g provider budget / kill switch proof,
- Gate1h deploy / rollback / post-deploy smoke runbook,
- Gate1i release candidate proof / deploy log template,
- Gate1j final human-check batch runbook,
- Gate1l GO WITH WARNINGS acceptance / Azure live smoke checklist,
- RR-3 account deletion actual-path preparation and future disposable proof templates.

Out of scope:

- production deploy,
- dashboard / billing / legal / support / SLA decisions,
- destructive account deletion,
- destructive guard enablement,
- disposable account creation or deletion,
- provider / Storage / DB / Auth real cleanup,
- DB schema / migration changes,
- RLS policy changes,
- public deletion UI/API,
- Capacitor / store metadata.

## Provider Roles

- ElevenLabs: voice provider / voice clone / model audio generation.
- OpenAI: transcription / Script Studio generation / coaching-adjacent generation.
- Azure: pronunciation evaluator.
- Supabase Storage: `recordings`, `script-audios`, `voice-samples`, `voice-consents`.

## Final No-Go Checklist

| Area | Source doc | Required before Web beta GO | Current handling | Record result in |
| --- | --- | --- | --- | --- |
| Human Check Backlog overall | `docs/human-check-backlog.md` | All `BLOCKED` items resolved or explicitly accepted by release owner with fallback. | 2026-05-11 Gate1l update recorded; no Web beta Human Check `BLOCKED` item remains. Release decision is `GO WITH WARNINGS`. | Human Check Backlog; Gate1i |
| Azure Speech visibility | Gate1g / Gate1j | Speech resource, region, quota, usage visibility confirmed without raw ids. | `PASS`: Speech resource visibility, region/resource confirmation, pricing tier visibility, Keys and Endpoint page visibility, Metrics / Usage / Quotas-like visibility, subscription, Cost Management, upgrade, and kill switch are confirmed. | Gate1g proof; Human Check Backlog |
| OpenAI dedicated project | Gate1g / Gate1j | Dedicated project confirmed or Default project accepted for small cohort. | `WARN accepted`: Default project remains in use and is accepted for small-cohort Web beta. | Gate1g proof; Human Check Backlog |
| OpenAI budget / alert | Gate1g / Gate1j | Budget/alert or manual monitoring owner confirmed. | `WARN accepted`: limits, budget, alerts, thresholds, and rate limits are visible; app-side limits plus kill switch operations are accepted for small-cohort Web beta. | Gate1g proof; Human Check Backlog |
| ElevenLabs alert / usage check | Gate1g / Gate1j | Explicit alert or manual monitoring owner confirmed. | `WARN accepted`: usage, credits, billing, auto recharge, analytics, and successful request visibility are confirmed; explicit alert/notification setting is not confirmed, with app-side limits / cache reuse / manual monitoring / kill switch accepted for Web beta. | Gate1g proof; Human Check Backlog |
| Supabase Storage usage / egress | Gate1g / Gate1j | Usage/egress visibility or accepted manual monitoring confirmed. | `PASS`: required buckets, usage, egress / cached egress, plan / billing cycle, upload kill switch, and Gate1b protected replay proof are confirmed. | Gate1g proof; Human Check Backlog |
| Support contact | Gate1f / Gate1j | Public support contact and owner confirmed. | `PASS`: Web beta support contact is `bakkanakuma@gmail.com`. | Human Check Backlog; Gate1i; support route follow-up if needed |
| Account deletion SLA | Gate1f / Gate1j | First-response target, completion target, and manual cleanup owner confirmed. | `PASS`: first response target is 3 business days; completion target is 30 days; manual cleanup owner is app owner. | Human Check Backlog; Gate1i |
| Privacy / Terms / Support drafts | Gate1e / Gate1j | Draft pages reviewed against current implementation and provider roles. | `WARN`: required information mostly exists, but deletion SLA visibility and copy clarity needed improvement; formal legal review remains incomplete. | Human Check Backlog; Gate1i |
| Azure pronunciation live smoke | Provider readiness / Gate1h | A production-like `record -> evaluate -> review` smoke is accepted for the confirmed Azure setup. | `PASS`: human browser smoke confirmed `record -> evaluate -> review -> progress`, score, weak words, coach / next step, latest progress reflection, and no error screen. | Gate1i; provider readiness notes |
| Gate1b protected replay | Gate1b proof | Own replay works; cross-user replay denied. | `PASS` recorded; recheck after deploy as regression. | Gate1b proof; Gate1i |
| Production preflight | Gate1a / Gate1h / Gate1i | `npm run production:preflight` passes for target env without secret output. | Run before RC decision. | Gate1i |
| Supabase Storage/RLS check | Gate1b / Gate1h / Gate1i | `npm run supabase:storage-rls:check` passes; manual items handled separately. | Run before RC decision. | Gate1b proof; Gate1i |
| Provider preflights | Gate1h / Gate1i | `voice:preflight` and `pronunciation:preflight` pass or produce accepted warning with owner. | Run before RC decision. | Gate1i |
| Account deletion self-tests | RR-3f through RR-3r | Guarded boundaries and fake proof tooling pass. | Run before RC decision. | Gate1i; RR proof docs |
| RR-3 disposable proof | RR-3r | Store submission requires disposable live proof. Web beta can proceed only if request-based + manual cleanup is accepted. | Real proof not executed; Store remains blocked. | Gate1i; RR-3r future template |
| Web beta deploy runbook | Gate1h | Rollback target, deploy owner, incident owner, smoke owner known. | Owner fields are recorded as app owner; real deploy still not performed. | Gate1i deploy log |
| GO WITH WARNINGS acceptance | Gate1l / Gate1i | Release owner accepts remaining WARNs with reason, mitigation, owner, and next review date. | `PASS`: release owner accepted remaining WARNs for small-cohort Web beta. | Gate1i acceptance record |
| Rollback owner | Gate1h / Gate1i | Named owner and rollback target recorded. | `PASS`: app owner. | Gate1i |
| Post-deploy smoke owner | Gate1h / Gate1i | Named owner for auth, main loop, protected replay, legal/support page smoke. | `PASS`: app owner. | Gate1i |

## Human-Check Batch Execution Order

Run these as one final batch. Do not split the release decision from the proof updates.

1. Confirm redaction rules and make sure no raw values are being pasted into docs.
2. Run local non-destructive commands:
   - `npm run lint`
   - `npm run build`
   - `npm run typecheck`
   - `npm run account-deletion:provider-cleanup:self-test`
   - `npm run account-deletion:storage-cleanup:self-test`
   - `npm run account-deletion:database-cleanup:self-test`
   - `npm run account-deletion:auth-cleanup:self-test`
   - `npm run account-deletion:operator:self-test`
   - `npm run account-deletion:operator:rehearsal:self-test`
   - `npm run account-deletion:proof-package:self-test`
   - `npm run production:preflight`
   - `npm run supabase:storage-rls:check`
   - `npm run voice:preflight`
   - `npm run pronunciation:preflight`
3. Review Gate1b proof and confirm whether a post-deploy protected replay regression will be required.
4. Review recorded provider dashboard checks:
   - Azure Speech resource / region / quota / usage visibility.
   - OpenAI project separation and budget / alert.
   - ElevenLabs alert / notification or manual monitoring.
   - Supabase Storage usage / egress visibility.
5. Confirm support contact and response owner remain valid.
6. Confirm account deletion SLA and manual cleanup owner remain valid.
7. Review `/privacy`, `/terms`, `/support`, and `/support/account-deletion` beta draft pages; keep current result as `WARN` until copy clarity and formal review are complete.
8. Review RR-3 account deletion state:
   - real destructive deletion is not executed,
   - Store submission remains blocked until disposable live proof,
   - Web beta request-based + support/manual cleanup is accepted or blocked.
9. Update `docs/human-check-backlog.md`.
10. Update `docs/gate1g-provider-budget-kill-switch-proof-template.md`.
11. Fill the release candidate proof section in `docs/gate1i-web-beta-release-candidate-proof-template.md`.
12. Confirm Gate1l acceptance fields in Gate1i remain accurate if the decision is `GO WITH WARNINGS`.
13. Confirm deploy / rollback / post-deploy smoke owners in Gate1i.
14. Decide whether to deploy the `GO WITH WARNINGS` Web beta release candidate.

## GO / GO WITH WARNINGS / BLOCKED / FAIL

### GO

Use `GO` only when:

- all automated checks pass,
- Gate1b protected replay proof remains acceptable,
- all Human Check Backlog `BLOCKED` items are resolved,
- remaining `WARN` items are either resolved or accepted with owner and fallback,
- support contact and account deletion SLA are confirmed,
- legal/support draft review is accepted for Web beta,
- Gate1h deploy / rollback / smoke owners are assigned,
- destructive account deletion env is off,
- RR-3 disposable live proof is correctly marked as Store-submission blocker, not Web beta PASS.

### GO WITH WARNINGS

Use `GO WITH WARNINGS` only when:

- no unresolved `FAIL` exists,
- any remaining `BLOCKED` item is explicitly accepted by the human release owner for private beta only,
- each accepted blocker has a fallback owner, mitigation, and next review date,
- remaining `WARN` items do not hide cost, privacy, support, auth, ownership, or account deletion risk,
- Gate1i records the exception clearly.

Current Web beta state uses this decision: remaining provider/legal `WARN` items are accepted for a small cohort with app-owner monitoring and fallback. This does not make Store submission ready.

### BLOCKED

Use `BLOCKED` when:

- Azure Speech resource / region / quota / usage visibility regresses or cannot be confirmed,
- Azure pay-as-you-go upgrade / Speech resource creation decision regresses or cannot be confirmed,
- support contact is missing,
- account deletion SLA / manual cleanup owner is missing,
- privacy / terms / support / deletion drafts contradict implementation or lack required review,
- production preflight or provider preflight is blocked,
- Supabase Storage/RLS checker is blocked,
- rollback owner or post-deploy smoke owner is missing,
- Human Check Backlog still has unresolved `BLOCKED` items that the release owner has not accepted,
- destructive account deletion status is misrepresented as complete.

### FAIL

Use `FAIL` when:

- any automated check fails in a way that affects the release candidate,
- protected replay leaks cross-user audio,
- auth login/callback/logout fails in production-like smoke,
- partial review/progress persists on provider failure,
- secrets, raw ids, signed URLs, raw audio, or raw provider responses are recorded,
- a real destructive cleanup runs unintentionally,
- DB schema / RLS / bucket settings are changed during the final batch.

## What To Record

Allowed:

- `PASS / WARN / BLOCKED / FAIL`,
- checked date/time,
- reviewer role or safe marker,
- commit short ref,
- provider names,
- launch mode,
- route names,
- command names and pass/fail result,
- safe counts,
- safe reason codes,
- owner roles,
- fallback description,
- next action.

## Never Record Raw Data

Never record:

- API keys,
- auth headers,
- service role keys,
- session tokens,
- secret env values,
- billing amounts,
- invoices,
- account ids,
- subscription ids,
- project ids,
- resource ids,
- signed URLs,
- raw storage paths,
- object keys,
- raw user ids,
- private email addresses unless approved for publication as support contact,
- audio ids,
- take ids,
- raw audio,
- provider request / response bodies,
- provider voice ids,
- transcripts,
- script text,
- generated draft full text.

## Gate1i Transfer

After the batch:

1. Copy the overall Human Check Backlog status into Gate1i.
2. Copy provider budget / kill switch results into Gate1i Gate Proof Status.
3. Reference Gate1b protected replay proof as `PASS` without raw ids.
4. Record automated command results in Gate1i Automated Pre-Deploy Checks.
5. Record rollback owner, incident owner, and post-deploy smoke owner.
6. Record remaining WARN / BLOCKED items with safe labels only.
7. Set the release decision:
   - `GO`,
   - `GO WITH WARNINGS`,
   - `BLOCKED`,
   - or `FAIL`.

Do not deploy when Gate1i remains `BLOCKED` or `FAIL`.

## RR-3 Disposable Proof Relationship

RR-3b through RR-3r provide guarded boundaries, self-tests, operator CLI, fake rehearsal, sample proof package, fixture checklist, final non-destructive evidence flow, and a future live-proof empty template.

For Web beta / small cohort:

- request-based deletion + support/manual cleanup may be accepted only if support contact and SLA are explicit,
- real destructive deletion remains unexecuted,
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` must stay off,
- disposable live proof is not required for a tightly controlled Web beta if the release owner accepts manual cleanup.

For Store submission:

- disposable live proof remains a blocker,
- account/data deletion completion must be proven,
- RR-3r should be copied and filled only during an approved future disposable proof,
- raw data must remain out of the proof package.

## Gate1k Status

Gate1k is docs-only.

The 2026-05-10 final human-check batch, Azure update, and 2026-05-11 Gate1l owner acceptance / Azure live smoke update are recorded. Web beta is now `GO WITH WARNINGS`, not full `GO`. No deploy was performed. No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup was executed. No DB schema / migration / RLS policy was changed.
